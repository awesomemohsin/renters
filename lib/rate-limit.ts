import { connectToDatabase } from '@/lib/mongodb'
import { LoginRateLimit } from '@/models/login-rate-limit'

export const MAX_LOGIN_ATTEMPTS = 5
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Extracts and sanitizes the client IP address from request headers.
 * Order of precedence:
 * 1. x-vercel-forwarded-for (Vercel Edge Proxy)
 * 2. x-forwarded-for (First comma-separated IP)
 * 3. x-real-ip
 * Fallback: 127.0.0.1
 */
export function getClientIp(request: Request): string {
  const headers = request.headers

  const vercelIp = headers.get('x-vercel-forwarded-for')
  if (vercelIp) {
    const sanitized = sanitizeIp(vercelIp.split(',')[0].trim())
    if (sanitized) return sanitized
  }

  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    const sanitized = sanitizeIp(forwardedFor.split(',')[0].trim())
    if (sanitized) return sanitized
  }

  const realIp = headers.get('x-real-ip')
  if (realIp) {
    const sanitized = sanitizeIp(realIp.trim())
    if (sanitized) return sanitized
  }

  return '127.0.0.1'
}

/**
 * Validates whether a candidate string is a plausible IPv4 or IPv6 address.
 */
function sanitizeIp(rawIp: string): string | null {
  if (!rawIp) return null
  const trimmed = rawIp.trim()

  // IPv4 format: 1.2.3.4
  const ipv4Regex = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
  if (ipv4Regex.test(trimmed)) {
    return trimmed
  }

  // IPv6 format (basic hex & colon structure, including loopback ::1)
  const ipv6Regex = /^[0-9a-fA-F:]{2,39}$/
  if (ipv6Regex.test(trimmed)) {
    return trimmed.toLowerCase()
  }

  return null
}

export type RateCheckResult = {
  allowed: boolean
  retryAfterSeconds?: number
}

/**
 * Checks whether an IP address is currently locked out from logging in.
 * Fail-closed: Throws an error if the database connection or query fails.
 */
export async function checkLoginRateLimit(ip: string): Promise<RateCheckResult> {
  await connectToDatabase()

  const record = await LoginRateLimit.findOne({ ip })
  if (!record) {
    return { allowed: true }
  }

  const now = new Date()

  // Check if actively locked
  if (record.lockedUntil) {
    if (record.lockedUntil.getTime() > now.getTime()) {
      const remainingSeconds = Math.max(
        1,
        Math.ceil((record.lockedUntil.getTime() - now.getTime()) / 1000),
      )
      return { allowed: false, retryAfterSeconds: remainingSeconds }
    } else {
      // Lockout duration has expired, clean up record
      await LoginRateLimit.deleteOne({ ip })
      return { allowed: true }
    }
  }

  // If record's window has expired without locking, clean it up
  if (now.getTime() - record.firstAttemptAt.getTime() > ATTEMPT_WINDOW_MS) {
    await LoginRateLimit.deleteOne({ ip })
    return { allowed: true }
  }

  return { allowed: true }
}

export type FailedLoginResult = {
  locked: boolean
  retryAfterSeconds?: number
  attempts: number
}

/**
 * Atomically records a failed login attempt for the given IP address.
 * Locks the IP for 15 minutes when attempts reach MAX_LOGIN_ATTEMPTS.
 * Fail-closed: Throws an error if the database connection or update fails.
 */
export async function recordFailedLogin(ip: string): Promise<FailedLoginResult> {
  await connectToDatabase()

  const now = new Date()
  const windowExpiry = new Date(now.getTime() + ATTEMPT_WINDOW_MS)
  const lockoutExpiry = new Date(now.getTime() + LOCKOUT_DURATION_MS)

  // Check if existing record is stale (window expired or expired lockout)
  const existing = await LoginRateLimit.findOne({ ip })
  if (
    existing &&
    (now.getTime() - existing.firstAttemptAt.getTime() > ATTEMPT_WINDOW_MS ||
      (existing.lockedUntil && existing.lockedUntil.getTime() <= now.getTime()))
  ) {
    await LoginRateLimit.deleteOne({ ip })
  }

  // Atomic increment with upsert
  const updated = await LoginRateLimit.findOneAndUpdate(
    { ip },
    {
      $inc: { attempts: 1 },
      $setOnInsert: { firstAttemptAt: now },
      $set: { expiresAt: windowExpiry },
    },
    { upsert: true, returnDocument: 'after' },
  )

  if (updated.attempts >= MAX_LOGIN_ATTEMPTS) {
    // Apply lockout
    await LoginRateLimit.updateOne(
      { ip },
      {
        $set: {
          lockedUntil: lockoutExpiry,
          expiresAt: lockoutExpiry,
        },
      },
    )

    const remainingSeconds = Math.ceil(LOCKOUT_DURATION_MS / 1000)
    return {
      locked: true,
      retryAfterSeconds: remainingSeconds,
      attempts: updated.attempts,
    }
  }

  return {
    locked: false,
    attempts: updated.attempts,
  }
}

/**
 * Resets the failed login counter for an IP address upon successful authentication.
 */
export async function resetLoginRateLimit(ip: string): Promise<void> {
  try {
    await connectToDatabase()
    await LoginRateLimit.deleteOne({ ip })
  } catch (error) {
    console.error(`[RATE LIMIT] Failed to reset rate limit for IP ${ip}:`, error)
  }
}
