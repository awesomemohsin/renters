import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const wifiChargeHistoryItemSchema = new Schema(
  {
    monthlyCharge: { type: Number, required: true, min: 0 },
    effectiveDate: { type: String, required: true, trim: true },
    changedAt: { type: Date, required: true, default: Date.now },
    notes: { type: String, default: '', trim: true },
  },
  { _id: false },
)

const wifiConfigurationSchema = new Schema(
  {
    residentId: {
      type: Schema.Types.ObjectId,
      ref: 'Resident',
      required: true,
    },
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    wifiName: {
      type: String,
      required: true,
      trim: true,
    },
    monthlyCharge: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    startDate: {
      type: String,
      required: true,
      trim: true,
    },
    endDate: {
      type: String,
      default: null,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      required: true,
      default: 'active',
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    chargeHistory: {
      type: [wifiChargeHistoryItemSchema],
      default: [],
    },
  },
  { timestamps: true },
)

// At most one active WiFiConfiguration per resident at any time; historical inactive records are preserved.
wifiConfigurationSchema.index(
  { residentId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
  },
)
wifiConfigurationSchema.index({ roomId: 1, status: 1 })
wifiConfigurationSchema.index({ status: 1 })

export type WiFiConfigurationDocument = InferSchemaType<typeof wifiConfigurationSchema> & {
  _id: mongoose.Types.ObjectId
}

export const WiFiConfiguration =
  mongoose.models.WiFiConfiguration ||
  mongoose.model('WiFiConfiguration', wifiConfigurationSchema)

