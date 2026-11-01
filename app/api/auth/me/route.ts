import { NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth'

export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie') || ''
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=')
      return [k, v.join('=')]
    }),
  )

  const token = cookies[SESSION_COOKIE_NAME]
  const verification = await verifySessionToken(token)

  if (!verification.valid) {
    return NextResponse.json({ authenticated: false })
  }

  return NextResponse.json({
    authenticated: true,
    role: verification.payload?.role,
    expiresAt: verification.payload ? new Date(verification.payload.exp).toISOString() : null,
  })
}
