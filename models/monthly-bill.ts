import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const additionalChargeItemSchema = new Schema(
  {
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: String, required: true, trim: true },
    notes: { type: String, default: '', trim: true },
  },
  { _id: true },
)

const adjustmentItemSchema = new Schema(
  {
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    type: {
      type: String,
      enum: ['discount', 'positive', 'negative'],
      required: true,
    },
    date: { type: String, required: true, trim: true },
    notes: { type: String, default: '', trim: true },
  },
  { _id: true },
)

const previousOutstandingItemSchema = new Schema(
  {
    billId: { type: Schema.Types.ObjectId, ref: 'MonthlyBill', required: true },
    billingMonth: { type: String, required: true, trim: true },
    unpaidRent: { type: Number, required: true, min: 0, default: 0 },
    unpaidElectricity: { type: Number, required: true, min: 0, default: 0 },
    unpaidWifi: { type: Number, required: true, min: 0, default: 0 },
    unpaidOther: { type: Number, required: true, min: 0, default: 0 },
    unpaidTotal: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false },
)

const billRevisionSchema = new Schema(
  {
    timestamp: { type: Date, required: true, default: Date.now },
    action: { type: String, required: true, trim: true },
    reason: { type: String, default: '', trim: true },
    previousTotalPayable: { type: Number, default: 0 },
    newTotalPayable: { type: Number, default: 0 },
  },
  { _id: false },
)

const monthlyBillSchema = new Schema(
  {
    billingMonth: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },
    residentId: { type: Schema.Types.ObjectId, ref: 'Resident', required: true },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    residentName: { type: String, required: true, trim: true },
    residentPhone: { type: String, default: '', trim: true },
    roomNumber: { type: Number, required: true, min: 1, max: 26 },
    floor: { type: Number, required: true, min: 1, max: 5 },

    // A. Rent
    monthlyRent: { type: Number, required: true, min: 0 },

    // B. Electricity (from finalized MonthlyElectricityAllocation)
    electricityAllocationId: {
      type: Schema.Types.ObjectId,
      ref: 'MonthlyElectricityAllocation',
      default: null,
    },
    electricityUnits: { type: Number, required: true, min: 0, default: 0 },
    electricityMainMeterShare: { type: Number, required: true, min: 0, default: 0 },
    electricityAdditionalCharge: { type: Number, required: true, min: 0, default: 0 },
    totalElectricity: { type: Number, required: true, min: 0, default: 0 },

    // C. WiFi
    wifiCharge: { type: Number, required: true, min: 0, default: 0 },

    // D. Additional charges
    additionalCharges: { type: [additionalChargeItemSchema], default: [] },
    totalAdditionalCharges: { type: Number, required: true, min: 0, default: 0 },

    // E. Discounts & Adjustments
    adjustments: { type: [adjustmentItemSchema], default: [] },
    totalPositiveAdjustments: { type: Number, required: true, min: 0, default: 0 },
    totalDiscounts: { type: Number, required: true, min: 0, default: 0 },
    totalNegativeAdjustments: { type: Number, required: true, min: 0, default: 0 },

    // Category-level paid amounts on this month's own charges
    rentPaid: { type: Number, required: true, min: 0, default: 0 },
    electricityPaid: { type: Number, required: true, min: 0, default: 0 },
    wifiPaid: { type: Number, required: true, min: 0, default: 0 },
    otherChargesPaid: { type: Number, required: true, min: 0, default: 0 },
    advanceApplied: { type: Number, required: true, min: 0, default: 0 },

    // Previous outstanding carry-forward
    previousOutstandingBreakdown: {
      type: [previousOutstandingItemSchema],
      default: [],
    },
    previousOutstanding: { type: Number, required: true, min: 0, default: 0 },
    previousOutstandingPaid: { type: Number, required: true, min: 0, default: 0 },

    // Calculated totals
    currentMonthTotal: { type: Number, required: true, min: 0, default: 0 },
    currentMonthPaid: { type: Number, required: true, min: 0, default: 0 },
    currentMonthUnpaid: { type: Number, required: true, min: 0, default: 0 },
    totalPayable: { type: Number, required: true, min: 0, default: 0 },
    totalPaid: { type: Number, required: true, min: 0, default: 0 },
    remainingDue: { type: Number, required: true, min: 0, default: 0 },

    status: {
      type: String,
      enum: ['unpaid', 'partially_paid', 'paid'],
      default: 'unpaid',
      required: true,
    },
    isLocked: { type: Boolean, default: false },
    generatedAt: { type: Date, required: true, default: Date.now },
    finalizedAt: { type: Date, default: null },
    revisionHistory: { type: [billRevisionSchema], default: [] },
  },
  { timestamps: true },
)

monthlyBillSchema.index({ billingMonth: 1, residentId: 1 }, { unique: true })
monthlyBillSchema.index({ residentId: 1, billingMonth: 1 })
monthlyBillSchema.index({ roomId: 1, billingMonth: 1 })

export type MonthlyBillDocument = InferSchemaType<typeof monthlyBillSchema> & {
  _id: mongoose.Types.ObjectId
}

export const MonthlyBill =
  mongoose.models.MonthlyBill || mongoose.model('MonthlyBill', monthlyBillSchema)

