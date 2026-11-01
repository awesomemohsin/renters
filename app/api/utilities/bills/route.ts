import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import {
  getMonthlyElectricityWorkspace,
  isValidBillingMonth,
  recalculateMonthlyAllocations,
  roundMoney,
  roundUnits,
} from '@/lib/electricity-calculations'
import { connectToDatabase, isTransactionUnsupportedError } from '@/lib/mongodb'
import { ensureMainMetersExist, MainMeter } from '@/models/main-meter'
import { MonthlyElectricityCycle } from '@/models/monthly-electricity-allocation'
import { MonthlyMainMeterBill } from '@/models/monthly-main-meter-bill'
import { MonthlySubMeterReading } from '@/models/monthly-sub-meter-reading'
import { ensureRoomsExist } from '@/models/room'

type RawBillEntry = {
  mainMeterId?: unknown
  billAmount?: unknown
  billDate?: unknown
  billReference?: unknown
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const billingMonth = typeof body.billingMonth === 'string' ? body.billingMonth.trim() : ''
    const defaultBillDate =
      typeof body.billDate === 'string' && body.billDate.trim()
        ? body.billDate.trim()
        : new Date().toISOString().slice(0, 10)
    const createOnly = body.mode === 'create_only'

    if (!isValidBillingMonth(billingMonth)) {
      return NextResponse.json(
        { error: 'Invalid billing month format. Expected YYYY-MM.' },
        { status: 400 },
      )
    }

    const rawEntries: RawBillEntry[] = Array.isArray(body.entries)
      ? body.entries
      : body.mainMeterId !== undefined
        ? [
            {
              mainMeterId: body.mainMeterId,
              billAmount: body.billAmount,
              billDate: body.billDate,
              billReference: body.billReference,
            },
          ]
        : []

    if (rawEntries.length === 0) {
      return NextResponse.json(
        { error: 'Please provide at least one main meter bill entry.' },
        { status: 400 },
      )
    }

    await connectToDatabase()
    await ensureRoomsExist()
    await ensureMainMetersExist()

    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        const cycle = await MonthlyElectricityCycle.findOne({ billingMonth }).session(session)
        if (cycle?.status === 'finalized') {
          throw new Error('MONTH_FINALIZED')
        }

        const [mainMeters, readings] = await Promise.all([
          MainMeter.find().session(session).lean(),
          MonthlySubMeterReading.find({ billingMonth }).session(session).lean(),
        ])

        const meterById = new Map(mainMeters.map((m) => [String(m._id), m]))
        const readingByRoomId = new Map(readings.map((r) => [String(r.roomId), r]))
        const seenMeterIds = new Set<string>()

        for (const entry of rawEntries) {
          const mainMeterId =
            typeof entry.mainMeterId === 'string' ? entry.mainMeterId.trim() : ''
          if (!mongoose.isValidObjectId(mainMeterId)) {
            throw new Error('INVALID_MAIN_METER')
          }
          if (seenMeterIds.has(mainMeterId)) {
            throw new Error('DUPLICATE_METER_IN_BATCH')
          }
          seenMeterIds.add(mainMeterId)

          const meter = meterById.get(mainMeterId)
          if (!meter) {
            throw new Error('INVALID_MAIN_METER')
          }

          if (meter.status !== 'active') {
            throw new Error(`INACTIVE_MAIN_METER:${meter.name}`)
          }

          const assignedRoomIds: string[] = ((meter.assignedRooms ?? []) as unknown[]).map(
            (id: unknown) => String(id),
          )
          if (assignedRoomIds.length === 0) {
            throw new Error(`NO_ASSIGNED_ROOMS:${meter.name}`)
          }

          const meterReadings = assignedRoomIds
            .map((rId: string) => readingByRoomId.get(rId))
            .filter((r): r is NonNullable<typeof r> => Boolean(r))

          if (meterReadings.length !== assignedRoomIds.length) {
            throw new Error(`MISSING_SUB_METER_READINGS:${meter.name}`)
          }

          const totalConsumption = roundUnits(
            meterReadings.reduce((sum: number, r) => sum + Number(r.consumption ?? 0), 0),
          )

          if (totalConsumption <= 0) {
            throw new Error(`ZERO_TOTAL_CONSUMPTION:${meter.name}`)
          }

          const hasBillAmount =
            entry.billAmount !== undefined &&
            entry.billAmount !== null &&
            entry.billAmount !== ''

          if (!hasBillAmount) {
            throw new Error(`INVALID_BILL_AMOUNT:${meter.name}`)
          }

          const billAmount = Number(entry.billAmount)
          if (!Number.isFinite(billAmount) || billAmount < 0) {
            throw new Error(`INVALID_BILL_AMOUNT:${meter.name}`)
          }

          const billDate =
            typeof entry.billDate === 'string' && entry.billDate.trim()
              ? entry.billDate.trim()
              : defaultBillDate
          const billReference =
            typeof entry.billReference === 'string' ? entry.billReference.trim() : ''

          const existingBill = await MonthlyMainMeterBill.findOne({
            billingMonth,
            mainMeterId: meter._id,
          }).session(session)

          if (existingBill?.status === 'finalized') {
            throw new Error('MONTH_FINALIZED')
          }

          if (createOnly && existingBill) {
            throw new Error(`DUPLICATE_MONTHLY_BILL:${meter.name}`)
          }

          if (existingBill) {
            if (existingBill.billAmount !== roundMoney(billAmount) && cycle?.lastCorrectionReason) {
              existingBill.revisionHistory.push({
                revisedAt: new Date(),
                reason: cycle.lastCorrectionReason,
                billAmount: existingBill.billAmount,
                billDate: existingBill.billDate,
                billReference: existingBill.billReference,
              })
            }

            existingBill.slotNumber = meter.slotNumber
            existingBill.mainMeterName = meter.name
            existingBill.assignedRooms = assignedRoomIds.map(
              (id) => new mongoose.Types.ObjectId(id),
            )
            existingBill.totalConsumption = totalConsumption
            existingBill.billAmount = roundMoney(billAmount)
            existingBill.billDate = billDate
            existingBill.billReference = billReference
            await existingBill.save({ session })
          } else {
            await MonthlyMainMeterBill.create(
              [
                {
                  billingMonth,
                  mainMeterId: meter._id,
                  slotNumber: meter.slotNumber,
                  mainMeterName: meter.name,
                  assignedRooms: assignedRoomIds.map(
                    (id) => new mongoose.Types.ObjectId(id),
                  ),
                  totalConsumption,
                  billAmount: roundMoney(billAmount),
                  billDate,
                  billReference,
                  status: 'draft',
                },
              ],
              { session },
            )
          }
        }

        await recalculateMonthlyAllocations(billingMonth, session)
      })
    } catch (error) {
      const msg = (error as Error).message
      if (msg === 'MONTH_FINALIZED') {
        return NextResponse.json(
          {
            error:
              'This billing month is finalized and cannot be edited directly. Use the controlled correction action to reopen it.',
          },
          { status: 409 },
        )
      }
      if (msg === 'INVALID_MAIN_METER' || msg === 'DUPLICATE_METER_IN_BATCH') {
        return NextResponse.json(
          { error: 'Invalid or duplicate main meter in bill submission.' },
          { status: 400 },
        )
      }
      if (msg.startsWith('DUPLICATE_MONTHLY_BILL:')) {
        const meterName = msg.split(':')[1]
        return NextResponse.json(
          { error: `${meterName} already has a bill recorded for ${billingMonth}.` },
          { status: 409 },
        )
      }
      if (msg.startsWith('INACTIVE_MAIN_METER:')) {
        const meterName = msg.split(':')[1]
        return NextResponse.json(
          { error: `Cannot enter a bill for inactive ${meterName}.` },
          { status: 400 },
        )
      }
      if (msg.startsWith('NO_ASSIGNED_ROOMS:')) {
        const meterName = msg.split(':')[1]
        return NextResponse.json(
          {
            error: `Cannot distribute a bill for ${meterName} because it has no assigned rooms.`,
          },
          { status: 400 },
        )
      }
      if (msg.startsWith('MISSING_SUB_METER_READINGS:')) {
        const meterName = msg.split(':')[1]
        return NextResponse.json(
          {
            error: `Cannot distribute a bill for ${meterName} because one or more of its assigned rooms are missing sub-meter readings for ${billingMonth}.`,
          },
          { status: 400 },
        )
      }
      if (msg.startsWith('ZERO_TOTAL_CONSUMPTION:')) {
        const meterName = msg.split(':')[1]
        return NextResponse.json(
          {
            error: `Cannot distribute a bill for ${meterName} because the total consumption across its assigned rooms is 0 units.`,
          },
          { status: 400 },
        )
      }
      if (msg.startsWith('INVALID_BILL_AMOUNT:')) {
        const meterName = msg.split(':')[1]
        return NextResponse.json(
          {
            error: `Electricity bill amount for ${meterName} must be a non-negative number.`,
          },
          { status: 400 },
        )
      }
      if ((error as { code?: number }).code === 11000) {
        return NextResponse.json(
          { error: 'Duplicate monthly main meter bill record detected.' },
          { status: 409 },
        )
      }
      if (isTransactionUnsupportedError(error)) {
        return NextResponse.json(
          { error: 'MongoDB transactions are not supported by the current database deployment.' },
          { status: 500 },
        )
      }
      throw error
    } finally {
      await session.endSession()
    }

    const workspace = await getMonthlyElectricityWorkspace(billingMonth)
    return NextResponse.json(workspace)
  } catch {
    return NextResponse.json(
      { error: 'Unable to save main meter electricity bills.' },
      { status: 500 },
    )
  }
}
