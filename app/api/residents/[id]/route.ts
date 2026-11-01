import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase, isTransactionUnsupportedError } from '@/lib/mongodb'
import { computeBillCategoryState } from '@/lib/monthly-billing'
import { getResidentWiFiDetails } from '@/lib/wifi'
import { MonthlyBill } from '@/models/monthly-bill'
import { Payment } from '@/models/payment'
import { Resident } from '@/models/resident'
import { Room } from '@/models/room'
import { WiFiConfiguration } from '@/models/wifi-configuration'
import { WiFiDevice } from '@/models/wifi-device'

const STRING_FIELDS = [
  'fullName',
  'spouseName',
  'fatherName',
  'motherName',
  'phone',
  'alternativePhone',
  'nidNumber',
  'dateOfBirth',
  'permanentAddress',
  'presentAddress',
  'occupation',
  'emergencyContact',
  'moveInDate',
] as const

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid resident.' }, { status: 400 })
  }
  try {
    await connectToDatabase()
    const resident = await Resident.findById(id).populate('roomId').lean()
    if (!resident) {
      return NextResponse.json({ error: 'Resident not found.' }, { status: 404 })
    }
    const [rawBills, payments, wifiDetails] = await Promise.all([
      MonthlyBill.find({ residentId: id }).sort({ billingMonth: -1 }).lean(),
      Payment.find({ residentId: id }).sort({ paymentDate: -1, createdAt: -1 }).lean(),
      getResidentWiFiDetails(id),
    ])
    const bills = rawBills.map((bill: {
      monthlyRent: number
      totalElectricity: number
      wifiCharge: number
      additionalCharges?: { amount: number }[]
      adjustments?: { amount: number; type: 'discount' | 'positive' | 'negative' }[]
      rentPaid?: number
      electricityPaid?: number
      wifiPaid?: number
      otherChargesPaid?: number
    } & Record<string, unknown>) => ({
      ...bill,
      categoryState: computeBillCategoryState(bill),
    }))
    return NextResponse.json({ resident, bills, payments, wifi: wifiDetails })
  } catch {
    return NextResponse.json({ error: 'Unable to load resident.' }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid resident.' }, { status: 400 })
  }

  try {
    const body = await request.json()
    await connectToDatabase()

    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        const resident = await Resident.findById(id).session(session)
        if (!resident) {
          throw new Error('RESIDENT_NOT_FOUND')
        }

        if (body.action === 'vacate') {
          if (resident.status === 'inactive') {
            throw new Error('ALREADY_VACATED')
          }

          if (resident.roomId) {
            await Room.findByIdAndUpdate(
              resident.roomId,
              { $set: { status: 'vacant', currentResident: null } },
              { session, runValidators: true },
            )
          }

          const today = new Date().toISOString().slice(0, 10)
          resident.status = 'inactive'
          resident.moveOutDate = today
          resident.wifiCharge = 0
          // Historical roomId is preserved intentionally for historical records.
          await resident.save({ session })

          // Deactivate any active WiFi configurations for this resident while preserving history
          await WiFiConfiguration.updateMany(
            { residentId: resident._id, status: 'active' },
            { $set: { status: 'inactive', endDate: today } },
            { session },
          )

          // Deactivate active devices to free MAC addresses for reuse while preserving history
          await WiFiDevice.updateMany(
            { residentId: resident._id, status: 'active' },
            {
              $set: { status: 'inactive', deactivatedDate: today },
              $push: {
                history: {
                  action: 'deactivated',
                  timestamp: new Date(),
                  details: 'Deactivated due to resident vacating room',
                },
              },
            },
            { session },
          )
        } else {
          for (const key of STRING_FIELDS) {
            if (body[key] !== undefined) {
              resident[key] = typeof body[key] === 'string' ? body[key].trim() : String(body[key] ?? '')
            }
          }

          if (!resident.fullName || resident.fullName.length < 2) {
            throw new Error('INVALID_FULL_NAME')
          }
          if (!resident.phone) {
            throw new Error('INVALID_PHONE')
          }
          if (!resident.moveInDate) {
            throw new Error('INVALID_MOVE_IN_DATE')
          }

          if (body.monthlyRent !== undefined) {
            const rent = body.monthlyRent === '' || body.monthlyRent === null ? NaN : Number(body.monthlyRent)
            if (!Number.isFinite(rent) || rent < 0) {
              throw new Error('INVALID_MONTHLY_RENT')
            }
            resident.monthlyRent = rent
          }

          if (body.securityDeposit !== undefined) {
            if (body.securityDeposit === '' || body.securityDeposit === null) {
              resident.securityDeposit = null
            } else {
              const deposit = Number(body.securityDeposit)
              if (!Number.isFinite(deposit) || deposit < 0) {
                throw new Error('INVALID_SECURITY_DEPOSIT')
              }
              resident.securityDeposit = deposit
            }
          }

          if (body.wifiCharge !== undefined) {
            if (body.wifiCharge === '' || body.wifiCharge === null) {
              resident.wifiCharge = 0
            } else {
              const wifi = Number(body.wifiCharge)
              if (!Number.isFinite(wifi) || wifi < 0) {
                throw new Error('INVALID_WIFI_CHARGE')
              }
              resident.wifiCharge = wifi
            }
          }

          await resident.save({ session })

          if (resident.status === 'active' && resident.roomId) {
            await Room.findByIdAndUpdate(
              resident.roomId,
              {
                $set: {
                  status: 'occupied',
                  currentResident: resident.fullName,
                  monthlyRent: resident.monthlyRent,
                },
              },
              { session, runValidators: true },
            )
          }
        }
      })
    } catch (error) {
      const code = (error as Error).message
      if (code === 'RESIDENT_NOT_FOUND') {
        return NextResponse.json({ error: 'Resident not found.' }, { status: 404 })
      }
      if (code === 'ALREADY_VACATED') {
        return NextResponse.json({ error: 'Resident has already vacated.' }, { status: 400 })
      }
      if (
        code === 'INVALID_FULL_NAME' ||
        code === 'INVALID_PHONE' ||
        code === 'INVALID_MOVE_IN_DATE' ||
        code === 'INVALID_MONTHLY_RENT' ||
        code === 'INVALID_SECURITY_DEPOSIT' ||
        code === 'INVALID_WIFI_CHARGE'
      ) {
        return NextResponse.json({ error: 'Please provide valid resident details.' }, { status: 400 })
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

    const updatedResident = await Resident.findById(id).populate('roomId').lean()
    return NextResponse.json({ resident: updatedResident })
  } catch {
    return NextResponse.json({ error: 'Unable to update resident.' }, { status: 500 })
  }
}
