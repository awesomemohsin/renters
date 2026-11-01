import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ensureMainMetersExist, MainMeter } from '@/models/main-meter'
import { ensureRoomsExist, Room } from '@/models/room'
import { ensureSubMetersExist, SubMeter } from '@/models/sub-meter'

export async function GET() {
  try {
    await connectToDatabase()
    await ensureRoomsExist()
    await ensureMainMetersExist()
    await ensureSubMetersExist()

    const [mainMeters, subMeters, rooms] = await Promise.all([
      MainMeter.find()
        .populate({
          path: 'assignedRooms',
          select: 'roomNumber floor status currentResident',
          options: { sort: { roomNumber: 1 } },
        })
        .sort({ slotNumber: 1 })
        .lean(),
      SubMeter.find()
        .populate('roomId', 'roomNumber floor status currentResident')
        .sort({ roomNumber: 1 })
        .lean(),
      Room.find().sort({ roomNumber: 1 }).lean(),
    ])

    const assignedRoomIds = new Set<string>()
    for (const meter of mainMeters) {
      if (meter.status === 'active' && Array.isArray(meter.assignedRooms)) {
        for (const room of meter.assignedRooms as { _id?: unknown }[]) {
          const id = room && typeof room === 'object' && '_id' in room ? String(room._id) : String(room)
          if (id) assignedRoomIds.add(id)
        }
      }
    }

    const assignedRoomsCount = rooms.filter((room) => assignedRoomIds.has(String(room._id))).length
    const unassignedRoomsCount = rooms.length - assignedRoomsCount

    return NextResponse.json({
      mainMeters,
      subMeters,
      rooms,
      summary: {
        totalMainMeters: mainMeters.length,
        activeMainMeters: mainMeters.filter((m) => m.status === 'active').length,
        totalSubMeters: subMeters.length,
        activeSubMeters: subMeters.filter((s) => s.status === 'active').length,
        assignedRooms: assignedRoomsCount,
        unassignedRooms: unassignedRoomsCount,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Unable to load electricity meters.' }, { status: 500 })
  }
}

