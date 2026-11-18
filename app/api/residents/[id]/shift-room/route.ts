import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase, isTransactionUnsupportedError } from '@/lib/mongodb'
import { Resident } from '@/models/resident'
import { Room } from '@/models/room'
import { WiFiConfiguration } from '@/models/wifi-configuration'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid resident ID.' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const targetRoomId = String(body.targetRoomId || '').trim()
    const shiftDate = String(body.shiftDate || '').trim() || new Date().toISOString().slice(0, 10)
    const notes = String(body.notes || '').trim()
    const customRent = Number(body.newMonthlyRent)

    if (!mongoose.isValidObjectId(targetRoomId)) {
      return NextResponse.json(
        { error: 'Please select a valid destination room.' },
        { status: 400 },
      )
    }

    await connectToDatabase()

    const session = await mongoose.startSession()

    try {
      let resultData = {
        residentName: '',
        oldRoomNumber: 0,
        newRoomNumber: 0,
        newRent: 0,
      }

      const executeShift = async (s: mongoose.ClientSession | null) => {
        const queryOpts = s ? { session: s } : {}

        const resident = await Resident.findById(id, null, queryOpts)
        if (!resident) {
          throw new Error('RESIDENT_NOT_FOUND')
        }
        if (resident.status !== 'active') {
          throw new Error('RESIDENT_NOT_ACTIVE')
        }

        const oldRoomId = resident.roomId ? String(resident.roomId) : null
        if (oldRoomId && oldRoomId === targetRoomId) {
          throw new Error('SAME_ROOM')
        }

        const newRoom = await Room.findById(targetRoomId, null, queryOpts)
        if (!newRoom) {
          throw new Error('TARGET_ROOM_NOT_FOUND')
        }

        // Ensure target room is not occupied by another active resident
        const existingOccupant = await Resident.findOne(
          {
            roomId: newRoom._id,
            status: 'active',
            _id: { $ne: resident._id },
          },
          null,
          queryOpts,
        )
        if (existingOccupant) {
          throw new Error(`ROOM_OCCUPIED:${newRoom.roomNumber}:${existingOccupant.fullName}`)
        }

        let oldRoomNumber = 0
        let oldRoomFloor = 0
        if (oldRoomId) {
          const oldRoom = await Room.findById(oldRoomId, null, queryOpts)
          if (oldRoom) {
            oldRoomNumber = oldRoom.roomNumber
            oldRoomFloor = oldRoom.floor
            oldRoom.status = 'vacant'
            await oldRoom.save(queryOpts)
          }
        }

        const newMonthlyRent =
          !Number.isNaN(customRent) && customRent > 0
            ? customRent
            : newRoom.monthlyRent || resident.monthlyRent || 0

        // Maintain room tenancy history on the resident
        const currentHistory = Array.isArray(resident.roomHistory)
          ? [...resident.roomHistory]
          : []

        if (oldRoomId && oldRoomNumber > 0) {
          if (currentHistory.length === 0) {
            // Seed initial room tenancy
            currentHistory.push({
              roomId: new mongoose.Types.ObjectId(oldRoomId),
              roomNumber: oldRoomNumber,
              floor: oldRoomFloor,
              monthlyRent: resident.monthlyRent,
              fromDate: resident.moveInDate || shiftDate,
              toDate: shiftDate,
              reason: 'Initial tenancy before room shift',
            })
          } else {
            // Close previous room tenancy
            const lastEntry = currentHistory[currentHistory.length - 1]
            if (lastEntry && !lastEntry.toDate) {
              lastEntry.toDate = shiftDate
            }
          }
        }

        // Add new room tenancy entry
        currentHistory.push({
          roomId: newRoom._id,
          roomNumber: newRoom.roomNumber,
          floor: newRoom.floor,
          monthlyRent: newMonthlyRent,
          fromDate: shiftDate,
          toDate: null,
          reason: notes || `Shifted from Room ${oldRoomNumber || 'N/A'}`,
        })

        resident.roomHistory = currentHistory
        resident.roomId = newRoom._id
        resident.monthlyRent = newMonthlyRent
        await resident.save(queryOpts)

        // Mark new room as occupied
        newRoom.status = 'occupied'
        if (newMonthlyRent > 0) {
          newRoom.monthlyRent = newMonthlyRent
        }
        await newRoom.save(queryOpts)

        // Update WiFi Configuration if active for this resident
        await WiFiConfiguration.updateMany(
          { residentId: resident._id },
          { $set: { roomId: newRoom._id } },
          queryOpts,
        )

        resultData = {
          residentName: resident.fullName,
          oldRoomNumber,
          newRoomNumber: newRoom.roomNumber,
          newRent: newMonthlyRent,
        }
      }

      try {
        await session.withTransaction(async () => {
          await executeShift(session)
        })
      } catch (txErr) {
        if (isTransactionUnsupportedError(txErr)) {
          await executeShift(null)
        } else {
          throw txErr
        }
      }

      return NextResponse.json({
        ok: true,
        message: `Successfully shifted ${resultData.residentName} from Room ${resultData.oldRoomNumber || 'N/A'} to Room ${resultData.newRoomNumber}. Outstanding dues carry forward automatically.`,
        data: resultData,
      })
    } finally {
      await session.endSession()
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    if (errorMsg === 'RESIDENT_NOT_FOUND') {
      return NextResponse.json({ error: 'Resident not found.' }, { status: 404 })
    }
    if (errorMsg === 'RESIDENT_NOT_ACTIVE') {
      return NextResponse.json(
        { error: 'Cannot shift an inactive or vacated renter.' },
        { status: 400 },
      )
    }
    if (errorMsg === 'SAME_ROOM') {
      return NextResponse.json(
        { error: 'Renter is already in this room. Please select a different room.' },
        { status: 400 },
      )
    }
    if (errorMsg.startsWith('ROOM_OCCUPIED:')) {
      const [, roomNum, occupantName] = errorMsg.split(':')
      return NextResponse.json(
        {
          error: `Room ${roomNum} is already occupied by ${occupantName}. Please choose a vacant room or vacate the existing occupant first.`,
        },
        { status: 400 },
      )
    }

    console.error('Room shift error:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred while shifting rooms.' },
      { status: 500 },
    )
  }
}
