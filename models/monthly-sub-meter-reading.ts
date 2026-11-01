import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const readingRevisionSchema = new Schema(
  {
    revisedAt: { type: Date, required: true, default: Date.now },
    reason: { type: String, default: '', trim: true },
    previousReading: { type: Number, required: true },
    currentReading: { type: Number, required: true },
    consumption: { type: Number, required: true },
  },
  { _id: false },
)

const monthlySubMeterReadingSchema = new Schema(
  {
    billingMonth: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    roomNumber: { type: Number, required: true, min: 1, max: 26 },
    floor: { type: Number, required: true, min: 1, max: 5 },
    subMeterId: { type: Schema.Types.ObjectId, ref: 'SubMeter', default: null },
    residentId: { type: Schema.Types.ObjectId, ref: 'Resident', default: null },
    residentName: { type: String, default: null, trim: true },
    isVacant: { type: Boolean, required: true, default: false },
    previousReadingId: {
      type: Schema.Types.ObjectId,
      ref: 'MonthlySubMeterReading',
      default: null,
    },
    isOpeningReading: { type: Boolean, required: true, default: false },
    previousReading: { type: Number, required: true, min: 0 },
    currentReading: { type: Number, required: true, min: 0 },
    consumption: { type: Number, required: true, min: 0 },
    readingDate: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['draft', 'finalized'],
      default: 'draft',
      required: true,
    },
    finalizedAt: { type: Date, default: null },
    revisionHistory: { type: [readingRevisionSchema], default: [] },
  },
  { timestamps: true },
)

monthlySubMeterReadingSchema.index({ billingMonth: 1, roomId: 1 }, { unique: true })
monthlySubMeterReadingSchema.index({ roomId: 1, billingMonth: -1 })

export type MonthlySubMeterReadingDocument = InferSchemaType<
  typeof monthlySubMeterReadingSchema
> & {
  _id: mongoose.Types.ObjectId
}

export const MonthlySubMeterReading =
  mongoose.models.MonthlySubMeterReading ||
  mongoose.model('MonthlySubMeterReading', monthlySubMeterReadingSchema)

