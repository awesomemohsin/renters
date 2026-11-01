import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const mainMeterSchema = new Schema(
  {
    slotNumber: { type: Number, required: true, unique: true, min: 1, max: 10 },
    name: { type: String, required: true, trim: true, minlength: 2 },
    meterNumber: { type: String, default: null, trim: true },
    location: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    assignedRooms: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Room' }],
      default: [],
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      required: true,
    },
    hasHistoricalReadings: { type: Boolean, default: false },
  },
  { timestamps: true },
)

mainMeterSchema.index(
  { meterNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { meterNumber: { $type: 'string' } },
  },
)

mainMeterSchema.index(
  { assignedRooms: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: 'active',
      'assignedRooms.0': { $exists: true },
    },
  },
)

export type MainMeterDocument = InferSchemaType<typeof mainMeterSchema> & {
  _id: mongoose.Types.ObjectId
}

export const MainMeter =
  mongoose.models.MainMeter || mongoose.model('MainMeter', mainMeterSchema)

export const MAIN_METER_SLOTS = Array.from({ length: 10 }, (_, index) => {
  const slotNumber = index + 1
  const padded = String(slotNumber).padStart(2, '0')
  return {
    slotNumber,
    name: `Main Meter ${padded}`,
  }
})

export async function ensureMainMetersExist() {
  const operations = MAIN_METER_SLOTS.map(({ slotNumber, name }) => ({
    updateOne: {
      filter: { slotNumber },
      update: {
        $setOnInsert: {
          slotNumber,
          name,
          meterNumber: null,
          location: '',
          description: '',
          assignedRooms: [],
          status: 'active',
          hasHistoricalReadings: false,
        },
      },
      upsert: true,
    },
  }))

  await MainMeter.bulkWrite(operations, { ordered: false })
}

