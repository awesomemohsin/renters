import type { ClientSession } from 'mongoose'
import mongoose from 'mongoose'
import { roundMoney } from '@/lib/electricity-calculations'
import { MonthlyBill, type MonthlyBillDocument } from '@/models/monthly-bill'
import {
  MonthlyElectricityAllocation,
  MonthlyElectricityCycle,
} from '@/models/monthly-electricity-allocation'
import { Payment } from '@/models/payment'
import { Resident } from '@/models/resident'
import { Room } from '@/models/room'
import { WiFiConfiguration } from '@/models/wifi-configuration'

export function toPaisa(amount: number): number {
  return Math.round((Number(amount || 0) + Number.EPSILON) * 100)
}

export function fromPaisa(paisa: number): number {
  return Math.round(paisa) / 100
}

let billingCollectionsInitialized = false

export async function ensureBillingCollectionsExist() {
  if (billingCollectionsInitialized) return
  try {
    await MonthlyBill.createCollection().catch(() => {})
    await Payment.createCollection().catch(() => {})
    await MonthlyBill.init().catch(() => {})
    await Payment.init().catch(() => {})
    billingCollectionsInitialized = true
  } catch {
    // Ignore if already exists
  }
}

export type CategoryCapsAndUnpaid = {
  totalAdditionalCharges: number
  totalPositiveAdjustments: number
  totalDiscounts: number
  totalNegativeAdjustments: number
  currentMonthTotal: number
  rentCap: number
  electricityCap: number
  wifiCap: number
  otherCap: number
  unpaidRent: number
  unpaidElectricity: number
  unpaidWifi: number
  unpaidOther: number
  currentMonthPaid: number
  currentMonthUnpaid: number
}

export function computeBillCategoryState(bill: {
  monthlyRent: number
  totalElectricity: number
  wifiCharge: number
  additionalCharges?: { amount: number }[]
  adjustments?: { amount: number; type: 'discount' | 'positive' | 'negative' }[]
  rentPaid?: number
  electricityPaid?: number
  wifiPaid?: number
  otherChargesPaid?: number
}): CategoryCapsAndUnpaid {
  const additionalCharges = bill.additionalCharges ?? []
  const adjustments = bill.adjustments ?? []

  const totalAdditionalPaisa = additionalCharges.reduce(
    (sum, item) => sum + toPaisa(item.amount),
    0,
  )
  const totalPositivePaisa = adjustments
    .filter((item) => item.type === 'positive')
    .reduce((sum, item) => sum + toPaisa(item.amount), 0)
  const totalDiscountsPaisa = adjustments
    .filter((item) => item.type === 'discount')
    .reduce((sum, item) => sum + toPaisa(item.amount), 0)
  const totalNegativePaisa = adjustments
    .filter((item) => item.type === 'negative')
    .reduce((sum, item) => sum + toPaisa(item.amount), 0)

  let rentCapPaisa = toPaisa(bill.monthlyRent)
  let elecCapPaisa = toPaisa(bill.totalElectricity)
  let wifiCapPaisa = toPaisa(bill.wifiCharge)
  let otherCapPaisa = totalAdditionalPaisa + totalPositivePaisa

  let deductionsRemaining = totalDiscountsPaisa + totalNegativePaisa

  // Apply discounts/negative adjustments to otherCharges first, then rent, then wifi, then electricity
  const reduceFromOther = Math.min(otherCapPaisa, deductionsRemaining)
  otherCapPaisa -= reduceFromOther
  deductionsRemaining -= reduceFromOther

  const reduceFromRent = Math.min(rentCapPaisa, deductionsRemaining)
  rentCapPaisa -= reduceFromRent
  deductionsRemaining -= reduceFromRent

  const reduceFromWifi = Math.min(wifiCapPaisa, deductionsRemaining)
  wifiCapPaisa -= reduceFromWifi
  deductionsRemaining -= reduceFromWifi

  const reduceFromElec = Math.min(elecCapPaisa, deductionsRemaining)
  elecCapPaisa -= reduceFromElec
  deductionsRemaining -= reduceFromElec

  const currentMonthTotalPaisa =
    rentCapPaisa + elecCapPaisa + wifiCapPaisa + otherCapPaisa

  const rentPaidPaisa = toPaisa(bill.rentPaid ?? 0)
  const elecPaidPaisa = toPaisa(bill.electricityPaid ?? 0)
  const wifiPaidPaisa = toPaisa(bill.wifiPaid ?? 0)
  const otherPaidPaisa = toPaisa(bill.otherChargesPaid ?? 0)

  const unpaidRentPaisa = Math.max(0, rentCapPaisa - rentPaidPaisa)
  const unpaidElecPaisa = Math.max(0, elecCapPaisa - elecPaidPaisa)
  const unpaidWifiPaisa = Math.max(0, wifiCapPaisa - wifiPaidPaisa)
  const unpaidOtherPaisa = Math.max(0, otherCapPaisa - otherPaidPaisa)

  const currentMonthPaidPaisa =
    rentPaidPaisa + elecPaidPaisa + wifiPaidPaisa + otherPaidPaisa
  const currentMonthUnpaidPaisa =
    unpaidRentPaisa + unpaidElecPaisa + unpaidWifiPaisa + unpaidOtherPaisa

  return {
    totalAdditionalCharges: fromPaisa(totalAdditionalPaisa),
    totalPositiveAdjustments: fromPaisa(totalPositivePaisa),
    totalDiscounts: fromPaisa(totalDiscountsPaisa),
    totalNegativeAdjustments: fromPaisa(totalNegativePaisa),
    currentMonthTotal: fromPaisa(currentMonthTotalPaisa),
    rentCap: fromPaisa(rentCapPaisa),
    electricityCap: fromPaisa(elecCapPaisa),
    wifiCap: fromPaisa(wifiCapPaisa),
    otherCap: fromPaisa(otherCapPaisa),
    unpaidRent: fromPaisa(unpaidRentPaisa),
    unpaidElectricity: fromPaisa(unpaidElecPaisa),
    unpaidWifi: fromPaisa(unpaidWifiPaisa),
    unpaidOther: fromPaisa(unpaidOtherPaisa),
    currentMonthPaid: fromPaisa(currentMonthPaidPaisa),
    currentMonthUnpaid: fromPaisa(currentMonthUnpaidPaisa),
  }
}

export async function recalculateResidentBillChain(
  residentId: string | mongoose.Types.ObjectId,
  session?: ClientSession,
) {
  const sessionOpt = session ? { session } : {}
  const bills = await MonthlyBill.find({ residentId })
    .sort({ billingMonth: 1 })
    .session(session ?? null)

  const priorTrackers: {
    bill: MonthlyBillDocument
    state: CategoryCapsAndUnpaid
  }[] = []

  for (const bill of bills) {
    const state = computeBillCategoryState(bill)

    bill.totalAdditionalCharges = state.totalAdditionalCharges
    bill.totalPositiveAdjustments = state.totalPositiveAdjustments
    bill.totalDiscounts = state.totalDiscounts
    bill.totalNegativeAdjustments = state.totalNegativeAdjustments
    bill.currentMonthTotal = state.currentMonthTotal
    bill.currentMonthPaid = state.currentMonthPaid
    bill.currentMonthUnpaid = state.currentMonthUnpaid

    const breakdown = priorTrackers
      .filter((p) => toPaisa(p.state.currentMonthUnpaid) > 0)
      .map((p) => ({
        billId: p.bill._id,
        billingMonth: p.bill.billingMonth,
        unpaidRent: p.state.unpaidRent,
        unpaidElectricity: p.state.unpaidElectricity,
        unpaidWifi: p.state.unpaidWifi,
        unpaidOther: p.state.unpaidOther,
        unpaidTotal: p.state.currentMonthUnpaid,
      }))

    const stillUnpaidPriorPaisa = breakdown.reduce(
      (sum, item) => sum + toPaisa(item.unpaidTotal),
      0,
    )
    const prevPaidInThisBillPaisa = toPaisa(bill.previousOutstandingPaid ?? 0)
    const previousOutstandingPaisa = stillUnpaidPriorPaisa + prevPaidInThisBillPaisa

    bill.previousOutstandingBreakdown = breakdown as unknown as typeof bill.previousOutstandingBreakdown
    bill.previousOutstanding = fromPaisa(previousOutstandingPaisa)

    const totalPayablePaisa = toPaisa(state.currentMonthTotal) + previousOutstandingPaisa
    const totalPaidPaisa = toPaisa(state.currentMonthPaid) + prevPaidInThisBillPaisa
    const remainingDuePaisa = Math.max(0, totalPayablePaisa - totalPaidPaisa)

    bill.totalPayable = fromPaisa(totalPayablePaisa)
    bill.totalPaid = fromPaisa(totalPaidPaisa)
    bill.remainingDue = fromPaisa(remainingDuePaisa)

    if (remainingDuePaisa === 0) {
      bill.status = 'paid'
    } else if (totalPaidPaisa > 0) {
      bill.status = 'partially_paid'
    } else {
      bill.status = 'unpaid'
    }

    await bill.save(sessionOpt)

    priorTrackers.push({ bill, state })
  }
}

export async function getMonthlyBillingWorkspace(billingMonth: string) {
  const [
    activeResidents,
    allRooms,
    billsForMonth,
    priorBills,
    electricityCycle,
    electricityAllocations,
    paymentsForMonth,
    billMonths,
    activeWifiConfigs,
  ] = await Promise.all([
    Resident.find({ status: 'active' }).populate('roomId').sort({ createdAt: -1 }).lean(),
    Room.find().sort({ roomNumber: 1 }).lean(),
    MonthlyBill.find({ billingMonth }).sort({ roomNumber: 1 }).lean(),
    MonthlyBill.find({ billingMonth: { $lt: billingMonth } })
      .sort({ billingMonth: 1 })
      .lean(),
    MonthlyElectricityCycle.findOne({ billingMonth }).lean(),
    MonthlyElectricityAllocation.find({ billingMonth }).lean(),
    Payment.find({ billingMonth }).sort({ createdAt: -1 }).lean(),
    MonthlyBill.distinct('billingMonth'),
    WiFiConfiguration.find({ status: 'active' }).lean(),
  ])

  const activeWifiConfigByResidentId = new Map<string, { monthlyCharge: number }>(
    (activeWifiConfigs as Array<{ residentId: unknown; monthlyCharge: number }> ?? []).map((w) => [
      String(w.residentId),
      w,
    ]),
  )

  const allocByRoomId = new Map(
    electricityAllocations.map((a) => [String(a.roomId), a]),
  )
  const billByResidentId = new Map(
    billsForMonth.map((b) => [String(b.residentId), b]),
  )

  // Group prior unpaid bills by residentId
  const priorUnpaidByResidentId = new Map<string, number>()
  for (const pBill of priorBills) {
    const key = String(pBill.residentId)
    const prev = priorUnpaidByResidentId.get(key) ?? 0
    priorUnpaidByResidentId.set(
      key,
      fromPaisa(toPaisa(prev) + toPaisa(pBill.currentMonthUnpaid ?? 0)),
    )
  }

  const isElectricityFinalized = electricityCycle?.status === 'finalized'
  const generationWarnings: string[] = []

  if (!isElectricityFinalized) {
    generationWarnings.push(
      `Monthly electricity calculations for ${billingMonth} are not finalized yet. Finalize electricity on the Utilities page before generating bills to include verified electricity shares.`,
    )
  }

  const residentsPreview = activeResidents
    .map((res) => {
      const roomObj = res.roomId as unknown as {
        _id: mongoose.Types.ObjectId
        roomNumber: number
        floor: number
      } | null
      const roomIdStr = roomObj ? String(roomObj._id) : ''
      const roomNumber = roomObj?.roomNumber ?? 0
      const floor = roomObj?.floor ?? 0

      const existingBill = billByResidentId.get(String(res._id)) ?? null
      const alloc = roomIdStr ? allocByRoomId.get(roomIdStr) : null
      const hasFinalizedAllocation = Boolean(alloc && alloc.status === 'finalized')

      const mainMeterShare = alloc ? alloc.mainMeterShare : 0
      const additionalCharge = alloc ? alloc.additionalCharge : 0
      const totalElectricity = alloc ? alloc.finalElectricityAmount : 0
      const activeWifi = activeWifiConfigByResidentId.get(String(res._id))
      const wifiCharge = activeWifi ? activeWifi.monthlyCharge : 0
      const previousOutstanding = priorUnpaidByResidentId.get(String(res._id)) ?? 0
      const estimatedTotalPayable = roundMoney(
        res.monthlyRent + totalElectricity + wifiCharge + previousOutstanding,
      )

      const missingDataWarnings: string[] = []
      if (!roomObj) {
        missingDataWarnings.push('Resident has no assigned room.')
      } else if (!alloc) {
        missingDataWarnings.push(
          `Room ${String(roomNumber).padStart(2, '0')} has no electricity allocation for ${billingMonth}.`,
        )
      } else if (alloc.status !== 'finalized') {
        missingDataWarnings.push(
          `Room ${String(roomNumber).padStart(2, '0')} electricity allocation is still in draft status.`,
        )
      }

      return {
        residentId: String(res._id),
        fullName: res.fullName,
        phone: res.phone,
        advanceBalance: Number((res as { advanceBalance?: number }).advanceBalance ?? 0),
        roomId: roomIdStr,
        roomNumber,
        floor,
        monthlyRent: res.monthlyRent,
        wifiCharge,
        electricity: {
          hasAllocation: Boolean(alloc),
          hasFinalizedAllocation,
          units: alloc?.consumption ?? 0,
          mainMeterShare,
          additionalCharge,
          totalElectricity,
        },
        previousOutstanding,
        estimatedTotalPayable,
        alreadyGenerated: Boolean(existingBill),
        missingDataWarnings,
      }
    })
    .sort((a, b) => a.roomNumber - b.roomNumber)

  const missingElectricityRooms = residentsPreview
    .filter((r) => !r.alreadyGenerated && !r.electricity.hasFinalizedAllocation)
    .map((r) => r.roomNumber)

  if (missingElectricityRooms.length > 0) {
    generationWarnings.push(
      `Rooms missing finalized electricity allocations for ${billingMonth}: ${missingElectricityRooms
        .map((n) => `Room ${String(n).padStart(2, '0')}`)
        .join(', ')}.`,
    )
  }

  // Enrich bills with live category remaining dues and resident advanceBalance
  const residentAdvanceMap = new Map(
    activeResidents.map((r) => [
      String(r._id),
      Number((r as { advanceBalance?: number }).advanceBalance ?? 0),
    ]),
  )

  const enrichedBills = billsForMonth.map((bill) => {
    const catState = computeBillCategoryState(bill)
    const remainingPreviousDue = fromPaisa(
      Math.max(
        0,
        toPaisa(bill.previousOutstanding) - toPaisa(bill.previousOutstandingPaid ?? 0),
      ),
    )
    return {
      ...bill,
      categoryState: catState,
      categoryDue: {
        rentDue: catState.unpaidRent,
        electricityDue: catState.unpaidElectricity,
        wifiDue: catState.unpaidWifi,
        otherDue: catState.unpaidOther,
        previousDue: remainingPreviousDue,
      },
      residentAdvanceBalance: residentAdvanceMap.get(String(bill.residentId)) ?? 0,
    }
  })

  const totalMonthlyBills = enrichedBills.length
  const totalPayable = roundMoney(
    enrichedBills.reduce((sum, b) => sum + b.totalPayable, 0),
  )
  const totalCollected = roundMoney(
    enrichedBills.reduce((sum, b) => sum + b.totalPaid, 0),
  )
  const totalOutstanding = roundMoney(
    enrichedBills.reduce((sum, b) => sum + b.remainingDue, 0),
  )
  const fullyPaidResidents = enrichedBills.filter((b) => b.status === 'paid').length
  const partiallyPaidResidents = enrichedBills.filter(
    (b) => b.status === 'partially_paid',
  ).length
  const unpaidResidents = enrichedBills.filter((b) => b.status === 'unpaid').length

  const defaultMonths = ['2026-10', '2026-11', '2026-12']
  const availableMonths = Array.from(
    new Set([...defaultMonths, billingMonth, ...(billMonths as string[])]),
  ).sort()

  return {
    billingMonth,
    availableMonths,
    summary: {
      totalMonthlyBills,
      totalPayable,
      totalCollected,
      totalOutstanding,
      fullyPaidResidents,
      partiallyPaidResidents,
      unpaidResidents,
    },
    generationPreview: {
      activeResidentsCount: activeResidents.length,
      existingBillsCount: residentsPreview.filter((r) => r.alreadyGenerated).length,
      toGenerateCount: residentsPreview.filter((r) => !r.alreadyGenerated).length,
      isElectricityFinalized,
      warnings: generationWarnings,
      residents: residentsPreview,
    },
    bills: enrichedBills,
    payments: paymentsForMonth,
    rooms: allRooms,
  }
}

