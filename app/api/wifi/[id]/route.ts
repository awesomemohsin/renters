import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase, isTransactionUnsupportedError } from '@/lib/mongodb'
import { fromPaisa, toPaisa } from '@/lib/monthly-billing'
import { ensureWiFiCollectionsExist, getResidentWiFiDetails } from '@/lib/wifi'
import { Resident } from '@/models/resident'
import { WiFiConfiguration } from '@/models/wifi-configuration'

const cleanString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json(
      { error: 'Invalid WiFi configuration ID.' },
      { status: 400 },
    )
  }

  try {
    await connectToDatabase()
    await ensureWiFiCollectionsExist()
    const config = await WiFiConfiguration.findById(id).lean()
    if (!config) {
      return NextResponse.json(
        { error: 'WiFi configuration not found.' },
        { status: 404 },
      )
    }
    const details = await getResidentWiFiDetails(config.residentId)
    return NextResponse.json({ configuration: config, ...details })
  } catch {
    return NextResponse.json(
      { error: 'Unable to load WiFi configuration.' },
      { status: 500 },
    )
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json(
      { error: 'Invalid WiFi configuration ID.' },
      { status: 400 },
    )
  }

  try {
    const body = await request.json()
    const today = new Date().toISOString().slice(0, 10)

    await connectToDatabase()
    await ensureWiFiCollectionsExist()

    const session = await mongoose.startSession()
    let targetResidentId: mongoose.Types.ObjectId | null = null

    try {
      await session.withTransaction(async () => {
        const config = await WiFiConfiguration.findById(id).session(session)
        if (!config) {
          throw new Error('CONFIG_NOT_FOUND')
        }
        targetResidentId = config.residentId

        const resident = await Resident.findById(config.residentId).session(session)
        if (!resident) {
          throw new Error('RESIDENT_NOT_FOUND')
        }

        if (body.wifiName !== undefined) {
          const wifiName = cleanString(body.wifiName)
          if (!wifiName) {
            throw new Error('INVALID_WIFI_NAME')
          }
          config.wifiName = wifiName
        }

        if (body.startDate !== undefined) {
          const startDate = cleanString(body.startDate)
          if (!startDate) {
            throw new Error('INVALID_START_DATE')
          }
          config.startDate = startDate
        }

        if (body.notes !== undefined) {
          config.notes = cleanString(body.notes)
        }

        if (body.monthlyCharge !== undefined) {
          const chargeNum = Number(body.monthlyCharge)
          if (!Number.isFinite(chargeNum) || chargeNum < 0) {
            throw new Error('INVALID_CHARGE')
          }
          const nextCharge = fromPaisa(toPaisa(chargeNum))
          if (config.monthlyCharge !== nextCharge) {
            config.monthlyCharge = nextCharge
            config.chargeHistory.push({
              monthlyCharge: nextCharge,
              effectiveDate: today,
              changedAt: new Date(),
              notes: cleanString(body.notes) || 'Monthly WiFi charge updated',
            })
          }
        }

        if (body.status !== undefined) {
          if (body.status !== 'active' && body.status !== 'inactive') {
            throw new Error('INVALID_STATUS')
          }
          if (body.status === 'active' && resident.status !== 'active') {
            throw new Error('RESIDENT_INACTIVE')
          }
          if (body.status === 'active' && config.status !== 'active') {
            const otherActive = await WiFiConfiguration.findOne({
              _id: { $ne: config._id },
              residentId: config.residentId,
              status: 'active',
            }).session(session)
            if (otherActive) {
              throw new Error('OTHER_ACTIVE_CONFIG_EXISTS')
            }
            config.status = 'active'
            config.endDate = null
          } else if (body.status === 'inactive' && config.status !== 'inactive') {
            config.status = 'inactive'
            config.endDate = today
          }
        }

        await config.save({ session })

        // Sync Resident.wifiCharge for future bills without modifying any existing MonthlyBill documents
        resident.wifiCharge =
          config.status === 'active' ? config.monthlyCharge : 0
        await resident.save({ session })
      })
    } catch (error) {
      const code = (error as Error).message
      if (code === 'CONFIG_NOT_FOUND' || code === 'RESIDENT_NOT_FOUND') {
        return NextResponse.json(
          { error: 'WiFi configuration not found.' },
          { status: 404 },
        )
      }
      if (
        code === 'INVALID_WIFI_NAME' ||
        code === 'INVALID_START_DATE' ||
        code === 'INVALID_CHARGE' ||
        code === 'INVALID_STATUS'
      ) {
        return NextResponse.json(
          { error: 'Please provide valid WiFi configuration details including a non-negative monthly charge.' },
          { status: 400 },
        )
      }
      if (code === 'RESIDENT_INACTIVE') {
        return NextResponse.json(
          { error: 'Cannot activate WiFi for an inactive (vacated) resident.' },
          { status: 400 },
        )
      }
      if (
        code === 'OTHER_ACTIVE_CONFIG_EXISTS' ||
        (error as { code?: number }).code === 11000
      ) {
        return NextResponse.json(
          { error: 'Resident already has an active WiFi configuration.' },
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

    const configuration = await WiFiConfiguration.findById(id).lean()
    const details = targetResidentId
      ? await getResidentWiFiDetails(targetResidentId)
      : null
    return NextResponse.json({ configuration, ...(details ?? {}) })
  } catch {
    return NextResponse.json(
      { error: 'Unable to update WiFi configuration.' },
      { status: 500 },
    )
  }
}

