import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase, isTransactionUnsupportedError } from '@/lib/mongodb'
import { Resident } from '@/models/resident'
import { ensureRoomsExist, Room } from '@/models/room'

export async function GET() {
  try {
    await connectToDatabase()
    await ensureRoomsExist()
    const rooms = await Room.find().sort({ roomNumber: 1 }).lean()
    return NextResponse.json({ rooms })
  } catch {
    return NextResponse.json({ error: 'Unable to load rooms.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const roomNumber = Number(body.roomNumber)
    const monthlyRent = body.monthlyRent === '' || body.monthlyRent == null ? null : Number(body.monthlyRent)
    const status = body.status

    if (!Number.isInteger(roomNumber) || roomNumber < 1 || roomNumber > 26) {
      return NextResponse.json({ error: 'Invalid room number.' }, { status: 400 })
    }
    if (!['occupied', 'vacant'].includes(status)) {
      return NextResponse.json({ error: 'Invalid room status.' }, { status: 400 })
    }
    if (monthlyRent !== null && (!Number.isFinite(monthlyRent) || monthlyRent < 0)) {
      return NextResponse.json({ error: 'Monthly rent must be a non-negative number.' }, { status: 400 })
    }

    await connectToDatabase()
    const session = await mongoose.startSession()
    let updatedRoom = null

    try {
      await session.withTransaction(async () => {
        const existingRoom = await Room.findOne({ roomNumber }).session(session)
        if (!existingRoom) {
          throw new Error('ROOM_NOT_FOUND')
        }

        const activeResident = await Resident.findOne({
          roomId: existingRoom._id,
          status: 'active',
        }).session(session)

        if (activeResident && status === 'vacant') {
          throw new Error('CONFLICT_ACTIVE_RESIDENT')
        }

        if (!activeResident && status === 'occupied') {
          throw new Error('CONFLICT_NO_RESIDENT')
        }

        if (activeResident && monthlyRent === null) {
          throw new Error('RENT_REQUIRED_FOR_ACTIVE')
        }

        existingRoom.status = activeResident ? 'occupied' : 'vacant'
        existingRoom.currentResident = activeResident ? activeResident.fullName : null
        existingRoom.monthlyRent = monthlyRent
        await existingRoom.save({ session })

        if (activeResident && monthlyRent !== null) {
          activeResident.monthlyRent = monthlyRent
          await activeResident.save({ session })
        }

        updatedRoom = existingRoom.toObject()
      })
    } catch (error) {
      const code = (error as Error).message
      if (code === 'ROOM_NOT_FOUND') {
        return NextResponse.json({ error: 'Room not found.' }, { status: 404 })
      }
      if (code === 'CONFLICT_ACTIVE_RESIDENT') {
        return NextResponse.json(
          { error: 'Cannot mark an occupied room as vacant while an active resident is assigned. Please vacate the resident from their profile.' },
          { status: 409 },
        )
      }
      if (code === 'CONFLICT_NO_RESIDENT') {
        return NextResponse.json(
          { error: 'Cannot mark a vacant room as occupied without an active resident. Please assign a resident from the Residents page.' },
          { status: 409 },
        )
      }
      if (code === 'RENT_REQUIRED_FOR_ACTIVE') {
        return NextResponse.json(
          { error: 'Monthly rent is required while an active resident is assigned to this room.' },
          { status: 400 },
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

    return NextResponse.json({ room: updatedRoom })
  } catch {
    return NextResponse.json({ error: 'Unable to update room.' }, { status: 500 })
  }
}
