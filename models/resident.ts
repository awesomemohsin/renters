import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const documentSchema = new Schema({
  url: { type: String, default: null },
  name: { type: String, default: null },
  unavailable: { type: Boolean, default: false },
}, { _id: false })

const roomHistorySchema = new Schema(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    roomNumber: { type: Number, required: true },
    floor: { type: Number, required: true },
    monthlyRent: { type: Number, required: true },
    fromDate: { type: String, required: true },
    toDate: { type: String, default: null },
    reason: { type: String, default: '' },
  },
  { _id: false },
)

const residentSchema = new Schema({
  fullName: { type: String, required: true, trim: true, minlength: 2 },
  partnerName: { type: String, trim: true, default: '' },
  partnerPhone: { type: String, trim: true, default: '' },
  partnerNid: { type: String, trim: true, default: '' },
  spouseName: { type: String, trim: true, default: '' },
  fatherName: { type: String, trim: true, default: '' },
  motherName: { type: String, trim: true, default: '' },
  phone: { type: String, required: true, trim: true },
  alternativePhone: { type: String, trim: true, default: '' },
  nidNumber: { type: String, trim: true, default: '' },
  dateOfBirth: { type: String, default: '' },
  permanentAddress: { type: String, trim: true, default: '' },
  presentAddress: { type: String, trim: true, default: '' },
  occupation: { type: String, trim: true, default: '' },
  emergencyContact: { type: String, trim: true, default: '' },
  profilePhoto: { type: documentSchema, default: () => ({ unavailable: true }) },
  nidFront: { type: documentSchema, default: () => ({ unavailable: true }) },
  nidBack: { type: documentSchema, default: () => ({ unavailable: true }) },
  otherDocuments: { type: [documentSchema], default: [] },
  roomId: { type: Schema.Types.ObjectId, ref: 'Room', default: null },
  monthlyRent: { type: Number, required: true, min: 0 },
  wifiCharge: { type: Number, default: 0, min: 0 },
  advanceBalance: { type: Number, default: 0, min: 0 },
  securityDeposit: { type: Number, default: null, min: 0 },
  moveInDate: { type: String, required: true },
  moveOutDate: { type: String, default: null },
  roomHistory: { type: [roomHistorySchema], default: [] },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
}, { timestamps: true })

residentSchema.index({ status: 1, roomId: 1 }, { unique: true, partialFilterExpression: { status: 'active', roomId: { $type: 'objectId' } } })
residentSchema.index({ fullName: 'text', phone: 'text' })
export type ResidentDocument = InferSchemaType<typeof residentSchema> & { _id: mongoose.Types.ObjectId }
export const Resident = mongoose.models.Resident || mongoose.model('Resident', residentSchema)
