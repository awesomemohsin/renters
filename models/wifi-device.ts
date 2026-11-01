import mongoose, { Schema, type InferSchemaType } from 'mongoose'
import { WIFI_DEVICE_TYPES, type WiFiDeviceType } from '@/lib/wifi-types'

export { WIFI_DEVICE_TYPES, type WiFiDeviceType }

const deviceHistoryItemSchema = new Schema(
  {
    action: { type: String, required: true, trim: true },
    timestamp: { type: Date, required: true, default: Date.now },
    details: { type: String, default: '', trim: true },
  },
  { _id: false },
)

const wifiDeviceSchema = new Schema(
  {
    wifiConfigurationId: {
      type: Schema.Types.ObjectId,
      ref: 'WiFiConfiguration',
      required: true,
    },
    residentId: {
      type: Schema.Types.ObjectId,
      ref: 'Resident',
      required: true,
    },
    deviceName: {
      type: String,
      required: true,
      trim: true,
    },
    deviceType: {
      type: String,
      enum: WIFI_DEVICE_TYPES,
      required: true,
      default: 'Mobile',
    },
    macAddress: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/,
    },
    registrationDate: {
      type: String,
      required: true,
      trim: true,
    },
    deactivatedDate: {
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
    history: {
      type: [deviceHistoryItemSchema],
      default: [],
    },
  },
  { timestamps: true },
)

// Enforce uniqueness for active MAC addresses across the entire building.
// Deactivated devices (status: 'inactive') do not block MAC reuse.
wifiDeviceSchema.index(
  { macAddress: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
  },
)
wifiDeviceSchema.index({ wifiConfigurationId: 1, status: 1 })
wifiDeviceSchema.index({ residentId: 1, status: 1 })

export type WiFiDeviceDocument = InferSchemaType<typeof wifiDeviceSchema> & {
  _id: mongoose.Types.ObjectId
}

export const WiFiDevice =
  mongoose.models.WiFiDevice || mongoose.model('WiFiDevice', wifiDeviceSchema)

