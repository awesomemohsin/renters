import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const roomSchema = new Schema(
  {
    roomNumber: { type: Number, required: true, unique: true, min: 1, max: 26 },
    floor: { type: Number, required: true, min: 1, max: 5 },
    status: { type: String, enum: ['occupied', 'vacant'], default: 'vacant', required: true },
    monthlyRent: { type: Number, default: null, min: 0 },
    currentResident: { type: String, default: null, trim: true },
  },
  { timestamps: true },
)

export type RoomDocument = InferSchemaType<typeof roomSchema> & { _id: mongoose.Types.ObjectId }
export const Room = mongoose.models.Room || mongoose.model('Room', roomSchema)

export const ROOM_LAYOUT = [
  { floor: 1, rooms: [1, 2, 3, 4, 5, 6] },
  { floor: 2, rooms: [7, 8, 9, 10, 11, 12] },
  { floor: 3, rooms: [13, 14] },
  { floor: 4, rooms: [15, 16, 17, 18, 19, 20] },
  { floor: 5, rooms: [21, 22, 23, 24, 25, 26] },
]

export async function ensureRoomsExist() {
  const operations = ROOM_LAYOUT.flatMap(({ floor, rooms }) =>
    rooms.map((roomNumber) => ({
      updateOne: {
        filter: { roomNumber },
        update: { $setOnInsert: { roomNumber, floor, status: 'vacant' } },
        upsert: true,
      },
    })),
  )
  await Room.bulkWrite(operations, { ordered: false })
}
