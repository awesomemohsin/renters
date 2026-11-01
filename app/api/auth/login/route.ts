import { NextResponse } from 'next/server'
import {
  checkLoginRateLimit,
  createSessionToken,
  DEFAULT_SESSION_MAX_AGE,
  recordFailedLogin,
  resetLoginRateLimit,
  SESSION_COOKIE_NAME,
  verifyAdminPassword,
} from '@/lib/auth'

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }
  return '127.0.0.1'
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const rateCheck = checkLoginRateLimit(ip)

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Too many failed login attempts. Please try again in ${rateCheck.retryAfterSeconds} seconds.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateCheck.retryAfterSeconds ?? 900),
          },
        },
      )
    }

    const body = await request.json().catch(() => ({}))
    const password = typeof body.password === 'string' ? body.password : ''

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required.' },
        { status: 400 },
      )
    }

    const isValid = await verifyAdminPassword(password)

    if (!isValid) {
      const failStatus = recordFailedLogin(ip)
      if (failStatus.locked) {
        return NextResponse.json(
          {
            error: `Too many failed attempts. Account locked for ${failStatus.retryAfterSeconds} seconds.`,
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(failStatus.retryAfterSeconds ?? 900),
            },
          },
        )
      }

      return NextResponse.json(
        { error: 'Invalid administrator password.' },
        { status: 401 },
      )
    }

    // Success
    resetLoginRateLimit(ip)
    const token = await createSessionToken({ role: 'admin' })

    const response = NextResponse.json({
      success: true,
      message: 'Authentication successful.',
    })

    const isProduction = process.env.NODE_ENV === 'production'

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: DEFAULT_SESSION_MAX_AGE,
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Authentication service unavailable.' },
      { status: 500 },
    )
  }
}
