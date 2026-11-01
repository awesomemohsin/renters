import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase, isTransactionUnsupportedError } from '@/lib/mongodb'
import { fromPaisa, toPaisa } from '@/lib/monthly-billing'
import {
  ensureWiFiCollectionsExist,
  getResidentWiFiDetails,
  getWiFiManagementWorkspace,
} from '@/lib/wifi'
import { Resident } from '@/models/resident'
import { ensureRoomsExist } from '@/models/room'
import { WiFiConfiguration } from '@/models/wifi-configuration'

const cleanString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

export async function GET(request: Request) {
  try {
    await connectToDatabase()
    await ensureRoomsExist()
    await ensureWiFiCollectionsExist()

    const url = new URL(request.url)
    const residentId = url.searchParams.get('residentId')?.trim()

    if (residentId) {
      if (!mongoose.isValidObjectId(residentId)) {
        return NextResponse.json({ error: 'Invalid resident ID.' }, { status: 400 })
      }
      const details = await getResidentWiFiDetails(residentId)
      return NextResponse.json(details)
    }

    const workspace = await getWiFiManagementWorkspace()
    return NextResponse.json(workspace)
  } catch {
    return NextResponse.json(
      { error: 'Unable to load WiFi management records.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const residentId = cleanString(body.residentId)
    const wifiName = cleanString(body.wifiName)
    const startDate =
      cleanString(body.startDate) || new Date().toISOString().slice(0, 10)
    const status: 'active' | 'inactive' =
      body.status === 'inactive' ? 'inactive' : 'active'
    const notes = cleanString(body.notes)
    const monthlyChargeNum = Number(body.monthlyCharge ?? 0)

    if (!mongoose.isValidObjectId(residentId)) {
      return NextResponse.json(
        { error: 'Please select a valid resident.' },
        { status: 400 },
      )
    }
    if (!wifiName) {
      return NextResponse.json(
        { error: 'WiFi Name / SSID is required.' },
        { status: 400 },
      )
    }
    if (!Number.isFinite(monthlyChargeNum) || monthlyChargeNum < 0) {
      return NextResponse.json(
        { error: 'Monthly WiFi charge must be a non-negative number.' },
        { status: 400 },
      )
    }

    const monthlyCharge = fromPaisa(toPaisa(monthlyChargeNum))

    await connectToDatabase()
    await ensureRoomsExist()
    await ensureWiFiCollectionsExist()

    const session = await mongoose.startSession()
    let savedConfigId: mongoose.Types.ObjectId | null = null

    try {
      await session.withTransaction(async () => {
        const resident = await Resident.findById(residentId).session(session)
        if (!resident) {
          throw new Error('RESIDENT_NOT_FOUND')
        }
        if (resident.status !== 'active' && status === 'active') {
          throw new Error('RESIDENT_INACTIVE')
        }
        if (!resident.roomId) {
          throw new Error('RESIDENT_NO_ROOM')
        }

        const existingActive = await WiFiConfiguration.findOne({
          residentId: resident._id,
          status: 'active',
        }).session(session)

        if (existingActive) {
          // Update existing active configuration if one already exists for this resident
          const chargeChanged = existingActive.monthlyCharge !== monthlyCharge
          existingActive.wifiName = wifiName
          existingActive.monthlyCharge = monthlyCharge
          existingActive.startDate = startDate
          existingActive.status = status
          existingActive.endDate =
            status === 'inactive' ? new Date().toISOString().slice(0, 10) : null
          existingActive.notes = notes
          if (chargeChanged) {
            existingActive.chargeHistory.push({
              monthlyCharge,
              effectiveDate: startDate,
              changedAt: new Date(),
              notes: notes || 'Monthly WiFi charge updated',
            })
          }
          await existingActive.save({ session })
          savedConfigId = existingActive._id
        } else {
          const [created] = await WiFiConfiguration.create(
            [
              {
                residentId: resident._id,
                roomId: resident.roomId,
                wifiName,
                monthlyCharge,
                startDate,
                endDate:
                  status === 'inactive'
                    ? new Date().toISOString().slice(0, 10)
                    : null,
                status,
                notes,
                chargeHistory: [
                  {
                    monthlyCharge,
                    effectiveDate: startDate,
                    changedAt: new Date(),
                    notes: notes || 'Initial WiFi configuration',
                  },
                ],
              },
            ],
            { session },
          )
          savedConfigId = created._id
        }

        // Sync Resident.wifiCharge for future bill defaults (does NOT touch historical MonthlyBills)
        resident.wifiCharge = status === 'active' ? monthlyCharge : 0
        await resident.save({ session })
      })
    } catch (error) {
      const code = (error as Error).message
      if (code === 'RESIDENT_NOT_FOUND') {
        return NextResponse.json({ error: 'Resident not found.' }, { status: 404 })
      }
      if (code === 'RESIDENT_INACTIVE') {
        return NextResponse.json(
          { error: 'Cannot create an active WiFi configuration for an inactive resident.' },
          { status: 400 },
        )
      }
      if (code === 'RESIDENT_NO_ROOM') {
        return NextResponse.json(
          { error: 'Resident has no assigned room.' },
          { status: 400 },
        )
      }
      if ((error as { code?: number }).code === 11000) {
        return NextResponse.json(
          { error: 'This resident already has an active WiFi configuration.' },
          { status: 409 },
        )
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

    const configuration = await WiFiConfiguration.findById(savedConfigId).lean()
    const details = await getResidentWiFiDetails(residentId)
    return NextResponse.json(
      { configuration, ...details },
      { status: 201 },
    )
  } catch {
    return NextResponse.json(
      { error: 'Unable to save WiFi configuration.' },
      { status: 500 },
    )
  }
}

