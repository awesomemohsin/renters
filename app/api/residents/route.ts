import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase, isTransactionUnsupportedError } from '@/lib/mongodb'
import { computeBillCategoryState, fromPaisa, toPaisa } from '@/lib/monthly-billing'
import { escapeRegex } from '@/lib/utils'
import { MonthlyBill } from '@/models/monthly-bill'
import { Resident } from '@/models/resident'
import { Room, ensureRoomsExist } from '@/models/room'

const cleanString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

export async function GET(request: Request) {
  try {
    await connectToDatabase()
    await ensureRoomsExist()
    const url = new URL(request.url)
    const search = url.searchParams.get('search')?.trim()
    const floor = Number(url.searchParams.get('floor') || 0)
    const status = url.searchParams.get('status')
    const monthParam = url.searchParams.get('month')?.trim()
    const query: Record<string, unknown> = {}

    if (search) {
      const safeSearch = escapeRegex(search)
      query.$or = [
        { fullName: { $regex: safeSearch, $options: 'i' } },
        { phone: { $regex: safeSearch, $options: 'i' } },
      ]
    }
    if (status === 'active' || status === 'inactive') {
      query.status = status
    }

    const residents = await Resident.find(query).populate('roomId').sort({ createdAt: -1 }).lean()
    const filtered = floor
      ? residents.filter((resident: { roomId?: { floor?: number } | null }) => resident.roomId?.floor === floor)
      : residents
    const rooms = await Room.find().sort({ roomNumber: 1 }).lean()

    // Fetch latest monthly bill (or specific month if provided) for each resident
    const residentIds = filtered.map((r: { _id: mongoose.Types.ObjectId }) => r._id)
    const billQuery: Record<string, unknown> = { residentId: { $in: residentIds } }
    if (monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)) {
      billQuery.billingMonth = monthParam
    }
    const allBills = await MonthlyBill.find(billQuery).sort({ billingMonth: -1 }).lean()

    const latestBillByResidentId = new Map<string, (typeof allBills)[number]>()
    for (const bill of allBills) {
      const key = String(bill.residentId)
      if (!latestBillByResidentId.has(key)) {
        latestBillByResidentId.set(key, bill)
      }
    }

    const enrichedResidents = filtered.map((resident: {
      _id: mongoose.Types.ObjectId
      monthlyRent: number
      wifiCharge?: number
      advanceBalance?: number
    } & Record<string, unknown>) => {
      const bill = latestBillByResidentId.get(String(resident._id))
      if (!bill) {
        return {
          ...resident,
          wifiCharge: Number(resident.wifiCharge || 0),
          advanceBalance: Number(resident.advanceBalance || 0),
          billingSummary: null,
        }
      }
      const cat = computeBillCategoryState(bill)
      const previousDueRemaining = fromPaisa(
        Math.max(0, toPaisa(bill.previousOutstanding) - toPaisa(bill.previousOutstandingPaid)),
      )
      return {
        ...resident,
        wifiCharge: Number(resident.wifiCharge || 0),
        advanceBalance: Number(resident.advanceBalance || 0),
        billingSummary: {
          billId: String(bill._id),
          billingMonth: bill.billingMonth,
          monthlyRent: bill.monthlyRent,
          rentDue: cat.unpaidRent,
          electricityDue: cat.unpaidElectricity,
          wifiDue: cat.unpaidWifi,
          otherDue: cat.unpaidOther,
          previousOutstanding: bill.previousOutstanding,
          previousDueRemaining,
          totalPayable: bill.totalPayable,
          totalPaid: bill.totalPaid,
          remainingDue: bill.remainingDue,
          status: bill.status,
          isLocked: Boolean(bill.isLocked),
        },
      }
    })

    return NextResponse.json({
      residents: enrichedResidents,
      rooms,
      summary: {
        total: await Resident.countDocuments(),
        active: await Resident.countDocuments({ status: 'active' }),
        vacant: await Room.countDocuments({ status: 'vacant' }),
      },
    })
  } catch {
    return NextResponse.json({ error: 'Unable to load residents.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const fullName = cleanString(body.fullName)
    const phone = cleanString(body.phone)
    const moveInDate = cleanString(body.moveInDate)
    const roomId = cleanString(body.roomId)
    const hasMonthlyRent = body.monthlyRent !== '' && body.monthlyRent !== null && body.monthlyRent !== undefined
    const monthlyRent = hasMonthlyRent ? Number(body.monthlyRent) : NaN
    const hasSecurityDeposit = body.securityDeposit !== '' && body.securityDeposit !== null && body.securityDeposit !== undefined
    const securityDeposit = hasSecurityDeposit ? Number(body.securityDeposit) : null
    const hasWifiCharge = body.wifiCharge !== '' && body.wifiCharge !== null && body.wifiCharge !== undefined
    const wifiCharge = hasWifiCharge ? Number(body.wifiCharge) : 0

    if (!fullName || !phone || !moveInDate || !roomId || !hasMonthlyRent) {
      return NextResponse.json({ error: 'Please complete all required fields.' }, { status: 400 })
    }
    if (fullName.length < 2) {
      return NextResponse.json({ error: 'Full name must be at least 2 characters.' }, { status: 400 })
    }
    if (!mongoose.isValidObjectId(roomId)) {
      return NextResponse.json({ error: 'Choose a valid room.' }, { status: 400 })
    }
    if (!Number.isFinite(monthlyRent) || monthlyRent < 0) {
      return NextResponse.json({ error: 'Monthly rent must be a non-negative number.' }, { status: 400 })
    }
    if (securityDeposit !== null && (!Number.isFinite(securityDeposit) || securityDeposit < 0)) {
      return NextResponse.json({ error: 'Security deposit must be a non-negative number.' }, { status: 400 })
    }
    if (!Number.isFinite(wifiCharge) || wifiCharge < 0) {
      return NextResponse.json({ error: 'WiFi charge must be a non-negative number.' }, { status: 400 })
    }

    await connectToDatabase()
    await ensureRoomsExist()
    const session = await mongoose.startSession()
    let createdResidentId: mongoose.Types.ObjectId | null = null

    try {
      await session.withTransaction(async () => {
        const existingActive = await Resident.findOne({ roomId, status: 'active' }).session(session)
        if (existingActive) {
          throw new Error('ROOM_OCCUPIED')
        }

        const room = await Room.findOneAndUpdate(
          { _id: roomId, status: 'vacant' },
          {
            $set: {
              status: 'occupied',
              currentResident: fullName,
              monthlyRent,
            },
          },
          { returnDocument: 'after', session, runValidators: true },
        )
        if (!room) {
          throw new Error('ROOM_OCCUPIED')
        }

        const [created] = await Resident.create(
          [
            {
              fullName,
              spouseName: cleanString(body.spouseName),
              fatherName: cleanString(body.fatherName),
              motherName: cleanString(body.motherName),
              phone,
              alternativePhone: cleanString(body.alternativePhone),
              nidNumber: cleanString(body.nidNumber),
              dateOfBirth: cleanString(body.dateOfBirth),
              permanentAddress: cleanString(body.permanentAddress),
              presentAddress: cleanString(body.presentAddress),
              occupation: cleanString(body.occupation),
              emergencyContact: cleanString(body.emergencyContact),
              roomId: room._id,
              monthlyRent,
              wifiCharge,
              advanceBalance: 0,
              securityDeposit,
              moveInDate,
              moveOutDate: null,
              status: 'active',
              profilePhoto: { unavailable: true },
              nidFront: { unavailable: true },
              nidBack: { unavailable: true },
            },
          ],
          { session },
        )
        createdResidentId = created._id
      })
    } catch (error) {
      if ((error as Error).message === 'ROOM_OCCUPIED' || (error as { code?: number }).code === 11000) {
        return NextResponse.json({ error: 'That room is already occupied.' }, { status: 409 })
      }
      if (isTransactionUnsupportedError(error)) {
        return NextResponse.json(
          { error: 'MongoDB transactions are not supported by the current database deployment.' },
          { status: 500 },
        )
      }
      throw error
    } finally {
      await session.endSession()
    }

    const populatedResident = await Resident.findById(createdResidentId).populate('roomId').lean()
    return NextResponse.json({ resident: populatedResident }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Unable to create resident.' }, { status: 500 })
  }
}
