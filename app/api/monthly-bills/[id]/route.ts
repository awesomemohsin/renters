import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase, isTransactionUnsupportedError } from '@/lib/mongodb'
import {
  computeBillCategoryState,
  ensureBillingCollectionsExist,
  fromPaisa,
  recalculateResidentBillChain,
  toPaisa,
} from '@/lib/monthly-billing'
import { MonthlyBill } from '@/models/monthly-bill'
import { Payment } from '@/models/payment'
import { Resident } from '@/models/resident'

const cleanString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid bill ID.' }, { status: 400 })
  }

  try {
    await connectToDatabase()
    const bill = await MonthlyBill.findById(id).lean()
    if (!bill) {
      return NextResponse.json({ error: 'Monthly bill not found.' }, { status: 404 })
    }

    const [resident, payments] = await Promise.all([
      Resident.findById(bill.residentId).lean(),
      Payment.find({ billId: bill._id }).sort({ createdAt: -1 }).lean(),
    ])

    const catState = computeBillCategoryState(bill)
    const remainingPreviousDue = fromPaisa(
      Math.max(
        0,
        toPaisa(bill.previousOutstanding) -
          toPaisa(bill.previousOutstandingPaid ?? 0),
      ),
    )

    return NextResponse.json({
      bill: {
        ...bill,
        categoryState: catState,
        categoryDue: {
          rentDue: catState.unpaidRent,
          electricityDue: catState.unpaidElectricity,
          wifiDue: catState.unpaidWifi,
          otherDue: catState.unpaidOther,
          previousDue: remainingPreviousDue,
        },
        residentAdvanceBalance: Number(
          (resident as { advanceBalance?: number } | null)?.advanceBalance ?? 0,
        ),
      },
      residentAdvanceBalance: Number(
        (resident as { advanceBalance?: number } | null)?.advanceBalance ?? 0,
      ),
      payments,
    })
  } catch {
    return NextResponse.json(
      { error: 'Unable to load monthly bill details.' },
      { status: 500 },
    )
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid bill ID.' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const action = body.action
    const today = new Date().toISOString().slice(0, 10)

    await connectToDatabase()
    await ensureBillingCollectionsExist()
    const session = await mongoose.startSession()

    try {
      await session.withTransaction(async () => {
        const bill = await MonthlyBill.findById(id).session(session)
        if (!bill) {
          throw new Error('BILL_NOT_FOUND')
        }

        if (action === 'lock') {
          bill.isLocked = true
          bill.finalizedAt = new Date()
          bill.revisionHistory.push({
            timestamp: new Date(),
            action: 'locked',
            reason: 'Monthly bill finalized and locked',
            previousTotalPayable: bill.totalPayable,
            newTotalPayable: bill.totalPayable,
          })
          await bill.save({ session })
          return
        }

        if (action === 'unlock') {
          const reason = cleanString(body.reason) || 'Unlocked for bill adjustment'
          bill.isLocked = false
          bill.revisionHistory.push({
            timestamp: new Date(),
            action: 'unlocked_for_correction',
            reason,
            previousTotalPayable: bill.totalPayable,
            newTotalPayable: bill.totalPayable,
          })
          await bill.save({ session })
          return
        }

        if (bill.isLocked && action !== 'apply_advance') {
          throw new Error('BILL_LOCKED')
        }

        const prevTotalPayable = bill.totalPayable

        if (action === 'update_wifi' || body.wifiCharge !== undefined) {
          const wifi = Number(body.wifiCharge)
          if (!Number.isFinite(wifi) || wifi < 0) {
            throw new Error('INVALID_WIFI')
          }
          if (toPaisa(wifi) < toPaisa(bill.wifiPaid)) {
            throw new Error('WIFI_BELOW_PAID')
          }
          bill.wifiCharge = fromPaisa(toPaisa(wifi))

          if (body.saveAsResidentDefault || body.syncResidentProfile) {
            await Resident.findByIdAndUpdate(
              bill.residentId,
              { $set: { wifiCharge: bill.wifiCharge } },
              { session },
            )
          }
        }

        if (action === 'add_charge') {
          const description = cleanString(body.description)
          const amount = Number(body.amount)
          const date = cleanString(body.date) || today
          const notes = cleanString(body.notes)

          if (!description) {
            throw new Error('DESCRIPTION_REQUIRED')
          }
          if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error('INVALID_AMOUNT')
          }

          bill.additionalCharges.push({
            description,
            amount: fromPaisa(toPaisa(amount)),
            date,
            notes,
          })
        }

        if (action === 'remove_charge') {
          const chargeId = cleanString(body.chargeId)
          bill.additionalCharges.pull({ _id: chargeId })
          const nextState = computeBillCategoryState(bill)
          if (toPaisa(nextState.otherCap) < toPaisa(bill.otherChargesPaid)) {
            throw new Error('CHANGE_BELOW_PAID_AMOUNT')
          }
        }

        if (action === 'add_adjustment') {
          const description = cleanString(body.description)
          const amount = Number(body.amount)
          const type = body.type as 'discount' | 'positive' | 'negative'
          const date = cleanString(body.date) || today
          const notes = cleanString(body.notes)

          if (!description) {
            throw new Error('DESCRIPTION_REQUIRED')
          }
          if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error('INVALID_AMOUNT')
          }
          if (!['discount', 'positive', 'negative'].includes(type)) {
            throw new Error('INVALID_ADJUSTMENT_TYPE')
          }

          bill.adjustments.push({
            description,
            amount: fromPaisa(toPaisa(amount)),
            type,
            date,
            notes,
          })

          const nextState = computeBillCategoryState(bill)
          if (
            toPaisa(nextState.rentCap) < toPaisa(bill.rentPaid) ||
            toPaisa(nextState.electricityCap) < toPaisa(bill.electricityPaid) ||
            toPaisa(nextState.wifiCap) < toPaisa(bill.wifiPaid) ||
            toPaisa(nextState.otherCap) < toPaisa(bill.otherChargesPaid)
          ) {
            throw new Error('DISCOUNT_EXCEEDS_UNPAID_BALANCE')
          }
        }

        if (action === 'remove_adjustment') {
          const adjustmentId = cleanString(body.adjustmentId)
          bill.adjustments.pull({ _id: adjustmentId })
          const nextState = computeBillCategoryState(bill)
          if (toPaisa(nextState.otherCap) < toPaisa(bill.otherChargesPaid)) {
            throw new Error('CHANGE_BELOW_PAID_AMOUNT')
          }
        }

        if (action === 'apply_advance') {
          const resident = await Resident.findById(bill.residentId).session(session)
          if (!resident) {
            throw new Error('RESIDENT_NOT_FOUND')
          }

          const availableAdvancePaisa = toPaisa(
            (resident as { advanceBalance?: number }).advanceBalance ?? 0,
          )
          if (availableAdvancePaisa <= 0) {
            throw new Error('NO_ADVANCE_AVAILABLE')
          }

          const catState = computeBillCategoryState(bill)

          let rentAllocPaisa = toPaisa(Number(body.rentAllocation ?? 0))
          let elecAllocPaisa = toPaisa(Number(body.electricityAllocation ?? 0))
          let wifiAllocPaisa = toPaisa(Number(body.wifiAllocation ?? 0))
          let otherAllocPaisa = toPaisa(Number(body.otherAllocation ?? 0))

          if (
            rentAllocPaisa === 0 &&
            elecAllocPaisa === 0 &&
            wifiAllocPaisa === 0 &&
            otherAllocPaisa === 0 &&
            body.amount !== undefined
          ) {
            let rem = toPaisa(Number(body.amount))
            if (rem <= 0) {
              throw new Error('INVALID_AMOUNT')
            }
            const rApply = Math.min(toPaisa(catState.unpaidRent), rem)
            rentAllocPaisa = rApply
            rem -= rApply
            const eApply = Math.min(toPaisa(catState.unpaidElectricity), rem)
            elecAllocPaisa = eApply
            rem -= eApply
            const wApply = Math.min(toPaisa(catState.unpaidWifi), rem)
            wifiAllocPaisa = wApply
            rem -= wApply
            const oApply = Math.min(toPaisa(catState.unpaidOther), rem)
            otherAllocPaisa = oApply
            rem -= oApply
            if (rem > 0) {
              throw new Error('ALLOCATION_EXCEEDS_CATEGORY_DUE')
            }
          }

          const totalApplyPaisa =
            rentAllocPaisa + elecAllocPaisa + wifiAllocPaisa + otherAllocPaisa

          if (
            rentAllocPaisa < 0 ||
            elecAllocPaisa < 0 ||
            wifiAllocPaisa < 0 ||
            otherAllocPaisa < 0 ||
            totalApplyPaisa <= 0
          ) {
            throw new Error('INVALID_AMOUNT')
          }

          if (totalApplyPaisa > availableAdvancePaisa) {
            throw new Error('EXCEEDS_ADVANCE_BALANCE')
          }

          if (
            rentAllocPaisa > toPaisa(catState.unpaidRent) ||
            elecAllocPaisa > toPaisa(catState.unpaidElectricity) ||
            wifiAllocPaisa > toPaisa(catState.unpaidWifi) ||
            otherAllocPaisa > toPaisa(catState.unpaidOther)
          ) {
            throw new Error('ALLOCATION_EXCEEDS_CATEGORY_DUE')
          }

          bill.rentPaid = fromPaisa(toPaisa(bill.rentPaid) + rentAllocPaisa)
          bill.electricityPaid = fromPaisa(
            toPaisa(bill.electricityPaid) + elecAllocPaisa,
          )
          bill.wifiPaid = fromPaisa(toPaisa(bill.wifiPaid) + wifiAllocPaisa)
          bill.otherChargesPaid = fromPaisa(
            toPaisa(bill.otherChargesPaid) + otherAllocPaisa,
          )
          bill.advanceApplied = fromPaisa(
            toPaisa(bill.advanceApplied ?? 0) + totalApplyPaisa,
          )

          ;(resident as { advanceBalance?: number }).advanceBalance = fromPaisa(
            availableAdvancePaisa - totalApplyPaisa,
          )
          await resident.save({ session })

          const allocationDetails: {
            targetBillId: mongoose.Types.ObjectId
            billingMonth: string
            category: 'rent' | 'electricity' | 'wifi' | 'other'
            amount: number
          }[] = []

          if (rentAllocPaisa > 0) {
            allocationDetails.push({
              targetBillId: bill._id,
              billingMonth: bill.billingMonth,
              category: 'rent',
              amount: fromPaisa(rentAllocPaisa),
            })
          }
          if (elecAllocPaisa > 0) {
            allocationDetails.push({
              targetBillId: bill._id,
              billingMonth: bill.billingMonth,
              category: 'electricity',
              amount: fromPaisa(elecAllocPaisa),
            })
          }
          if (wifiAllocPaisa > 0) {
            allocationDetails.push({
              targetBillId: bill._id,
              billingMonth: bill.billingMonth,
              category: 'wifi',
              amount: fromPaisa(wifiAllocPaisa),
            })
          }
          if (otherAllocPaisa > 0) {
            allocationDetails.push({
              targetBillId: bill._id,
              billingMonth: bill.billingMonth,
              category: 'other',
              amount: fromPaisa(otherAllocPaisa),
            })
          }

          await Payment.create(
            [
              {
                residentId: bill.residentId,
                roomId: bill.roomId,
                billId: bill._id,
                residentName: bill.residentName,
                roomNumber: bill.roomNumber,
                paymentDate: today,
                billingMonth: bill.billingMonth,
                amountReceived: fromPaisa(totalApplyPaisa),
                paymentMethod: 'Advance Credit',
                transactionReference: 'ADVANCE-APPLY',
                notes: cleanString(body.notes) || 'Applied from resident advance credit balance',
                rentAllocation: fromPaisa(rentAllocPaisa),
                electricityAllocation: fromPaisa(elecAllocPaisa),
                wifiAllocation: fromPaisa(wifiAllocPaisa),
                otherAllocation: fromPaisa(otherAllocPaisa),
                previousDueAllocation: 0,
                advanceAllocation: 0,
                allocationDetails,
                status: 'completed',
              },
            ],
            { session },
          )
        }

        await bill.save({ session })
        await recalculateResidentBillChain(bill.residentId, session)

        const refreshedBill = await MonthlyBill.findById(bill._id).session(session)
        if (refreshedBill && refreshedBill.totalPayable !== prevTotalPayable) {
          refreshedBill.revisionHistory.push({
            timestamp: new Date(),
            action: action || 'bill_updated',
            reason: cleanString(body.reason) || cleanString(body.description) || 'Updated bill charges/adjustments',
            previousTotalPayable: prevTotalPayable,
            newTotalPayable: refreshedBill.totalPayable,
          })
          await refreshedBill.save({ session })
        }
      })
    } catch (error) {
      const code = (error as Error).message
      if (code === 'BILL_NOT_FOUND') {
        return NextResponse.json({ error: 'Monthly bill not found.' }, { status: 404 })
      }
      if (code === 'BILL_LOCKED') {
        return NextResponse.json(
          {
            error:
              'This monthly bill is locked. Unlock it with a correction reason before modifying charges or adjustments.',
          },
          { status: 409 },
        )
      }
      if (code === 'REASON_REQUIRED') {
        return NextResponse.json(
          { error: 'Please provide a reason (at least 3 characters) to unlock this bill.' },
          { status: 400 },
        )
      }
      if (code === 'DESCRIPTION_REQUIRED') {
        return NextResponse.json(
          { error: 'Please provide a description for the charge or adjustment.' },
          { status: 400 },
        )
      }
      if (code === 'INVALID_AMOUNT' || code === 'INVALID_WIFI') {
        return NextResponse.json(
          { error: 'Amount must be a valid positive number.' },
          { status: 400 },
        )
      }
      if (code === 'INVALID_ADJUSTMENT_TYPE') {
        return NextResponse.json(
          { error: 'Invalid adjustment type.' },
          { status: 400 },
        )
      }
      if (
        code === 'WIFI_BELOW_PAID' ||
        code === 'CHANGE_BELOW_PAID_AMOUNT' ||
        code === 'DISCOUNT_EXCEEDS_UNPAID_BALANCE'
      ) {
        return NextResponse.json(
          {
            error:
              'Cannot reduce a charge below the amount already paid, or apply a discount larger than the remaining unpaid balance.',
          },
          { status: 400 },
        )
      }
      if (code === 'NO_ADVANCE_AVAILABLE' || code === 'EXCEEDS_ADVANCE_BALANCE') {
        return NextResponse.json(
          { error: 'Amount exceeds the resident available advance credit balance.' },
          { status: 400 },
        )
      }
      if (code === 'ALLOCATION_EXCEEDS_CATEGORY_DUE') {
        return NextResponse.json(
          { error: 'Advance credit allocation cannot exceed the remaining unpaid category balance.' },
          { status: 400 },
        )
      }
      if (isTransactionUnsupportedError(error)) {
        return NextResponse.json(
          {
            error:
              'MongoDB transactions are not supported by the current database deployment.',
          },
          { status: 500 },
        )
      }
      throw error
    } finally {
      await session.endSession()
    }

    const updatedBill = await MonthlyBill.findById(id).lean()
    const [resident, payments] = await Promise.all([
      updatedBill ? Resident.findById(updatedBill.residentId).lean() : null,
      updatedBill ? Payment.find({ billId: updatedBill._id }).sort({ createdAt: -1 }).lean() : [],
    ])

    const catState = updatedBill ? computeBillCategoryState(updatedBill) : null
    const remainingPreviousDue = updatedBill
      ? fromPaisa(
          Math.max(
            0,
            toPaisa(updatedBill.previousOutstanding) -
              toPaisa(updatedBill.previousOutstandingPaid ?? 0),
          ),
        )
      : 0

    return NextResponse.json({
      bill: updatedBill
        ? {
            ...updatedBill,
            categoryState: catState!,
            categoryDue: {
              rentDue: catState!.unpaidRent,
              electricityDue: catState!.unpaidElectricity,
              wifiDue: catState!.unpaidWifi,
              otherDue: catState!.unpaidOther,
              previousDue: remainingPreviousDue,
            },
            residentAdvanceBalance: Number(
              (resident as { advanceBalance?: number } | null)?.advanceBalance ?? 0,
            ),
          }
        : null,
      residentAdvanceBalance: Number(
        (resident as { advanceBalance?: number } | null)?.advanceBalance ?? 0,
      ),
      payments,
    })
  } catch {
    return NextResponse.json(
      { error: 'Unable to update monthly bill.' },
      { status: 500 },
    )
  }
}

