import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase, isTransactionUnsupportedError } from '@/lib/mongodb'
import { SubMeter } from '@/models/sub-meter'

const cleanString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid sub-meter.' }, { status: 400 })
  }

  try {
    await connectToDatabase()
    const subMeter = await SubMeter.findById(id)
      .populate('roomId', 'roomNumber floor status currentResident')
      .lean()

    if (!subMeter) {
      return NextResponse.json({ error: 'Sub-meter not found.' }, { status: 404 })
    }
    return NextResponse.json({ subMeter })
  } catch {
    return NextResponse.json({ error: 'Unable to load sub-meter.' }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid sub-meter.' }, { status: 400 })
  }

  try {
    const body = await request.json()
    await connectToDatabase()

    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        const subMeter = await SubMeter.findById(id).session(session)
        if (!subMeter) {
          throw new Error('SUB_METER_NOT_FOUND')
        }

        if (body.meterNumber !== undefined) {
          const rawNumber = cleanString(body.meterNumber)
          const meterNumber = rawNumber === '' ? null : rawNumber
          if (meterNumber !== null) {
            const duplicate = await SubMeter.findOne({
              _id: { $ne: subMeter._id },
              meterNumber,
            }).session(session)
            if (duplicate) {
              throw new Error('DUPLICATE_SUB_METER_NUMBER')
            }
          }
          subMeter.meterNumber = meterNumber
        }

        if (body.location !== undefined) {
          subMeter.location = cleanString(body.location)
        }

        if (body.installationDate !== undefined) {
          subMeter.installationDate = cleanString(body.installationDate)
        }

        if (body.description !== undefined) {
          subMeter.description = cleanString(body.description)
        }

        if (body.status !== undefined) {
          if (!['active', 'inactive'].includes(body.status)) {
            throw new Error('INVALID_STATUS')
          }
          if (body.status === 'active') {
            const existingActiveForRoom = await SubMeter.findOne({
              _id: { $ne: subMeter._id },
              roomId: subMeter.roomId,
              status: 'active',
            }).session(session)
            if (existingActiveForRoom) {
              throw new Error('ROOM_ACTIVE_SUB_METER_EXISTS')
            }
          }
          subMeter.status = body.status
        }

        await subMeter.save({ session })
      })
    } catch (error) {
      const code = (error as Error).message
      if (code === 'SUB_METER_NOT_FOUND') {
        return NextResponse.json({ error: 'Sub-meter not found.' }, { status: 404 })
      }
      if (code === 'INVALID_STATUS') {
        return NextResponse.json({ error: 'Invalid sub-meter status.' }, { status: 400 })
      }
      if (code === 'DUPLICATE_SUB_METER_NUMBER') {
        return NextResponse.json(
          { error: 'That sub-meter number is already assigned to another room.' },
          { status: 409 },
        )
      }
      if (code === 'ROOM_ACTIVE_SUB_METER_EXISTS') {
        return NextResponse.json(
          { error: 'This room already has an active sub-meter.' },
          { status: 409 },
        )
      }
      if ((error as { code?: number }).code === 11000) {
        return NextResponse.json(
          { error: 'Sub-meter number or active room sub-meter must be unique.' },
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

    const updatedSubMeter = await SubMeter.findById(id)
      .populate('roomId', 'roomNumber floor status currentResident')
      .lean()

    return NextResponse.json({ subMeter: updatedSubMeter })
  } catch {
    return NextResponse.json({ error: 'Unable to update sub-meter.' }, { status: 500 })
  }
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Sub-meters cannot be deleted to preserve historical readings. Deactivate the sub-meter instead.' },
    { status: 405 },
  )
}

