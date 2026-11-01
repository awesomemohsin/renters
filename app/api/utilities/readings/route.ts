import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import {
  calculateConsumption,
  getMonthlyElectricityWorkspace,
  isValidBillingMonth,
  recalculateMonthlyAllocations,
} from '@/lib/electricity-calculations'
import { connectToDatabase, isTransactionUnsupportedError } from '@/lib/mongodb'
import { MonthlyElectricityCycle } from '@/models/monthly-electricity-allocation'
import { MonthlySubMeterReading } from '@/models/monthly-sub-meter-reading'
import { Resident } from '@/models/resident'
import { ensureRoomsExist, Room } from '@/models/room'
import { ensureSubMetersExist, SubMeter } from '@/models/sub-meter'

type RawReadingEntry = {
  roomId?: unknown
  previousReading?: unknown
  currentReading?: unknown
  readingDate?: unknown
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const billingMonth = typeof body.billingMonth === 'string' ? body.billingMonth.trim() : ''
    const defaultReadingDate =
      typeof body.readingDate === 'string' && body.readingDate.trim()
        ? body.readingDate.trim()
        : new Date().toISOString().slice(0, 10)
    const createOnly = body.mode === 'create_only'

    if (!isValidBillingMonth(billingMonth)) {
      return NextResponse.json(
        { error: 'Invalid billing month format. Expected YYYY-MM.' },
        { status: 400 },
      )
    }

    const rawEntries: RawReadingEntry[] = Array.isArray(body.entries)
      ? body.entries
      : body.roomId !== undefined
        ? [
            {
              roomId: body.roomId,
              previousReading: body.previousReading,
              currentReading: body.currentReading,
              readingDate: body.readingDate,
            },
          ]
        : []

    if (rawEntries.length === 0) {
      return NextResponse.json(
        { error: 'Please provide at least one room sub-meter reading.' },
        { status: 400 },
      )
    }

    await connectToDatabase()
    await ensureRoomsExist()
    await ensureSubMetersExist()

    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        const cycle = await MonthlyElectricityCycle.findOne({ billingMonth }).session(session)
        if (cycle?.status === 'finalized') {
          throw new Error('MONTH_FINALIZED')
        }

        const [rooms, activeResidents, subMeters] = await Promise.all([
          Room.find().session(session).lean(),
          Resident.find({ status: 'active' }).session(session).lean(),
          SubMeter.find().session(session).lean(),
        ])

        const roomById = new Map(rooms.map((r) => [String(r._id), r]))
        const residentByRoomId = new Map(
          activeResidents
            .filter((r) => r.roomId)
            .map((r) => [String(r.roomId), r]),
        )
        const subMeterByRoomId = new Map(subMeters.map((s) => [String(s.roomId), s]))

        const seenRoomIds = new Set<string>()

        for (const entry of rawEntries) {
          const roomId = typeof entry.roomId === 'string' ? entry.roomId.trim() : ''
          if (!mongoose.isValidObjectId(roomId)) {
            throw new Error('INVALID_ROOM')
          }
          if (seenRoomIds.has(roomId)) {
            throw new Error('DUPLICATE_ROOM_IN_BATCH')
          }
          seenRoomIds.add(roomId)

          const room = roomById.get(roomId)
          if (!room) {
            throw new Error('INVALID_ROOM')
          }

          const existingReading = await MonthlySubMeterReading.findOne({
            billingMonth,
            roomId: room._id,
          }).session(session)

          if (existingReading?.status === 'finalized') {
            throw new Error('MONTH_FINALIZED')
          }

          if (createOnly && existingReading) {
            throw new Error(`DUPLICATE_MONTHLY_READING:${room.roomNumber}`)
          }

          // Retrieve latest valid reading from a prior month for this room
          const priorReadingDoc = await MonthlySubMeterReading.findOne({
            roomId: room._id,
            billingMonth: { $lt: billingMonth },
          })
            .sort({ billingMonth: -1 })
            .session(session)
            .lean()

          let previousReading: number
          let isOpeningReading: boolean
          let previousReadingId: mongoose.Types.ObjectId | null = null

          if (priorReadingDoc) {
            previousReading = priorReadingDoc.currentReading
            isOpeningReading = false
            previousReadingId = priorReadingDoc._id
          } else {
            const hasOpeningInput =
              entry.previousReading !== undefined &&
              entry.previousReading !== null &&
              entry.previousReading !== ''

            if (!hasOpeningInput) {
              throw new Error(`OPENING_READING_REQUIRED:${room.roomNumber}`)
            }
            previousReading = Number(entry.previousReading)
            isOpeningReading = true
          }

          const hasCurrentInput =
            entry.currentReading !== undefined &&
            entry.currentReading !== null &&
            entry.currentReading !== ''

          if (!hasCurrentInput) {
            throw new Error(`CURRENT_READING_REQUIRED:${room.roomNumber}`)
          }

          const currentReading = Number(entry.currentReading)
          let consumption: number
          try {
            consumption = calculateConsumption(previousReading, currentReading)
          } catch (calcErr) {
            throw new Error(`${(calcErr as Error).message}:${room.roomNumber}`)
          }

          const readingDate =
            typeof entry.readingDate === 'string' && entry.readingDate.trim()
              ? entry.readingDate.trim()
              : defaultReadingDate

          const activeResident = residentByRoomId.get(roomId)
          const subMeter = subMeterByRoomId.get(roomId)

          if (existingReading) {
            const valueChanged =
              existingReading.previousReading !== previousReading ||
              existingReading.currentReading !== currentReading

            if (valueChanged && cycle?.lastCorrectionReason) {
              existingReading.revisionHistory.push({
                revisedAt: new Date(),
                reason: cycle.lastCorrectionReason,
                previousReading: existingReading.previousReading,
                currentReading: existingReading.currentReading,
                consumption: existingReading.consumption,
              })
            }

            existingReading.roomNumber = room.roomNumber
            existingReading.floor = room.floor
            existingReading.subMeterId = subMeter ? subMeter._id : null
            existingReading.residentId = activeResident ? activeResident._id : null
            existingReading.residentName = activeResident ? activeResident.fullName : null
            existingReading.isVacant = !activeResident
            existingReading.previousReadingId = previousReadingId
            existingReading.isOpeningReading = isOpeningReading
            existingReading.previousReading = previousReading
            existingReading.currentReading = currentReading
            existingReading.consumption = consumption
            existingReading.readingDate = readingDate
            await existingReading.save({ session })
          } else {
            await MonthlySubMeterReading.create(
              [
                {
                  billingMonth,
                  roomId: room._id,
                  roomNumber: room.roomNumber,
                  floor: room.floor,
                  subMeterId: subMeter ? subMeter._id : null,
                  residentId: activeResident ? activeResident._id : null,
                  residentName: activeResident ? activeResident.fullName : null,
                  isVacant: !activeResident,
                  previousReadingId,
                  isOpeningReading,
                  previousReading,
                  currentReading,
                  consumption,
                  readingDate,
                  status: 'draft',
                },
              ],
              { session },
            )
          }

          // If a subsequent month's reading already exists in draft state and links to this room, update its previousReading only if it is still draft
          const nextDraftReading = await MonthlySubMeterReading.findOne({
            roomId: room._id,
            billingMonth: { $gt: billingMonth },
            status: 'draft',
          })
            .sort({ billingMonth: 1 })
            .session(session)

          if (nextDraftReading && nextDraftReading.currentReading >= currentReading) {
            nextDraftReading.previousReading = currentReading
            nextDraftReading.isOpeningReading = false
            nextDraftReading.consumption = calculateConsumption(
              currentReading,
              nextDraftReading.currentReading,
            )
            await nextDraftReading.save({ session })
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
      if (msg === 'INVALID_ROOM' || msg === 'DUPLICATE_ROOM_IN_BATCH') {
        return NextResponse.json(
          { error: 'Invalid or duplicate room in reading submission.' },
          { status: 400 },
        )
      }
      if (msg.startsWith('DUPLICATE_MONTHLY_READING:')) {
        const roomNum = msg.split(':')[1]
        return NextResponse.json(
          { error: `Room ${String(roomNum).padStart(2, '0')} already has a reading for ${billingMonth}.` },
          { status: 409 },
        )
      }
      if (msg.startsWith('OPENING_READING_REQUIRED:')) {
        const roomNum = msg.split(':')[1]
        return NextResponse.json(
          {
            error: `Room ${String(roomNum).padStart(2, '0')} has no previous month reading. Please enter an opening reading.`,
          },
          { status: 400 },
        )
      }
      if (msg.startsWith('CURRENT_READING_REQUIRED:')) {
        const roomNum = msg.split(':')[1]
        return NextResponse.json(
          { error: `Please enter a current reading for Room ${String(roomNum).padStart(2, '0')}.` },
          { status: 400 },
        )
      }
      if (msg.startsWith('INVALID_PREVIOUS_READING:') || msg.startsWith('INVALID_CURRENT_READING:')) {
        const roomNum = msg.split(':')[1]
        return NextResponse.json(
          {
            error: `Readings for Room ${String(roomNum).padStart(2, '0')} must be non-negative numbers.`,
          },
          { status: 400 },
        )
      }
      if (msg.startsWith('CURRENT_LESS_THAN_PREVIOUS:')) {
        const roomNum = msg.split(':')[1]
        return NextResponse.json(
          {
            error: `Current reading for Room ${String(roomNum).padStart(2, '0')} cannot be less than its previous reading.`,
          },
          { status: 400 },
        )
      }
      if ((error as { code?: number }).code === 11000) {
        return NextResponse.json(
          { error: 'Duplicate monthly sub-meter reading record detected.' },
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
      { error: 'Unable to save monthly sub-meter readings.' },
      { status: 500 },
    )
  }
}

