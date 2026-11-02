// Web-Crypto session token utilities
// 100% Edge-compatible for Next.js middleware and Node.js serverless functions

export const SESSION_COOKIE_NAME = 'renters_session'
export const DEFAULT_SESSION_MAX_AGE = 24 * 60 * 60 // 24 hours in seconds (86,400s)

export function toBase64Url(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8').toString('base64url')
  }
  let binary = ''
  const bytes = new TextEncoder().encode(str)
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'base64url').toString('utf-8')
  }
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) {
    base64 += '='
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64url')
  }
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToUint8Array(str: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(str, 'base64url'))
  }
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) {
    base64 += '='
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (secret && secret.trim().length >= 16) {
    return secret.trim()
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET environment variable is missing or too short (must be at least 16 characters).')
  }
  console.warn('[AUTH WARNING] SESSION_SECRET not set in environment. Using development fallback secret.')
  return 'renters-dev-fallback-session-secret-change-in-production-min32chars'
}

export type SessionPayload = {
  role: 'admin'
  iat: number
  exp: number
}

export async function createSessionToken(
  payload: { role: 'admin' },
  maxAgeSeconds = DEFAULT_SESSION_MAX_AGE,
): Promise<string> {
  const now = Date.now()
  const sessionData: SessionPayload = {
    role: payload.role,
    iat: now,
    exp: now + maxAgeSeconds * 1000,
  }

  const secret = getSessionSecret()
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const payloadB64 = toBase64Url(JSON.stringify(sessionData))
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64))
  const signatureB64 = uint8ArrayToBase64Url(new Uint8Array(signatureBuffer))

  return `${payloadB64}.${signatureB64}`
}

export async function verifySessionToken(
  token: string | null | undefined,
): Promise<{ valid: boolean; payload?: SessionPayload; reason?: string }> {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'missing_token' }
  }

  const parts = token.split('.')
  if (parts.length !== 2) {
    return { valid: false, reason: 'malformed_token' }
  }

  const [payloadB64, signatureB64] = parts

  try {
    const secret = getSessionSecret()
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )

    const sigBytes = base64UrlToUint8Array(signatureB64)
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      enc.encode(payloadB64),
    )

    if (!isValid) {
      return { valid: false, reason: 'invalid_signature' }
    }

    const payloadJson = fromBase64Url(payloadB64)
    const payload = JSON.parse(payloadJson) as SessionPayload

    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) {
      return { valid: false, reason: 'expired', payload }
    }

    if (payload.role !== 'admin') {
      return { valid: false, reason: 'invalid_role' }
    }

    return { valid: true, payload }
  } catch {
    return { valid: false, reason: 'verification_failed' }
  }
}
