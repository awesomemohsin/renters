import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const loginRateLimitSchema = new Schema(
  {
    ip: {
      type: String,
      required: true,
      trim: true,
    },
    attempts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    firstAttemptAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lockedUntil: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
)

// Ensure fast unique lookup by IP
loginRateLimitSchema.index({ ip: 1 }, { unique: true })

// TTL index for automated MongoDB cleanup after record expiration
loginRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export type LoginRateLimitDocument = InferSchemaType<typeof loginRateLimitSchema> & {
  _id: mongoose.Types.ObjectId
}

export const LoginRateLimit =
  mongoose.models.LoginRateLimit ||
  mongoose.model('LoginRateLimit', loginRateLimitSchema, 'login_rate_limits')
