import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase, isTransactionUnsupportedError } from '@/lib/mongodb'
import {
  ensureWiFiCollectionsExist,
  getResidentWiFiDetails,
  isValidDeviceType,
  normalizeMacAddress,
} from '@/lib/wifi'
import { Resident } from '@/models/resident'
import { WiFiConfiguration } from '@/models/wifi-configuration'
import { WiFiDevice } from '@/models/wifi-device'

const cleanString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

export async function GET(request: Request) {
  try {
    await connectToDatabase()
    await ensureWiFiCollectionsExist()

    const url = new URL(request.url)
    const residentId = url.searchParams.get('residentId')?.trim()
    const wifiConfigurationId = url.searchParams.get('wifiConfigurationId')?.trim()
    const query: Record<string, unknown> = {}

    if (residentId) {
      if (!mongoose.isValidObjectId(residentId)) {
        return NextResponse.json({ error: 'Invalid resident ID.' }, { status: 400 })
      }
      query.residentId = residentId
    }
    if (wifiConfigurationId) {
      if (!mongoose.isValidObjectId(wifiConfigurationId)) {
        return NextResponse.json(
          { error: 'Invalid WiFi configuration ID.' },
          { status: 400 },
        )
      }
      query.wifiConfigurationId = wifiConfigurationId
    }

    const devices = await WiFiDevice.find(query)
      .sort({ status: 1, createdAt: -1 })
      .lean()

    return NextResponse.json({
      devices,
      activeCount: devices.filter((d) => d.status === 'active').length,
      totalCount: devices.length,
    })
  } catch {
    return NextResponse.json(
      { error: 'Unable to load registered WiFi devices.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const wifiConfigurationId = cleanString(body.wifiConfigurationId)
    const residentIdParam = cleanString(body.residentId)
    const deviceName = cleanString(body.deviceName)
    const deviceType = cleanString(body.deviceType) || 'Mobile'
    const normalizedMac = normalizeMacAddress(body.macAddress)
    const registrationDate =
      cleanString(body.registrationDate) || new Date().toISOString().slice(0, 10)
    const status: 'active' | 'inactive' =
      body.status === 'inactive' ? 'inactive' : 'active'
    const notes = cleanString(body.notes)

    if (!deviceName) {
      return NextResponse.json(
        { error: 'Device name is required.' },
        { status: 400 },
      )
    }
    if (!isValidDeviceType(deviceType)) {
      return NextResponse.json(
        {
          error:
            'Invalid device type. Choose Mobile, Laptop, Desktop, Smart TV, Router, or Other.',
        },
        { status: 400 },
      )
    }
    if (!normalizedMac) {
      return NextResponse.json(
        {
          error:
            'Invalid MAC address format. Expected 6 hex pairs (e.g. AA:BB:CC:11:22:33 or AA-BB-CC-11-22-33).',
        },
        { status: 400 },
      )
    }

    await connectToDatabase()
    await ensureWiFiCollectionsExist()

    const session = await mongoose.startSession()
    let createdDeviceId: mongoose.Types.ObjectId | null = null
    let targetResidentId: mongoose.Types.ObjectId | null = null

    try {
      await session.withTransaction(async () => {
        let config = null
        if (wifiConfigurationId && mongoose.isValidObjectId(wifiConfigurationId)) {
          config = await WiFiConfiguration.findById(wifiConfigurationId).session(session)
        } else if (residentIdParam && mongoose.isValidObjectId(residentIdParam)) {
          config = await WiFiConfiguration.findOne({
            residentId: residentIdParam,
          })
            .sort({ status: 1, createdAt: -1 })
            .session(session)
        }

        if (!config) {
          throw new Error('CONFIG_NOT_FOUND')
        }

        targetResidentId = config.residentId

        if (status === 'active') {
          const duplicateActive = await WiFiDevice.findOne({
            macAddress: normalizedMac,
            status: 'active',
          }).session(session)

          if (duplicateActive) {
            const conflictingResident = await Resident.findById(
              duplicateActive.residentId,
            )
              .session(session)
              .lean()
            const ownerName = conflictingResident?.fullName ?? 'another resident'
            throw new Error(
              `DUPLICATE_ACTIVE_MAC:${normalizedMac} (${duplicateActive.deviceName} — ${ownerName})`,
            )
          }
        }

        const [created] = await WiFiDevice.create(
          [
            {
              wifiConfigurationId: config._id,
              residentId: config.residentId,
              deviceName,
              deviceType,
              macAddress: normalizedMac,
              registrationDate,
              deactivatedDate: status === 'inactive' ? registrationDate : null,
              status,
              notes,
              history: [
                {
                  action: 'registered',
                  timestamp: new Date(),
                  details: `Registered ${deviceType} (${normalizedMac}) as ${status}`,
                },
              ],
            },
          ],
          { session },
        )

        createdDeviceId = created._id
      })
    } catch (error) {
      const msg = (error as Error).message
      if (msg === 'CONFIG_NOT_FOUND') {
        return NextResponse.json(
          {
            error:
              'Please configure a WiFi profile for this resident before registering devices.',
          },
          { status: 404 },
        )
      }
      if (msg.startsWith('DUPLICATE_ACTIVE_MAC:')) {
        const detail = msg.replace('DUPLICATE_ACTIVE_MAC:', '')
        return NextResponse.json(
          {
            error: `Duplicate active MAC address not allowed across the building: ${detail}.`,
          },
          { status: 409 },
        )
      }
      if ((error as { code?: number }).code === 11000) {
        return NextResponse.json(
          {
            error: `MAC address ${normalizedMac} is already registered to an active device in the building.`,
          },
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

    const device = await WiFiDevice.findById(createdDeviceId).lean()
    const details = targetResidentId
      ? await getResidentWiFiDetails(targetResidentId)
      : null

    return NextResponse.json({ device, ...(details ?? {}) }, { status: 201 })
  } catch {
    return NextResponse.json(
      { error: 'Unable to register WiFi device.' },
      { status: 500 },
    )
  }
}

