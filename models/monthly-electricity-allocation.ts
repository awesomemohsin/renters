import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const allocationRevisionSchema = new Schema(
  {
    revisedAt: { type: Date, required: true, default: Date.now },
    reason: { type: String, default: '', trim: true },
    consumption: { type: Number, required: true },
    mainMeterShare: { type: Number, required: true },
    additionalChargeRate: { type: Number, required: true },
    additionalCharge: { type: Number, required: true },
    finalElectricityAmount: { type: Number, required: true },
  },
  { _id: false },
)

const monthlyElectricityAllocationSchema = new Schema(
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
    residentId: { type: Schema.Types.ObjectId, ref: 'Resident', default: null },
    residentName: { type: String, default: null, trim: true },
    isVacant: { type: Boolean, required: true, default: false },
    mainMeterId: { type: Schema.Types.ObjectId, ref: 'MainMeter', required: true },
    mainMeterName: { type: String, required: true, trim: true },
    mainMeterBillId: {
      type: Schema.Types.ObjectId,
      ref: 'MonthlyMainMeterBill',
      required: true,
    },
    subMeterReadingId: {
      type: Schema.Types.ObjectId,
      ref: 'MonthlySubMeterReading',
      required: true,
    },
    previousReading: { type: Number, required: true, min: 0 },
    currentReading: { type: Number, required: true, min: 0 },
    consumption: { type: Number, required: true, min: 0 },
    mainMeterTotalConsumption: { type: Number, required: true, min: 0 },
    mainMeterBillAmount: { type: Number, required: true, min: 0 },
    mainMeterShare: { type: Number, required: true, min: 0 },
    additionalChargeRate: { type: Number, required: true, min: 0, default: 1 },
    additionalCharge: { type: Number, required: true, min: 0 },
    finalElectricityAmount: { type: Number, required: true, min: 0 },
    calculatedAt: { type: Date, required: true, default: Date.now },
    status: {
      type: String,
      enum: ['draft', 'finalized'],
      default: 'draft',
      required: true,
    },
    finalizedAt: { type: Date, default: null },
    revisionHistory: { type: [allocationRevisionSchema], default: [] },
  },
  { timestamps: true },
)

monthlyElectricityAllocationSchema.index({ billingMonth: 1, roomId: 1 }, { unique: true })

export type MonthlyElectricityAllocationDocument = InferSchemaType<
  typeof monthlyElectricityAllocationSchema
> & {
  _id: mongoose.Types.ObjectId
}

export const MonthlyElectricityAllocation =
  mongoose.models.MonthlyElectricityAllocation ||
  mongoose.model('MonthlyElectricityAllocation', monthlyElectricityAllocationSchema)

const cycleAuditSchema = new Schema(
  {
    action: {
      type: String,
      enum: ['finalized', 'reopened_for_correction', 'rate_updated'],
      required: true,
    },
    timestamp: { type: Date, required: true, default: Date.now },
    reason: { type: String, default: '', trim: true },
    totalMainMeterBills: { type: Number, default: 0 },
    totalConsumption: { type: Number, default: 0 },
    totalAdditionalCharges: { type: Number, default: 0 },
    totalFinalAmount: { type: Number, default: 0 },
  },
  { _id: false },
)

const monthlyElectricityCycleSchema = new Schema(
  {
    billingMonth: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },
    additionalChargeRate: { type: Number, required: true, min: 0, default: 1 },
    status: {
      type: String,
      enum: ['draft', 'finalized'],
      default: 'draft',
      required: true,
    },
    finalizedAt: { type: Date, default: null },
    lastCorrectionReason: { type: String, default: '', trim: true },
    auditLog: { type: [cycleAuditSchema], default: [] },
  },
  { timestamps: true },
)

export type MonthlyElectricityCycleDocument = InferSchemaType<
  typeof monthlyElectricityCycleSchema
> & {
  _id: mongoose.Types.ObjectId
}

export const MonthlyElectricityCycle =
  mongoose.models.MonthlyElectricityCycle ||
  mongoose.model('MonthlyElectricityCycle', monthlyElectricityCycleSchema)

