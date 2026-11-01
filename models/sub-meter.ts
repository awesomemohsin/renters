import mongoose, { Schema, type InferSchemaType } from 'mongoose'
import { ensureRoomsExist, Room } from '@/models/room'

const subMeterSchema = new Schema(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    roomNumber: { type: Number, required: true, min: 1, max: 26 },
    meterNumber: { type: String, default: null, trim: true },
    location: { type: String, default: '', trim: true },
    installationDate: { type: String, default: '' },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      required: true,
    },
    description: { type: String, default: '', trim: true },
    hasHistoricalReadings: { type: Boolean, default: false },
  },
  { timestamps: true },
)

subMeterSchema.index(
  { roomId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
  },
)

subMeterSchema.index(
  { meterNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { meterNumber: { $type: 'string' } },
  },
)

export type SubMeterDocument = InferSchemaType<typeof subMeterSchema> & {
  _id: mongoose.Types.ObjectId
}

export const SubMeter =
  mongoose.models.SubMeter || mongoose.model('SubMeter', subMeterSchema)

export async function ensureSubMetersExist() {
  await ensureRoomsExist()
  const rooms = await Room.find().sort({ roomNumber: 1 }).lean()
  const existing = await SubMeter.find({
    roomId: { $in: rooms.map((room) => room._id) },
  })
    .select('roomId')
    .lean()

  const existingRoomIds = new Set(existing.map((item) => String(item.roomId)))
  const missingRooms = rooms.filter((room) => !existingRoomIds.has(String(room._id)))

  if (missingRooms.length === 0) return

  const operations = missingRooms.map((room) => ({
    updateOne: {
      filter: { roomId: room._id },
      update: {
        $setOnInsert: {
          roomId: room._id,
          roomNumber: room.roomNumber,
          meterNumber: null,
          location: '',
          installationDate: '',
          status: 'active',
          description: '',
          hasHistoricalReadings: false,
        },
      },
      upsert: true,
    },
  }))

  await SubMeter.bulkWrite(operations, { ordered: false })
}

