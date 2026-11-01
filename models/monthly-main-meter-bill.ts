import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const billRevisionSchema = new Schema(
  {
    revisedAt: { type: Date, required: true, default: Date.now },
    reason: { type: String, default: '', trim: true },
    billAmount: { type: Number, required: true },
    billDate: { type: String, required: true },
    billReference: { type: String, default: '' },
  },
  { _id: false },
)

const monthlyMainMeterBillSchema = new Schema(
  {
    billingMonth: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },
    mainMeterId: { type: Schema.Types.ObjectId, ref: 'MainMeter', required: true },
    slotNumber: { type: Number, required: true, min: 1, max: 10 },
    mainMeterName: { type: String, required: true, trim: true },
    assignedRooms: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Room' }],
      default: [],
    },
    totalConsumption: { type: Number, required: true, min: 0, default: 0 },
    billAmount: { type: Number, required: true, min: 0 },
    billDate: { type: String, required: true, trim: true },
    billReference: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['draft', 'finalized'],
      default: 'draft',
      required: true,
    },
    finalizedAt: { type: Date, default: null },
    revisionHistory: { type: [billRevisionSchema], default: [] },
  },
  { timestamps: true },
)

monthlyMainMeterBillSchema.index({ billingMonth: 1, mainMeterId: 1 }, { unique: true })

export type MonthlyMainMeterBillDocument = InferSchemaType<
  typeof monthlyMainMeterBillSchema
> & {
  _id: mongoose.Types.ObjectId
}

export const MonthlyMainMeterBill =
  mongoose.models.MonthlyMainMeterBill ||
  mongoose.model('MonthlyMainMeterBill', monthlyMainMeterBillSchema)

