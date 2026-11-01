import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase, isTransactionUnsupportedError } from '@/lib/mongodb'
import { MainMeter } from '@/models/main-meter'
import { Room } from '@/models/room'

const cleanString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid main meter.' }, { status: 400 })
  }

  try {
    await connectToDatabase()
    const mainMeter = await MainMeter.findById(id)
      .populate({
        path: 'assignedRooms',
        select: 'roomNumber floor status currentResident',
        options: { sort: { roomNumber: 1 } },
      })
      .lean()

    if (!mainMeter) {
      return NextResponse.json({ error: 'Main meter not found.' }, { status: 404 })
    }
    return NextResponse.json({ mainMeter })
  } catch {
    return NextResponse.json({ error: 'Unable to load main meter.' }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid main meter.' }, { status: 400 })
  }

  try {
    const body = await request.json()
    await connectToDatabase()

    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        const meter = await MainMeter.findById(id).session(session)
        if (!meter) {
          throw new Error('METER_NOT_FOUND')
        }

        if (body.name !== undefined) {
          const name = cleanString(body.name)
          if (name.length < 2) {
            throw new Error('INVALID_NAME')
          }
          meter.name = name
        }

        if (body.meterNumber !== undefined) {
          const rawNumber = cleanString(body.meterNumber)
          const meterNumber = rawNumber === '' ? null : rawNumber
          if (meterNumber !== null) {
            const duplicateNumber = await MainMeter.findOne({
              _id: { $ne: meter._id },
              meterNumber,
            }).session(session)
            if (duplicateNumber) {
              throw new Error('DUPLICATE_METER_NUMBER')
            }
          }
          meter.meterNumber = meterNumber
        }

        if (body.location !== undefined) {
          meter.location = cleanString(body.location)
        }

        if (body.description !== undefined) {
          meter.description = cleanString(body.description)
        }

        const nextStatus: 'active' | 'inactive' =
          body.status !== undefined ? body.status : meter.status

        if (!['active', 'inactive'].includes(nextStatus)) {
          throw new Error('INVALID_STATUS')
        }

        const existingRoomIds = new Set(meter.assignedRooms.map((roomId: unknown) => String(roomId)))

        if (body.assignedRooms !== undefined) {
          if (!Array.isArray(body.assignedRooms)) {
            throw new Error('INVALID_ROOMS')
          }

          const requestedRoomIds = body.assignedRooms.map((item: unknown) => cleanString(item)).filter(Boolean)

          if (new Set(requestedRoomIds).size !== requestedRoomIds.length) {
            throw new Error('DUPLICATE_ROOMS_IN_REQUEST')
          }

          if (requestedRoomIds.some((roomId: string) => !mongoose.isValidObjectId(roomId))) {
            throw new Error('INVALID_ROOMS')
          }

          if (nextStatus === 'inactive') {
            const isAddingOrAssigningRooms =
              requestedRoomIds.length > 0 &&
              (meter.status === 'inactive' ||
                requestedRoomIds.some((roomId: string) => !existingRoomIds.has(roomId)))

            if (isAddingOrAssigningRooms) {
              throw new Error('INACTIVE_METER_ASSIGNMENT')
            }
            meter.assignedRooms = []
          } else {
            const validRooms = await Room.find({ _id: { $in: requestedRoomIds } })
              .sort({ roomNumber: 1 })
              .session(session)

            if (validRooms.length !== requestedRoomIds.length) {
              throw new Error('INVALID_ROOMS')
            }

            if (validRooms.length > 0) {
              const conflictingMeter = await MainMeter.findOne({
                _id: { $ne: meter._id },
                status: 'active',
                assignedRooms: { $in: validRooms.map((r) => r._id) },
              }).session(session)

              if (conflictingMeter) {
                throw new Error(`ROOM_ALREADY_ASSIGNED:${conflictingMeter.name}`)
              }
            }

            meter.assignedRooms = validRooms.map((r) => r._id)
          }
        } else if (nextStatus === 'inactive') {
          meter.assignedRooms = []
        } else if (nextStatus === 'active' && meter.assignedRooms.length > 0) {
          const conflictingMeter = await MainMeter.findOne({
            _id: { $ne: meter._id },
            status: 'active',
            assignedRooms: { $in: meter.assignedRooms },
          }).session(session)

          if (conflictingMeter) {
            throw new Error(`ROOM_ALREADY_ASSIGNED:${conflictingMeter.name}`)
          }
        }

        meter.status = nextStatus
        await meter.save({ session })
      })
    } catch (error) {
      const message = (error as Error).message
      if (message === 'METER_NOT_FOUND') {
        return NextResponse.json({ error: 'Main meter not found.' }, { status: 404 })
      }
      if (message === 'INVALID_NAME') {
        return NextResponse.json({ error: 'Meter name must be at least 2 characters.' }, { status: 400 })
      }
      if (message === 'INVALID_STATUS') {
        return NextResponse.json({ error: 'Invalid meter status.' }, { status: 400 })
      }
      if (message === 'INVALID_ROOMS' || message === 'DUPLICATE_ROOMS_IN_REQUEST') {
        return NextResponse.json({ error: 'Please select valid, non-duplicate rooms.' }, { status: 400 })
      }
      if (message === 'INACTIVE_METER_ASSIGNMENT') {
        return NextResponse.json(
          { error: 'Inactive main meters cannot receive room assignments. Activate the meter first.' },
          { status: 400 },
        )
      }
      if (message === 'DUPLICATE_METER_NUMBER') {
        return NextResponse.json(
          { error: 'That meter number is already in use by another main meter.' },
          { status: 409 },
        )
      }
      if (message.startsWith('ROOM_ALREADY_ASSIGNED:')) {
        const conflictName = message.split(':')[1] || 'another active main meter'
        return NextResponse.json(
          { error: `One or more selected rooms are already assigned to ${conflictName}.` },
          { status: 409 },
        )
      }
      if ((error as { code?: number }).code === 11000) {
        return NextResponse.json(
          { error: 'Duplicate meter number or room assignment detected.' },
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

    const updatedMainMeter = await MainMeter.findById(id)
      .populate({
        path: 'assignedRooms',
        select: 'roomNumber floor status currentResident',
        options: { sort: { roomNumber: 1 } },
      })
      .lean()

    return NextResponse.json({ mainMeter: updatedMainMeter })
  } catch {
    return NextResponse.json({ error: 'Unable to update main meter.' }, { status: 500 })
  }
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Main meters cannot be deleted to preserve historical readings. Deactivate the meter instead.' },
    { status: 405 },
  )
}

