import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { isValidBillingMonth } from '@/lib/electricity-calculations'
import { connectToDatabase, isTransactionUnsupportedError } from '@/lib/mongodb'
import {
  ensureBillingCollectionsExist,
  getMonthlyBillingWorkspace,
  recalculateResidentBillChain,
  toPaisa,
  fromPaisa,
} from '@/lib/monthly-billing'
import { MonthlyBill } from '@/models/monthly-bill'
import {
  MonthlyElectricityAllocation,
  MonthlyElectricityCycle,
} from '@/models/monthly-electricity-allocation'
import { Resident } from '@/models/resident'
import { ensureRoomsExist } from '@/models/room'
import { WiFiConfiguration } from '@/models/wifi-configuration'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const monthParam = url.searchParams.get('month')?.trim()
    const billingMonth = monthParam || new Date().toISOString().slice(0, 7)

    if (!isValidBillingMonth(billingMonth)) {
      return NextResponse.json(
        { error: 'Invalid billing month format. Expected YYYY-MM.' },
        { status: 400 },
      )
    }

    await connectToDatabase()
    await ensureRoomsExist()

    const workspace = await getMonthlyBillingWorkspace(billingMonth)
    return NextResponse.json(workspace)
  } catch {
    return NextResponse.json(
      { error: 'Unable to load monthly billing workspace.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const billingMonth =
      typeof body.billingMonth === 'string' ? body.billingMonth.trim() : ''
    const allowUnfinalizedElectricity = Boolean(body.allowUnfinalizedElectricity)
    const rawOverrides = body.wifiCharges ?? body.wifiOverrides
    const wifiOverrides: Record<string, number> =
      rawOverrides && typeof rawOverrides === 'object'
        ? rawOverrides
        : {}

    if (!isValidBillingMonth(billingMonth)) {
      return NextResponse.json(
        { error: 'Invalid billing month format. Expected YYYY-MM.' },
        { status: 400 },
      )
    }

    await connectToDatabase()
    await ensureRoomsExist()
    await ensureBillingCollectionsExist()

    const session = await mongoose.startSession()
    let generatedCount = 0
    let skippedCount = 0

    try {
      await session.withTransaction(async () => {
        generatedCount = 0
        skippedCount = 0
        const activeResidents = await Resident.find({ status: 'active' })
          .populate('roomId')
          .session(session)
        const existingBills = await MonthlyBill.find({ billingMonth })
          .session(session)
          .lean()
        const electricityCycle = await MonthlyElectricityCycle.findOne({
          billingMonth,
        })
          .session(session)
          .lean()
        const allocations = await MonthlyElectricityAllocation.find({
          billingMonth,
        })
          .session(session)
          .lean()

        if (activeResidents.length === 0) {
          throw new Error('NO_ACTIVE_RESIDENTS')
        }

        const existingResidentIds = new Set(
          existingBills.map((b) => String(b.residentId)),
        )
        skippedCount = existingBills.length
        const residentsToGenerate = activeResidents.filter(
          (res: { _id: mongoose.Types.ObjectId }) => !existingResidentIds.has(String(res._id)),
        )

        if (residentsToGenerate.length === 0) {
          throw new Error('ALL_BILLS_ALREADY_EXIST')
        }

        const activeWifiConfigs = await WiFiConfiguration.find({
          status: 'active',
          residentId: { $in: residentsToGenerate.map((r: { _id: mongoose.Types.ObjectId }) => r._id) },
        })
          .session(session)
          .lean()
        const wifiConfigByResidentId = new Map(
          activeWifiConfigs.map((w: { residentId: mongoose.Types.ObjectId; monthlyCharge: number }) => [
            String(w.residentId),
            w,
          ]),
        )

        const allocByRoomId = new Map(
          allocations.map((a) => [String(a.roomId), a]),
        )

        // Check for missing rooms or missing finalized electricity allocations
        const missingRoomNames: string[] = []
        const missingElecRooms: number[] = []

        for (const res of residentsToGenerate) {
          const roomObj = res.roomId as unknown as {
            _id: mongoose.Types.ObjectId
            roomNumber: number
            floor: number
          } | null
          if (!roomObj || !roomObj._id) {
            missingRoomNames.push(res.fullName)
            continue
          }
          const alloc = allocByRoomId.get(String(roomObj._id))
          if (!alloc || alloc.status !== 'finalized') {
            missingElecRooms.push(roomObj.roomNumber)
          }
        }

        if (missingRoomNames.length > 0) {
          throw new Error(`RESIDENT_MISSING_ROOM:${missingRoomNames.join(', ')}`)
        }

        if (
          (electricityCycle?.status !== 'finalized' ||
            missingElecRooms.length > 0) &&
          !allowUnfinalizedElectricity
        ) {
          const roomLabels = missingElecRooms
            .sort((a, b) => a - b)
            .map((n) => `Room ${String(n).padStart(2, '0')}`)
            .join(', ')
          throw new Error(
            `ELECTRICITY_NOT_FINALIZED:${roomLabels || 'All rooms'}`,
          )
        }

        for (const res of residentsToGenerate) {
          const roomObj = res.roomId as unknown as {
            _id: mongoose.Types.ObjectId
            roomNumber: number
            floor: number
          }
          const roomIdStr = String(roomObj._id)
          const resIdStr = String(res._id)
          const alloc = allocByRoomId.get(roomIdStr)

          const electricityUnits =
            alloc && alloc.status === 'finalized' ? alloc.consumption : 0
          const electricityMainMeterShare =
            alloc && alloc.status === 'finalized' ? alloc.mainMeterShare : 0
          const electricityAdditionalCharge =
            alloc && alloc.status === 'finalized' ? alloc.additionalCharge : 0
          const totalElectricity =
            alloc && alloc.status === 'finalized'
              ? alloc.finalElectricityAmount
              : 0

          const activeWifi = wifiConfigByResidentId.get(resIdStr)
          const defaultWifi = activeWifi
            ? activeWifi.monthlyCharge
            : Number((res as { wifiCharge?: number }).wifiCharge ?? 0)

          let wifiCharge = Number(
            wifiOverrides[resIdStr] !== undefined
              ? wifiOverrides[resIdStr]
              : defaultWifi,
          )
          if (!Number.isFinite(wifiCharge) || wifiCharge < 0) {
            throw new Error('INVALID_WIFI_CHARGE')
          }
          wifiCharge = fromPaisa(toPaisa(wifiCharge))

          if (wifiOverrides[resIdStr] !== undefined) {
            ;(res as { wifiCharge?: number }).wifiCharge = wifiCharge
            await res.save({ session })
          }

          await MonthlyBill.create(
            [
              {
                billingMonth,
                residentId: res._id,
                roomId: roomObj._id,
                residentName: res.fullName,
                residentPhone: res.phone,
                roomNumber: roomObj.roomNumber,
                floor: roomObj.floor,
                monthlyRent: res.monthlyRent,
                electricityAllocationId:
                  alloc && alloc.status === 'finalized' ? alloc._id : null,
                electricityUnits,
                electricityMainMeterShare,
                electricityAdditionalCharge,
                totalElectricity,
                wifiCharge,
                additionalCharges: [],
                adjustments: [],
                generatedAt: new Date(),
              },
            ],
            { session },
          )

          await recalculateResidentBillChain(res._id, session)
          generatedCount += 1
        }
      })
    } catch (error) {
      const msg = (error as Error).message
      if (msg === 'NO_ACTIVE_RESIDENTS') {
        return NextResponse.json(
          { error: 'No active residents found to generate monthly bills.' },
          { status: 400 },
        )
      }
      if (msg === 'ALL_BILLS_ALREADY_EXIST') {
        return NextResponse.json(
          {
            error: `Monthly bills for all active residents have already been generated for ${billingMonth}.`,
          },
          { status: 409 },
        )
      }
      if (msg === 'INVALID_WIFI_CHARGE') {
        return NextResponse.json(
          { error: 'WiFi charge must be a non-negative number.' },
          { status: 400 },
        )
      }
      if (msg.startsWith('RESIDENT_MISSING_ROOM:')) {
        const names = msg.split(':')[1]
        return NextResponse.json(
          {
            error: `Cannot generate bills because active resident(s) have no assigned room: ${names}.`,
          },
          { status: 400 },
        )
      }
      if (msg.startsWith('ELECTRICITY_NOT_FINALIZED:')) {
        const roomsList = msg.split(':')[1]
        return NextResponse.json(
          {
            error: `Electricity allocations for ${billingMonth} are not finalized (${roomsList}). Finalize electricity on the Utilities page first, or confirm generation without finalized electricity.`,
          },
          { status: 400 },
        )
      }
      if ((error as { code?: number }).code === 11000) {
        return NextResponse.json(
          { error: 'Duplicate monthly bill detected for this resident and month.' },
          { status: 409 },
        )
      }
      if (isTransactionUnsupportedError(error)) {
        return NextResponse.json(
          {
            error:
              'MongoDB transactions are not supported by the current database deployment.',
          },
          { status: 500 },
        )
      }
      throw error
    } finally {
      await session.endSession()
    }

    const workspace = await getMonthlyBillingWorkspace(billingMonth)
    return NextResponse.json(
      { ...workspace, workspace, generatedCount, skippedCount },
      { status: 201 },
    )
  } catch {
    return NextResponse.json(
      { error: 'Unable to generate monthly bills.' },
      { status: 500 },
    )
  }
}

