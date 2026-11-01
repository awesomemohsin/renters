import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const paymentAllocationDetailSchema = new Schema(
  {
    targetBillId: {
      type: Schema.Types.ObjectId,
      ref: 'MonthlyBill',
      required: true,
    },
    billingMonth: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['rent', 'electricity', 'wifi', 'other', 'advance'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

const paymentRevisionSchema = new Schema(
  {
    timestamp: { type: Date, required: true, default: Date.now },
    action: { type: String, required: true, trim: true },
    reason: { type: String, default: '', trim: true },
  },
  { _id: false },
)

const paymentSchema = new Schema(
  {
    residentId: { type: Schema.Types.ObjectId, ref: 'Resident', required: true },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    billId: { type: Schema.Types.ObjectId, ref: 'MonthlyBill', required: true },
    residentName: { type: String, required: true, trim: true },
    roomNumber: { type: Number, required: true, min: 1, max: 26 },
    paymentDate: { type: String, required: true, trim: true },
    billingMonth: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },
    amountReceived: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'Bank', 'Mobile Banking', 'Other', 'Advance Credit'],
      required: true,
    },
    transactionReference: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
    rentAllocation: { type: Number, required: true, min: 0, default: 0 },
    electricityAllocation: { type: Number, required: true, min: 0, default: 0 },
    wifiAllocation: { type: Number, required: true, min: 0, default: 0 },
    otherAllocation: { type: Number, required: true, min: 0, default: 0 },
    previousDueAllocation: { type: Number, required: true, min: 0, default: 0 },
    advanceAllocation: { type: Number, required: true, min: 0, default: 0 },
    allocationDetails: { type: [paymentAllocationDetailSchema], default: [] },
    status: {
      type: String,
      enum: ['completed', 'reversed'],
      default: 'completed',
      required: true,
    },
    reversedAt: { type: Date, default: null },
    reversalReason: { type: String, default: '', trim: true },
    revisionHistory: { type: [paymentRevisionSchema], default: [] },
  },
  { timestamps: true },
)

paymentSchema.index({ residentId: 1, createdAt: -1 })
paymentSchema.index({ billId: 1, createdAt: -1 })
paymentSchema.index({ billingMonth: 1, createdAt: -1 })

export type PaymentDocument = InferSchemaType<typeof paymentSchema> & {
  _id: mongoose.Types.ObjectId
}

export const Payment =
  mongoose.models.Payment || mongoose.model('Payment', paymentSchema)

