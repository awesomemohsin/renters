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

export async function GET(request: Request) {
  try {
    await connectToDatabase()
    const url = new URL(request.url)
    const residentId = url.searchParams.get('residentId')?.trim()
    const billId = url.searchParams.get('billId')?.trim()
    const billingMonth = url.searchParams.get('month')?.trim()

    const query: Record<string, unknown> = {}
    if (residentId) {
      if (!mongoose.isValidObjectId(residentId)) {
        return NextResponse.json({ error: 'Invalid resident ID.' }, { status: 400 })
      }
      query.residentId = residentId
    }
    if (billId) {
      if (!mongoose.isValidObjectId(billId)) {
        return NextResponse.json({ error: 'Invalid bill ID.' }, { status: 400 })
      }
      query.billId = billId
    }
    if (billingMonth) {
      query.billingMonth = billingMonth
    }

    const [payments, bills] = await Promise.all([
      Payment.find(query).sort({ createdAt: -1 }).lean(),
      residentId
        ? MonthlyBill.find({ residentId }).sort({ billingMonth: -1 }).lean()
        : Promise.resolve([]),
    ])

    return NextResponse.json({ payments, bills })
  } catch {
    return NextResponse.json(
      { error: 'Unable to load payment records.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const action = body.action

    await connectToDatabase()
    await ensureBillingCollectionsExist()
    const session = await mongoose.startSession()
    let createdOrUpdatedPaymentId: mongoose.Types.ObjectId | null = null

    try {
      await session.withTransaction(async () => {
        // =====================================================================
        // CONTROLLED PAYMENT REVERSAL / CORRECTION
        // =====================================================================
        if (action === 'reverse') {
          const paymentId = cleanString(body.paymentId)
          const reason = cleanString(body.reason)

          if (!mongoose.isValidObjectId(paymentId)) {
            throw new Error('INVALID_PAYMENT_ID')
          }
          if (reason.length < 3) {
            throw new Error('REVERSAL_REASON_REQUIRED')
          }

          const payment = await Payment.findById(paymentId).session(session)
          if (!payment) {
            throw new Error('PAYMENT_NOT_FOUND')
          }
          if (payment.status === 'reversed') {
            throw new Error('ALREADY_REVERSED')
          }

          const resident = await Resident.findById(payment.residentId).session(session)
          const originBill = await MonthlyBill.findById(payment.billId).session(session)

          for (const detail of payment.allocationDetails) {
            const amountPaisa = toPaisa(detail.amount)
            if (detail.category === 'advance') {
              if (resident) {
                const currentAdvPaisa = toPaisa(
                  (resident as { advanceBalance?: number }).advanceBalance ?? 0,
                )
                if (currentAdvPaisa < amountPaisa) {
                  throw new Error('ADVANCE_ALREADY_USED')
                }
                ;(resident as { advanceBalance?: number }).advanceBalance = fromPaisa(
                  currentAdvPaisa - amountPaisa,
                )
              }
            } else {
              const targetBill = await MonthlyBill.findById(detail.targetBillId).session(
                session,
              )
              if (targetBill) {
                if (detail.category === 'rent') {
                  targetBill.rentPaid = fromPaisa(
                    Math.max(0, toPaisa(targetBill.rentPaid) - amountPaisa),
                  )
                } else if (detail.category === 'electricity') {
                  targetBill.electricityPaid = fromPaisa(
                    Math.max(0, toPaisa(targetBill.electricityPaid) - amountPaisa),
                  )
                } else if (detail.category === 'wifi') {
                  targetBill.wifiPaid = fromPaisa(
                    Math.max(0, toPaisa(targetBill.wifiPaid) - amountPaisa),
                  )
                } else if (detail.category === 'other') {
                  targetBill.otherChargesPaid = fromPaisa(
                    Math.max(0, toPaisa(targetBill.otherChargesPaid) - amountPaisa),
                  )
                }

                if (
                  originBill &&
                  String(targetBill._id) !== String(originBill._id)
                ) {
                  originBill.previousOutstandingPaid = fromPaisa(
                    Math.max(
                      0,
                      toPaisa(originBill.previousOutstandingPaid ?? 0) - amountPaisa,
                    ),
                  )
                }

                await targetBill.save({ session })
              }
            }
          }

          if (payment.paymentMethod === 'Advance Credit' && resident && originBill) {
            const restoredPaisa = toPaisa(payment.amountReceived)
            ;(resident as { advanceBalance?: number }).advanceBalance = fromPaisa(
              toPaisa((resident as { advanceBalance?: number }).advanceBalance ?? 0) +
                restoredPaisa,
            )
            originBill.advanceApplied = fromPaisa(
              Math.max(0, toPaisa(originBill.advanceApplied ?? 0) - restoredPaisa),
            )
          }

          if (originBill) {
            originBill.revisionHistory.push({
              timestamp: new Date(),
              action: 'payment_reversed',
              reason: `Reversed payment of ৳${payment.amountReceived}: ${reason}`,
              previousTotalPayable: originBill.totalPayable,
              newTotalPayable: originBill.totalPayable,
            })
            await originBill.save({ session })
          }

          if (resident) {
            await resident.save({ session })
          }

          payment.status = 'reversed'
          payment.reversedAt = new Date()
          payment.reversalReason = reason
          payment.revisionHistory.push({
            timestamp: new Date(),
            action: 'reversed',
            reason,
          })
          await payment.save({ session })

          await recalculateResidentBillChain(payment.residentId, session)
          createdOrUpdatedPaymentId = payment._id
          return
        }

        // =====================================================================
        // COLLECT PAYMENT WITH MANUAL CATEGORY ALLOCATION
        // =====================================================================
        const billId = cleanString(body.billId)
        if (!mongoose.isValidObjectId(billId)) {
          throw new Error('INVALID_BILL_ID')
        }

        const paymentDate =
          cleanString(body.paymentDate) || new Date().toISOString().slice(0, 10)
        const paymentMethod = cleanString(body.paymentMethod) || 'Cash'
        const transactionReference = cleanString(body.transactionReference)
        const notes = cleanString(body.notes)
        const recordExcessAsAdvance = Boolean(
          body.recordExcessAsAdvance || body.confirmAdvance,
        )

        if (!['Cash', 'Bank', 'Mobile Banking', 'Other'].includes(paymentMethod)) {
          throw new Error('INVALID_PAYMENT_METHOD')
        }

        const amountReceivedNum = Number(body.amountReceived)
        const rentAllocNum = Number(body.rentAllocation ?? 0)
        const elecAllocNum = Number(body.electricityAllocation ?? 0)
        const wifiAllocNum = Number(body.wifiAllocation ?? 0)
        const otherAllocNum = Number(body.otherAllocation ?? 0)
        const prevDueAllocNum = Number(body.previousDueAllocation ?? 0)
        const advanceAllocNum = Number(body.advanceAllocation ?? 0)

        const nums = [
          amountReceivedNum,
          rentAllocNum,
          elecAllocNum,
          wifiAllocNum,
          otherAllocNum,
          prevDueAllocNum,
          advanceAllocNum,
        ]
        if (nums.some((n) => !Number.isFinite(n) || n < 0)) {
          throw new Error('NEGATIVE_OR_INVALID_AMOUNT')
        }

        const amountReceivedPaisa = toPaisa(amountReceivedNum)
        if (amountReceivedPaisa <= 0) {
          throw new Error('ZERO_PAYMENT_AMOUNT')
        }

        const rentAllocPaisa = toPaisa(rentAllocNum)
        const elecAllocPaisa = toPaisa(elecAllocNum)
        const wifiAllocPaisa = toPaisa(wifiAllocNum)
        const otherAllocPaisa = toPaisa(otherAllocNum)
        const prevDueAllocPaisa = toPaisa(prevDueAllocNum)
        const advanceAllocPaisa = toPaisa(advanceAllocNum)

        const totalAllocatedPaisa =
          rentAllocPaisa +
          elecAllocPaisa +
          wifiAllocPaisa +
          otherAllocPaisa +
          prevDueAllocPaisa +
          advanceAllocPaisa

        if (totalAllocatedPaisa !== amountReceivedPaisa) {
          throw new Error('ALLOCATION_MISMATCH')
        }

        if (advanceAllocPaisa > 0 && !recordExcessAsAdvance) {
          throw new Error('ADVANCE_CONFIRMATION_REQUIRED')
        }

        const bill = await MonthlyBill.findById(billId).session(session)
        if (!bill) {
          throw new Error('BILL_NOT_FOUND')
        }

        const catState = computeBillCategoryState(bill)
        if (rentAllocPaisa > toPaisa(catState.unpaidRent)) {
          throw new Error('EXCEEDS_RENT_DUE')
        }
        if (elecAllocPaisa > toPaisa(catState.unpaidElectricity)) {
          throw new Error('EXCEEDS_ELECTRICITY_DUE')
        }
        if (wifiAllocPaisa > toPaisa(catState.unpaidWifi)) {
          throw new Error('EXCEEDS_WIFI_DUE')
        }
        if (otherAllocPaisa > toPaisa(catState.unpaidOther)) {
          throw new Error('EXCEEDS_OTHER_DUE')
        }

        // Load prior unpaid bills for previousDueAllocation
        const priorBills = await MonthlyBill.find({
          residentId: bill.residentId,
          billingMonth: { $lt: bill.billingMonth },
        })
          .sort({ billingMonth: 1 })
          .session(session)

        const availablePriorPaisa = priorBills.reduce(
          (sum, p) => sum + toPaisa(computeBillCategoryState(p).currentMonthUnpaid),
          0,
        )

        if (prevDueAllocPaisa > availablePriorPaisa) {
          throw new Error('EXCEEDS_PREVIOUS_DUE')
        }

        const allocationDetails: {
          targetBillId: mongoose.Types.ObjectId
          billingMonth: string
          category: 'rent' | 'electricity' | 'wifi' | 'other' | 'advance'
          amount: number
        }[] = []

        // 1. Apply current bill category allocations
        if (rentAllocPaisa > 0) {
          bill.rentPaid = fromPaisa(toPaisa(bill.rentPaid) + rentAllocPaisa)
          allocationDetails.push({
            targetBillId: bill._id,
            billingMonth: bill.billingMonth,
            category: 'rent',
            amount: fromPaisa(rentAllocPaisa),
          })
        }
        if (elecAllocPaisa > 0) {
          bill.electricityPaid = fromPaisa(
            toPaisa(bill.electricityPaid) + elecAllocPaisa,
          )
          allocationDetails.push({
            targetBillId: bill._id,
            billingMonth: bill.billingMonth,
            category: 'electricity',
            amount: fromPaisa(elecAllocPaisa),
          })
        }
        if (wifiAllocPaisa > 0) {
          bill.wifiPaid = fromPaisa(toPaisa(bill.wifiPaid) + wifiAllocPaisa)
          allocationDetails.push({
            targetBillId: bill._id,
            billingMonth: bill.billingMonth,
            category: 'wifi',
            amount: fromPaisa(wifiAllocPaisa),
          })
        }
        if (otherAllocPaisa > 0) {
          bill.otherChargesPaid = fromPaisa(
            toPaisa(bill.otherChargesPaid) + otherAllocPaisa,
          )
          allocationDetails.push({
            targetBillId: bill._id,
            billingMonth: bill.billingMonth,
            category: 'other',
            amount: fromPaisa(otherAllocPaisa),
          })
        }

        // 2. Apply previousDueAllocation across prior unpaid bills in chronological FIFO order, preserving original billingMonth and category
        if (prevDueAllocPaisa > 0) {
          let remainingToAllocatePaisa = prevDueAllocPaisa

          for (const pBill of priorBills) {
            if (remainingToAllocatePaisa <= 0) break
            const pState = computeBillCategoryState(pBill)

            const categories: {
              name: 'rent' | 'electricity' | 'wifi' | 'other'
              unpaidPaisa: number
              paidField: 'rentPaid' | 'electricityPaid' | 'wifiPaid' | 'otherChargesPaid'
            }[] = [
              {
                name: 'rent',
                unpaidPaisa: toPaisa(pState.unpaidRent),
                paidField: 'rentPaid',
              },
              {
                name: 'electricity',
                unpaidPaisa: toPaisa(pState.unpaidElectricity),
                paidField: 'electricityPaid',
              },
              {
                name: 'wifi',
                unpaidPaisa: toPaisa(pState.unpaidWifi),
                paidField: 'wifiPaid',
              },
              {
                name: 'other',
                unpaidPaisa: toPaisa(pState.unpaidOther),
                paidField: 'otherChargesPaid',
              },
            ]

            let pBillModified = false
            for (const cat of categories) {
              if (remainingToAllocatePaisa <= 0 || cat.unpaidPaisa <= 0) continue
              const applyPaisa = Math.min(cat.unpaidPaisa, remainingToAllocatePaisa)
              pBill[cat.paidField] = fromPaisa(
                toPaisa(pBill[cat.paidField]) + applyPaisa,
              )
              remainingToAllocatePaisa -= applyPaisa
              pBillModified = true

              allocationDetails.push({
                targetBillId: pBill._id,
                billingMonth: pBill.billingMonth,
                category: cat.name,
                amount: fromPaisa(applyPaisa),
              })
            }

            if (pBillModified) {
              await pBill.save({ session })
            }
          }

          bill.previousOutstandingPaid = fromPaisa(
            toPaisa(bill.previousOutstandingPaid ?? 0) + prevDueAllocPaisa,
          )
        }

        // 3. Apply advance credit allocation if any
        if (advanceAllocPaisa > 0) {
          const resident = await Resident.findById(bill.residentId).session(session)
          if (!resident) {
            throw new Error('RESIDENT_NOT_FOUND')
          }
          ;(resident as { advanceBalance?: number }).advanceBalance = fromPaisa(
            toPaisa((resident as { advanceBalance?: number }).advanceBalance ?? 0) +
              advanceAllocPaisa,
          )
          await resident.save({ session })

          allocationDetails.push({
            targetBillId: bill._id,
            billingMonth: bill.billingMonth,
            category: 'advance',
            amount: fromPaisa(advanceAllocPaisa),
          })
        }

        await bill.save({ session })

        const [createdPayment] = await Payment.create(
          [
            {
              residentId: bill.residentId,
              roomId: bill.roomId,
              billId: bill._id,
              residentName: bill.residentName,
              roomNumber: bill.roomNumber,
              paymentDate,
              billingMonth: bill.billingMonth,
              amountReceived: fromPaisa(amountReceivedPaisa),
              paymentMethod,
              transactionReference,
              notes,
              rentAllocation: fromPaisa(rentAllocPaisa),
              electricityAllocation: fromPaisa(elecAllocPaisa),
              wifiAllocation: fromPaisa(wifiAllocPaisa),
              otherAllocation: fromPaisa(otherAllocPaisa),
              previousDueAllocation: fromPaisa(prevDueAllocPaisa),
              advanceAllocation: fromPaisa(advanceAllocPaisa),
              allocationDetails,
              status: 'completed',
            },
          ],
          { session },
        )

        createdOrUpdatedPaymentId = createdPayment._id
        await recalculateResidentBillChain(bill.residentId, session)
      })
    } catch (error) {
      const code = (error as Error).message
      if (code === 'BILL_NOT_FOUND' || code === 'PAYMENT_NOT_FOUND' || code === 'RESIDENT_NOT_FOUND') {
        return NextResponse.json({ error: 'Record not found.' }, { status: 404 })
      }
      if (code === 'INVALID_BILL_ID' || code === 'INVALID_PAYMENT_ID') {
        return NextResponse.json({ error: 'Invalid identifier.' }, { status: 400 })
      }
      if (code === 'INVALID_PAYMENT_METHOD') {
        return NextResponse.json(
          { error: 'Please select a valid payment method.' },
          { status: 400 },
        )
      }
      if (code === 'NEGATIVE_OR_INVALID_AMOUNT' || code === 'ZERO_PAYMENT_AMOUNT') {
        return NextResponse.json(
          { error: 'Payment and allocation amounts must be non-negative numbers, and amount received must be greater than zero.' },
          { status: 400 },
        )
      }
      if (code === 'ALLOCATION_MISMATCH') {
        return NextResponse.json(
          {
            error:
              'Total allocated amount across categories must exactly equal the total amount received.',
          },
          { status: 400 },
        )
      }
      if (code === 'ADVANCE_CONFIRMATION_REQUIRED') {
        return NextResponse.json(
          {
            error:
              'Overpayment allocation requires explicit confirmation to record the excess amount as an advance credit.',
          },
          { status: 400 },
        )
      }
      if (code === 'EXCEEDS_RENT_DUE') {
        return NextResponse.json(
          { error: 'Rent allocation cannot exceed the remaining unpaid rent.' },
          { status: 400 },
        )
      }
      if (code === 'EXCEEDS_ELECTRICITY_DUE') {
        return NextResponse.json(
          {
            error:
              'Electricity allocation cannot exceed the remaining unpaid electricity charge.',
          },
          { status: 400 },
        )
      }
      if (code === 'EXCEEDS_WIFI_DUE') {
        return NextResponse.json(
          { error: 'WiFi allocation cannot exceed the remaining unpaid WiFi charge.' },
          { status: 400 },
        )
      }
      if (code === 'EXCEEDS_OTHER_DUE') {
        return NextResponse.json(
          {
            error:
              'Other charges allocation cannot exceed the remaining unpaid additional charges.',
          },
          { status: 400 },
        )
      }
      if (code === 'EXCEEDS_PREVIOUS_DUE') {
        return NextResponse.json(
          {
            error:
              'Previous due allocation cannot exceed the remaining previous outstanding balance.',
          },
          { status: 400 },
        )
      }
      if (code === 'REVERSAL_REASON_REQUIRED') {
        return NextResponse.json(
          { error: 'Please provide a reason (at least 3 characters) to reverse a payment.' },
          { status: 400 },
        )
      }
      if (code === 'ALREADY_REVERSED') {
        return NextResponse.json(
          { error: 'This payment has already been reversed.' },
          { status: 409 },
        )
      }
      if (code === 'ADVANCE_ALREADY_USED') {
        return NextResponse.json(
          {
            error:
              'Cannot reverse this advance payment because the advance credit has already been applied to a bill.',
          },
          { status: 409 },
        )
      }
      if (
        (error as { code?: number }).code === 112 ||
        (error as Error).name === 'VersionError'
      ) {
        return NextResponse.json(
          {
            error:
              'Concurrent payment detected for this bill. Please refresh and verify the updated balance.',
          },
          { status: 409 },
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

    const payment = await Payment.findById(createdOrUpdatedPaymentId).lean()
    const rawBill = payment ? await MonthlyBill.findById(payment.billId).lean() : null
    const resident = payment ? await Resident.findById(payment.residentId).lean() : null
    const residentAdvanceBalance = Number(
      (resident as { advanceBalance?: number } | null)?.advanceBalance ?? 0,
    )

    let bill = null
    if (rawBill) {
      const catState = computeBillCategoryState(rawBill)
      const remainingPreviousDue = fromPaisa(
        Math.max(
          0,
          toPaisa(rawBill.previousOutstanding) -
            toPaisa(rawBill.previousOutstandingPaid ?? 0),
        ),
      )
      bill = {
        ...rawBill,
        categoryState: catState,
        categoryDue: {
          rentDue: catState.unpaidRent,
          electricityDue: catState.unpaidElectricity,
          wifiDue: catState.unpaidWifi,
          otherDue: catState.unpaidOther,
          previousDue: remainingPreviousDue,
        },
        residentAdvanceBalance,
      }
    }

    return NextResponse.json(
      { payment, bill, residentAdvanceBalance },
      { status: action === 'reverse' ? 200 : 201 },
    )
  } catch {
    return NextResponse.json(
      { error: 'Unable to process payment transaction.' },
      { status: 500 },
    )
  }
}

