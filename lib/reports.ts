import mongoose from 'mongoose'
import { toPaisa, fromPaisa, computeBillCategoryState } from '@/lib/monthly-billing'
import { roundMoney, roundUnits } from '@/lib/electricity-calculations'
import { MonthlyBill } from '@/models/monthly-bill'
import { Payment } from '@/models/payment'
import { Resident } from '@/models/resident'
import { Room } from '@/models/room'
import { MainMeter } from '@/models/main-meter'
import { SubMeter } from '@/models/sub-meter'
import { MonthlyElectricityAllocation, MonthlyElectricityCycle } from '@/models/monthly-electricity-allocation'
import { MonthlySubMeterReading } from '@/models/monthly-sub-meter-reading'
import { MonthlyMainMeterBill } from '@/models/monthly-main-meter-bill'
import { WiFiConfiguration } from '@/models/wifi-configuration'
import { WiFiDevice } from '@/models/wifi-device'

export type ReportsFilterParams = {
  month?: string
  floor?: number
  roomNumber?: number
  residentId?: string
}

export async function getFinancialReportsData(filters: ReportsFilterParams) {
  const selectedMonth = filters.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(filters.month)
    ? filters.month
    : undefined

  // Base query for MonthlyBill
  const billQuery: Record<string, unknown> = {}
  if (selectedMonth) {
    billQuery.billingMonth = selectedMonth
  }
  if (filters.floor) {
    billQuery.floor = Number(filters.floor)
  }
  if (filters.roomNumber) {
    billQuery.roomNumber = Number(filters.roomNumber)
  }
  if (filters.residentId && mongoose.isValidObjectId(filters.residentId)) {
    billQuery.residentId = new mongoose.Types.ObjectId(filters.residentId)
  }

  // Parallel data fetch
  const [
    allBills,
    allPayments,
    allRooms,
    allResidents,
    allMainMeters,
    allSubMeters,
    wifiConfigs,
    wifiDevices,
    elecCycles,
    elecAllocations,
    subMeterReadings,
    mainMeterBills,
  ] = await Promise.all([
    MonthlyBill.find(billQuery).sort({ billingMonth: -1, roomNumber: 1 }).lean(),
    Payment.find(selectedMonth ? { billingMonth: selectedMonth } : {}).sort({ paymentDate: -1, createdAt: -1 }).lean(),
    Room.find().sort({ roomNumber: 1 }).lean(),
    Resident.find().sort({ fullName: 1 }).lean(),
    MainMeter.find().sort({ slotNumber: 1 }).lean(),
    SubMeter.find().sort({ roomNumber: 1 }).lean(),
    WiFiConfiguration.find().lean(),
    WiFiDevice.find().lean(),
    MonthlyElectricityCycle.find(selectedMonth ? { billingMonth: selectedMonth } : {}).lean(),
    MonthlyElectricityAllocation.find(selectedMonth ? { billingMonth: selectedMonth } : {}).lean(),
    MonthlySubMeterReading.find(selectedMonth ? { billingMonth: selectedMonth } : {}).lean(),
    MonthlyMainMeterBill.find(selectedMonth ? { billingMonth: selectedMonth } : {}).lean(),
  ])

  // Available billing months for filter dropdown
  const allExistingMonthsRaw = await MonthlyBill.distinct('billingMonth')
  const availableMonths = (allExistingMonthsRaw as string[])
    .filter((m): m is string => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m))
    .sort()
    .reverse()

  // ---------------------------------------------------------------------------
  // PART B: 8 CORE KPI CARDS
  // ---------------------------------------------------------------------------
  let totalBilledPaisa = 0
  let totalCollectedPaisa = 0
  let totalOutstandingPaisa = 0
  let previousOutstandingBilledPaisa = 0
  let rentCollectedPaisa = 0
  let electricityCollectedPaisa = 0
  let wifiCollectedPaisa = 0

  for (const bill of allBills) {
    totalBilledPaisa += toPaisa(bill.totalPayable)
    totalCollectedPaisa += toPaisa(bill.totalPaid)
    totalOutstandingPaisa += toPaisa(bill.remainingDue)
    previousOutstandingBilledPaisa += toPaisa(bill.previousOutstanding)

    // Category paid on this month's charges
    rentCollectedPaisa += toPaisa(bill.rentPaid ?? 0)
    electricityCollectedPaisa += toPaisa(bill.electricityPaid ?? 0)
    wifiCollectedPaisa += toPaisa(bill.wifiPaid ?? 0)
  }

  // Also include payment allocations if filtering by specific payments
  const collectionRate = totalBilledPaisa > 0
    ? Math.round((totalCollectedPaisa / totalBilledPaisa) * 1000) / 10
    : 0

  const summary = {
    monthlyRentCollection: fromPaisa(rentCollectedPaisa),
    monthlyElectricityCollection: fromPaisa(electricityCollectedPaisa),
    monthlyWifiCollection: fromPaisa(wifiCollectedPaisa),
    totalAmountBilled: fromPaisa(totalBilledPaisa),
    totalAmountCollected: fromPaisa(totalCollectedPaisa),
    totalOutstandingDue: fromPaisa(totalOutstandingPaisa),
    previousMonthOutstanding: fromPaisa(previousOutstandingBilledPaisa),
    collectionRate, // Percentage e.g. 78.5
    totalBillsCount: allBills.length,
    paidBillsCount: allBills.filter(b => b.status === 'paid').length,
    partiallyPaidBillsCount: allBills.filter(b => b.status === 'partially_paid').length,
    unpaidBillsCount: allBills.filter(b => b.status === 'unpaid').length,
  }

  // ---------------------------------------------------------------------------
  // PART C: DETAILED REPORT DATASETS
  // ---------------------------------------------------------------------------

  // 1. Monthly Income & Collection Summary (Grouped by Month)
  const monthMap = new Map<string, {
    billingMonth: string
    totalBilled: number
    totalCollected: number
    totalDue: number
    rentBilled: number
    rentCollected: number
    elecBilled: number
    elecCollected: number
    wifiBilled: number
    wifiCollected: number
    billCount: number
    collectionRate: number
  }>()

  for (const bill of allBills) {
    const m = bill.billingMonth
    const current = monthMap.get(m) ?? {
      billingMonth: m,
      totalBilled: 0,
      totalCollected: 0,
      totalDue: 0,
      rentBilled: 0,
      rentCollected: 0,
      elecBilled: 0,
      elecCollected: 0,
      wifiBilled: 0,
      wifiCollected: 0,
      billCount: 0,
      collectionRate: 0,
    }

    current.totalBilled = fromPaisa(toPaisa(current.totalBilled) + toPaisa(bill.totalPayable))
    current.totalCollected = fromPaisa(toPaisa(current.totalCollected) + toPaisa(bill.totalPaid))
    current.totalDue = fromPaisa(toPaisa(current.totalDue) + toPaisa(bill.remainingDue))
    current.rentBilled = fromPaisa(toPaisa(current.rentBilled) + toPaisa(bill.monthlyRent))
    current.rentCollected = fromPaisa(toPaisa(current.rentCollected) + toPaisa(bill.rentPaid ?? 0))
    current.elecBilled = fromPaisa(toPaisa(current.elecBilled) + toPaisa(bill.totalElectricity ?? 0))
    current.elecCollected = fromPaisa(toPaisa(current.elecCollected) + toPaisa(bill.electricityPaid ?? 0))
    current.wifiBilled = fromPaisa(toPaisa(current.wifiBilled) + toPaisa(bill.wifiCharge ?? 0))
    current.wifiCollected = fromPaisa(toPaisa(current.wifiCollected) + toPaisa(bill.wifiPaid ?? 0))
    current.billCount += 1
    current.collectionRate = current.totalBilled > 0
      ? Math.round((current.totalCollected / current.totalBilled) * 1000) / 10
      : 0
    monthMap.set(m, current)
  }

  const monthlyIncomeSummary = Array.from(monthMap.values()).sort((a, b) => b.billingMonth.localeCompare(a.billingMonth))

  // 2. Resident-wise Outstanding Balance Report
  const residentMap = new Map(allResidents.map(r => [String(r._id), r]))
  const roomMap = new Map(allRooms.map(r => [String(r._id), r]))

  const residentOutstandingReport = allBills.map(b => {
    const res = residentMap.get(String(b.residentId))
    const cat = computeBillCategoryState(b)
    return {
      billId: String(b._id),
      residentId: String(b.residentId),
      residentName: b.residentName,
      phone: res?.phone || b.residentPhone || '—',
      roomNumber: b.roomNumber,
      floor: b.floor,
      billingMonth: b.billingMonth,
      monthlyRent: b.monthlyRent,
      totalElectricity: b.totalElectricity,
      wifiCharge: b.wifiCharge,
      previousOutstanding: b.previousOutstanding,
      totalPayable: b.totalPayable,
      totalPaid: b.totalPaid,
      remainingDue: b.remainingDue,
      unpaidRent: cat.unpaidRent,
      unpaidElectricity: cat.unpaidElectricity,
      unpaidWifi: cat.unpaidWifi,
      status: b.status,
    }
  })

  // 3. Room-wise Billing Summary (For all 26 rooms)
  const roomBillingSummary = allRooms.map(room => {
    const matchingBills = allBills.filter(b => b.roomNumber === room.roomNumber)
    const activeResident = allResidents.find(r => r.status === 'active' && String(r.roomId) === String(room._id))
    const totalBilled = matchingBills.reduce((sum, b) => sum + b.totalPayable, 0)
    const totalPaid = matchingBills.reduce((sum, b) => sum + b.totalPaid, 0)
    const remainingDue = matchingBills.reduce((sum, b) => sum + b.remainingDue, 0)

    return {
      roomId: String(room._id),
      roomNumber: room.roomNumber,
      floor: room.floor,
      status: room.status,
      currentResident: activeResident?.fullName || room.currentResident || null,
      monthlyRent: room.monthlyRent ?? activeResident?.monthlyRent ?? 0,
      billsCount: matchingBills.length,
      totalBilled: roundMoney(totalBilled),
      totalPaid: roundMoney(totalPaid),
      remainingDue: roundMoney(remainingDue),
    }
  }).filter(r => {
    if (filters.floor && r.floor !== Number(filters.floor)) return false
    if (filters.roomNumber && r.roomNumber !== Number(filters.roomNumber)) return false
    return true
  })

  // 4. Electricity Consumption & Distribution Summary
  const electricityConsumptionSummary = subMeterReadings.map(reading => {
    const alloc = elecAllocations.find(a => String(a.roomId) === String(reading.roomId))
    const room = allRooms.find(r => String(r._id) === String(reading.roomId))
    return {
      readingId: String(reading._id),
      roomId: String(reading.roomId),
      roomNumber: room?.roomNumber ?? reading.roomNumber,
      floor: room?.floor ?? reading.floor,
      billingMonth: reading.billingMonth,
      residentName: reading.residentName || (reading.isVacant ? 'Vacant' : '—'),
      previousReading: reading.previousReading,
      currentReading: reading.currentReading,
      consumption: reading.consumption,
      readingDate: reading.readingDate,
      mainMeterShare: alloc?.allocatedAmount ?? 0,
      additionalCharge: alloc?.additionalCharge ?? 0,
      finalElectricityAmount: alloc?.finalElectricityAmount ?? 0,
      status: reading.status,
    }
  }).filter(e => {
    if (filters.floor && e.floor !== Number(filters.floor)) return false
    if (filters.roomNumber && e.roomNumber !== Number(filters.roomNumber)) return false
    return true
  }).sort((a, b) => a.roomNumber - b.roomNumber)

  // 5. Main Meter Bill Distribution Report
  const mainMeterBillDistribution = allMainMeters.map(meter => {
    const bill = mainMeterBills.find(b => String(b.mainMeterId) === String(meter._id))
    const assignedRoomNums = allRooms
      .filter(r => meter.assignedRooms?.some((ar: unknown) => String(ar) === String(r._id)))
      .map(r => r.roomNumber)
      .sort((a, b) => a - b)

    return {
      meterId: String(meter._id),
      slotNumber: meter.slotNumber,
      name: meter.name,
      meterNumber: meter.meterNumber || '—',
      location: meter.location || '—',
      status: meter.status,
      assignedRooms: assignedRoomNums,
      assignedRoomsCount: assignedRoomNums.length,
      billingMonth: selectedMonth || 'All Months',
      billAmount: bill?.billAmount ?? 0,
      totalUnits: bill?.totalUnitsConsumed ?? 0,
      unitRate: bill?.unitRate ?? 0,
      billReference: bill?.billReference || '—',
    }
  })

  // 6. WiFi Billing & Device Summary
  const activeWiFiConfigs = wifiConfigs.filter(w => w.status === 'active')
  const wifiBillingSummary = activeWiFiConfigs.map(config => {
    const res = residentMap.get(String(config.residentId))
    const room = allRooms.find(r => String(r._id) === String(config.roomId))
    const devices = wifiDevices.filter(d => String(d.wifiConfigurationId) === String(config._id))
    const activeDevices = devices.filter(d => d.status === 'active')

    // Find bills for this resident to calculate total wifi paid vs due
    const resBills = allBills.filter(b => String(b.residentId) === String(config.residentId))
    const totalWifiBilled = resBills.reduce((s, b) => s + (b.wifiCharge ?? 0), 0)
    const totalWifiPaid = resBills.reduce((s, b) => s + (b.wifiPaid ?? 0), 0)
    const unpaidWifi = Math.max(0, totalWifiBilled - totalWifiPaid)

    return {
      configId: String(config._id),
      residentId: String(config.residentId),
      residentName: res?.fullName || '—',
      roomNumber: room?.roomNumber ?? null,
      floor: room?.floor ?? null,
      wifiName: config.wifiName,
      monthlyCharge: config.monthlyCharge,
      status: config.status,
      totalDevicesCount: devices.length,
      activeDevicesCount: activeDevices.length,
      totalWifiBilled: roundMoney(totalWifiBilled),
      totalWifiPaid: roundMoney(totalWifiPaid),
      unpaidWifi: roundMoney(unpaidWifi),
      startDate: config.startDate ? new Date(config.startDate).toISOString().slice(0, 10) : '—',
    }
  }).filter(w => {
    if (filters.floor && w.floor !== Number(filters.floor)) return false
    if (filters.roomNumber && w.roomNumber !== Number(filters.roomNumber)) return false
    return true
  })

  // 7. Payment History (Audit Trail)
  const paymentHistory = allPayments.map(p => {
    return {
      paymentId: String(p._id),
      billId: String(p.billId),
      residentId: String(p.residentId),
      residentName: p.residentName,
      roomNumber: p.roomNumber,
      billingMonth: p.billingMonth,
      paymentDate: p.paymentDate,
      amountReceived: p.amountReceived,
      paymentMethod: p.paymentMethod,
      transactionReference: p.transactionReference || '—',
      status: p.status,
      notes: p.notes || '',
      allocations: (p.allocationDetails || []).map((a: { category: string; amount: number }) => ({
        category: a.category,
        amount: a.amount,
      })),
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : '',
    }
  }).filter(p => {
    if (filters.roomNumber && p.roomNumber !== Number(filters.roomNumber)) return false
    if (filters.residentId && p.residentId !== filters.residentId) return false
    return true
  })

  // 8. Partial and Unpaid Bills List
  const partialAndUnpaidBills = residentOutstandingReport.filter(
    b => b.status === 'unpaid' || b.status === 'partially_paid'
  ).sort((a, b) => b.remainingDue - a.remainingDue)

  return {
    availableMonths,
    selectedFilters: {
      month: selectedMonth || 'all',
      floor: filters.floor || null,
      roomNumber: filters.roomNumber || null,
      residentId: filters.residentId || null,
    },
    summary,
    monthlyIncomeSummary,
    residentOutstandingReport,
    roomBillingSummary,
    electricityConsumptionSummary,
    mainMeterBillDistribution,
    wifiBillingSummary,
    paymentHistory,
    partialAndUnpaidBills,
  }
}
