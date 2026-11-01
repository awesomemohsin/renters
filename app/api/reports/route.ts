import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { getFinancialReportsData } from '@/lib/reports'

export async function GET(request: Request) {
  try {
    await connectToDatabase()

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') || undefined
    const floor = searchParams.get('floor') ? Number(searchParams.get('floor')) : undefined
    const roomNumber = searchParams.get('roomNumber') ? Number(searchParams.get('roomNumber')) : undefined
    const residentId = searchParams.get('residentId') || undefined

    const reportsData = await getFinancialReportsData({
      month,
      floor: Number.isFinite(floor) ? floor : undefined,
      roomNumber: Number.isFinite(roomNumber) ? roomNumber : undefined,
      residentId,
    })

    return NextResponse.json(reportsData)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to generate financial reports.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
