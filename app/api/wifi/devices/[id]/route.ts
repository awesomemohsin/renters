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
import { WiFiDevice } from '@/models/wifi-device'

const cleanString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid device ID.' }, { status: 400 })
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
        const device = await WiFiDevice.findById(id).session(session)
        if (!device) {
          throw new Error('DEVICE_NOT_FOUND')
        }
        targetResidentId = device.residentId

        const changes: string[] = []

        if (body.deviceName !== undefined) {
          const nextName = cleanString(body.deviceName)
          if (!nextName) {
            throw new Error('INVALID_DEVICE_NAME')
          }
          if (device.deviceName !== nextName) {
            changes.push(`Name: ${device.deviceName} → ${nextName}`)
            device.deviceName = nextName
          }
        }

        if (body.deviceType !== undefined) {
          const nextType = cleanString(body.deviceType)
          if (!isValidDeviceType(nextType)) {
            throw new Error('INVALID_DEVICE_TYPE')
          }
          if (device.deviceType !== nextType) {
            changes.push(`Type: ${device.deviceType} → ${nextType}`)
            device.deviceType = nextType
          }
        }

        if (body.registrationDate !== undefined) {
          const nextRegDate = cleanString(body.registrationDate)
          if (!nextRegDate) {
            throw new Error('INVALID_REGISTRATION_DATE')
          }
          device.registrationDate = nextRegDate
        }

        if (body.notes !== undefined) {
          device.notes = cleanString(body.notes)
        }

        let nextMac = device.macAddress
        if (body.macAddress !== undefined) {
          const normalized = normalizeMacAddress(body.macAddress)
          if (!normalized) {
            throw new Error('INVALID_MAC')
          }
          nextMac = normalized
        }

        let nextStatus: 'active' | 'inactive' = device.status
        if (body.action === 'deactivate' || body.status === 'inactive') {
          nextStatus = 'inactive'
        } else if (body.action === 'reactivate' || body.status === 'active') {
          nextStatus = 'active'
        }

        if (nextStatus === 'active') {
          const duplicateActive = await WiFiDevice.findOne({
            _id: { $ne: device._id },
            macAddress: nextMac,
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
              `DUPLICATE_ACTIVE_MAC:${nextMac} (${duplicateActive.deviceName} — ${ownerName})`,
            )
          }
        }

        if (device.macAddress !== nextMac) {
          changes.push(`MAC: ${device.macAddress} → ${nextMac}`)
          device.macAddress = nextMac
        }

        if (device.status !== nextStatus) {
          device.status = nextStatus
          if (nextStatus === 'inactive') {
            device.deactivatedDate = today
            device.history.push({
              action: 'deactivated',
              timestamp: new Date(),
              details: `Deactivated device (${device.macAddress})`,
            })
          } else {
            device.deactivatedDate = null
            device.history.push({
              action: 'reactivated',
              timestamp: new Date(),
              details: `Reactivated device (${device.macAddress})`,
            })
          }
        } else if (changes.length > 0) {
          device.history.push({
            action: 'updated',
            timestamp: new Date(),
            details: changes.join('; '),
          })
        }

        await device.save({ session })
      })
    } catch (error) {
      const msg = (error as Error).message
      if (msg === 'DEVICE_NOT_FOUND') {
        return NextResponse.json({ error: 'WiFi device not found.' }, { status: 404 })
      }
      if (msg === 'INVALID_DEVICE_NAME' || msg === 'INVALID_REGISTRATION_DATE') {
        return NextResponse.json(
          { error: 'Please provide a valid device name and registration date.' },
          { status: 400 },
        )
      }
      if (msg === 'INVALID_DEVICE_TYPE') {
        return NextResponse.json(
          {
            error:
              'Invalid device type. Choose Mobile, Laptop, Desktop, Smart TV, Router, or Other.',
          },
          { status: 400 },
        )
      }
      if (msg === 'INVALID_MAC') {
        return NextResponse.json(
          {
            error:
              'Invalid MAC address format. Expected 6 hex pairs (e.g. AA:BB:CC:11:22:33 or AA-BB-CC-11-22-33).',
          },
          { status: 400 },
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
            error: 'MAC address is already registered to an active device in the building.',
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

    const device = await WiFiDevice.findById(id).lean()
    const details = targetResidentId
      ? await getResidentWiFiDetails(targetResidentId)
      : null

    return NextResponse.json({ device, ...(details ?? {}) })
  } catch {
    return NextResponse.json(
      { error: 'Unable to update WiFi device.' },
      { status: 500 },
    )
  }
}

