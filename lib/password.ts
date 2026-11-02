import crypto from 'node:crypto'

// OWASP Recommended scrypt parameters for password storage:
// N = 16384 (2^14), r = 8, p = 1, keylen = 64 bytes (512 bits)
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 64
const SCRYPT_MAXMEM = 32 * 1024 * 1024 // 32MB

/**
 * Hashes a password using Node.js crypto.scrypt with a unique random salt.
 * Output format: scrypt$v=1$N=16384,r=8,p=1$<salt_hex>$<derived_key_hex>
 */
export async function hashPasswordScrypt(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex')
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM },
      (err, derivedKey) => {
        if (err) return reject(err)
        const hexKey = derivedKey.toString('hex')
        resolve(`scrypt$v=1$N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}$${salt}$${hexKey}`)
      },
    )
  })
}

/**
 * Verifies a password against a stored scrypt hash string in constant time.
 */
export async function verifyPasswordScrypt(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.startsWith('scrypt$v=1$')) {
    return false
  }

  const parts = storedHash.split('$')
  if (parts.length !== 5) {
    return false
  }

  const [, , paramStr, salt, expectedKeyHex] = parts

  // Parse parameters: N=16384,r=8,p=1
  const params: Record<string, number> = {}
  paramStr.split(',').forEach((kv) => {
    const [k, v] = kv.split('=')
    if (k && v) params[k] = parseInt(v, 10)
  })

  const N = params['N'] || SCRYPT_N
  const r = params['r'] || SCRYPT_R
  const p = params['p'] || SCRYPT_P
  const expectedBuffer = Buffer.from(expectedKeyHex, 'hex')
  const keylen = expectedBuffer.length

  if (keylen === 0) {
    return false
  }

  return new Promise((resolve) => {
    crypto.scrypt(
      password,
      salt,
      keylen,
      { N, r, p, maxmem: SCRYPT_MAXMEM * 2 },
      (err, derivedKey) => {
        if (err) return resolve(false)
        if (derivedKey.length !== expectedBuffer.length) {
          return resolve(false)
        }
        resolve(crypto.timingSafeEqual(derivedKey, expectedBuffer))
      },
    )
  })
}

/**
 * Constant-time string equality comparison using Node crypto.timingSafeEqual.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const aBuf = enc.encode(a)
  const bBuf = enc.encode(b)

  if (aBuf.length !== bBuf.length) {
    // Execute dummy comparison to mitigate timing leaks
    crypto.timingSafeEqual(aBuf, aBuf)
    return false
  }

  return crypto.timingSafeEqual(aBuf, bBuf)
}

/**
 * Legacy single-round SHA-256 verification (for backward compatibility only).
 */
function verifyLegacySha256(inputPassword: string, expectedHash: string): boolean {
  const computedHash = crypto.createHash('sha256').update(inputPassword, 'utf-8').digest('hex')
  return timingSafeEqualStrings(computedHash.toLowerCase(), expectedHash.toLowerCase())
}

/**
 * Main verification entrypoint for the administrator login.
 * Supports:
 * 1. Plain text ADMIN_PASSWORD (via constant-time string comparison)
 * 2. Scrypt hash in ADMIN_PASSWORD_HASH (scrypt$v=1$N=16384,r=8,p=1$salt$key)
 * 3. Legacy SHA-256 hash in ADMIN_PASSWORD_HASH (with deprecation warning)
 */
export async function verifyAdminPassword(inputPassword: string): Promise<boolean> {
  if (!inputPassword || typeof inputPassword !== 'string') {
    return false
  }

  const configuredHash = process.env.ADMIN_PASSWORD_HASH?.trim()
  const configuredPlain = process.env.ADMIN_PASSWORD?.trim()

  if (!configuredHash && !configuredPlain) {
    console.error('[AUTH ERROR] Neither ADMIN_PASSWORD nor ADMIN_PASSWORD_HASH is set in environment.')
    return false
  }

  // Check scrypt hash first
  if (configuredHash && configuredHash.startsWith('scrypt$v=1$')) {
    return verifyPasswordScrypt(inputPassword, configuredHash)
  }

  // Check legacy SHA-256 hash if present
  if (configuredHash && /^[a-f0-9]{64}$/i.test(configuredHash)) {
    console.warn(
      '[AUTH DEPRECATION] ADMIN_PASSWORD_HASH uses legacy single-round SHA-256. Please migrate to scrypt format (scrypt$v=1$...).',
    )
    return verifyLegacySha256(inputPassword, configuredHash)
  }

  // Check plain text ADMIN_PASSWORD via constant-time comparison
  if (configuredPlain) {
    return timingSafeEqualStrings(inputPassword, configuredPlain)
  }

  return false
}
