import type { ClientSession } from 'mongoose'
import mongoose from 'mongoose'
import { MainMeter } from '@/models/main-meter'
import {
  MonthlyElectricityAllocation,
  MonthlyElectricityCycle,
} from '@/models/monthly-electricity-allocation'
import { MonthlyMainMeterBill } from '@/models/monthly-main-meter-bill'
import { MonthlySubMeterReading } from '@/models/monthly-sub-meter-reading'
import { Resident } from '@/models/resident'
import { Room } from '@/models/room'
import { SubMeter } from '@/models/sub-meter'

export const BILLING_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

export function isValidBillingMonth(value: unknown): value is string {
  return typeof value === 'string' && BILLING_MONTH_REGEX.test(value.trim())
}

export function roundUnits(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function calculateConsumption(previousReading: number, currentReading: number): number {
  if (!Number.isFinite(previousReading) || previousReading < 0) {
    throw new Error('INVALID_PREVIOUS_READING')
  }
  if (!Number.isFinite(currentReading) || currentReading < 0) {
    throw new Error('INVALID_CURRENT_READING')
  }
  if (currentReading < previousReading) {
    throw new Error('CURRENT_LESS_THAN_PREVIOUS')
  }
  return roundUnits(currentReading - previousReading)
}

export type RoomConsumptionInput = {
  roomId: string
  roomNumber: number
  consumption: number
}

export type RoomShareOutput = {
  roomId: string
  roomNumber: number
  consumption: number
  mainMeterShare: number
  additionalChargeRate: number
  additionalCharge: number
  finalElectricityAmount: number
}

export function distributeMainMeterBill(params: {
  billAmount: number
  additionalChargeRate: number
  rooms: RoomConsumptionInput[]
}): {
  totalConsumption: number
  allocations: RoomShareOutput[]
} {
  const { billAmount, additionalChargeRate, rooms } = params

  if (!Number.isFinite(billAmount) || billAmount < 0) {
    throw new Error('INVALID_BILL_AMOUNT')
  }
  if (!Number.isFinite(additionalChargeRate) || additionalChargeRate < 0) {
    throw new Error('INVALID_ADDITIONAL_RATE')
  }
  if (!Array.isArray(rooms) || rooms.length === 0) {
    throw new Error('NO_ASSIGNED_ROOMS')
  }

  const totalConsumption = roundUnits(
    rooms.reduce((sum, room) => sum + room.consumption, 0),
  )

  if (totalConsumption <= 0) {
    throw new Error('ZERO_TOTAL_CONSUMPTION')
  }

  const billPaisa = Math.round(billAmount * 100)

  const rawItems = rooms.map((room) => {
    const exactPaisa = (billPaisa * room.consumption) / totalConsumption
    const floorPaisa = Math.floor(exactPaisa + 1e-9)
    const remainder = exactPaisa - floorPaisa
    return {
      ...room,
      floorPaisa,
      remainder,
      allocatedPaisa: floorPaisa,
    }
  })

  const sumFloorPaisa = rawItems.reduce((sum, item) => sum + item.floorPaisa, 0)
  let remainderPaisa = billPaisa - sumFloorPaisa

  const sortedForRemainder = [...rawItems].sort((a, b) => {
    if (Math.abs(b.remainder - a.remainder) > 1e-9) {
      return b.remainder - a.remainder
    }
    if (b.consumption !== a.consumption) {
      return b.consumption - a.consumption
    }
    return a.roomNumber - b.roomNumber
  })

  for (let i = 0; i < sortedForRemainder.length && remainderPaisa > 0; i++) {
    sortedForRemainder[i].allocatedPaisa += 1
    remainderPaisa -= 1
  }

  const allocations: RoomShareOutput[] = rawItems
    .sort((a, b) => a.roomNumber - b.roomNumber)
    .map((item) => {
      const mainMeterShare = item.allocatedPaisa / 100
      const additionalChargePaisa = Math.round(
        item.consumption * additionalChargeRate * 100,
      )
      const additionalCharge = additionalChargePaisa / 100
      const finalElectricityAmount =
        (item.allocatedPaisa + additionalChargePaisa) / 100

      return {
        roomId: item.roomId,
        roomNumber: item.roomNumber,
        consumption: item.consumption,
        mainMeterShare,
        additionalChargeRate,
        additionalCharge,
        finalElectricityAmount,
      }
    })

  return {
    totalConsumption,
    allocations,
  }
}

export async function recalculateMonthlyAllocations(
  billingMonth: string,
  session?: ClientSession,
  revisionReason?: string,
) {
  const sessionOpt = session ? { session } : {}

  let cycle = await MonthlyElectricityCycle.findOne({ billingMonth }, null, sessionOpt)
  if (!cycle) {
    const [createdCycle] = await MonthlyElectricityCycle.create(
      [{ billingMonth, additionalChargeRate: 1, status: 'draft' }],
      sessionOpt,
    )
    cycle = createdCycle
  }

  const additionalChargeRate = cycle.additionalChargeRate ?? 1

  const [rooms, activeResidents, mainMeters, readings, bills, existingAllocations] =
    await Promise.all([
      Room.find().sort({ roomNumber: 1 }).session(session ?? null).lean(),
      Resident.find({ status: 'active' }).session(session ?? null).lean(),
      MainMeter.find().sort({ slotNumber: 1 }).session(session ?? null).lean(),
      MonthlySubMeterReading.find({ billingMonth }).session(session ?? null).lean(),
      MonthlyMainMeterBill.find({ billingMonth }).session(session ?? null).lean(),
      MonthlyElectricityAllocation.find({ billingMonth }).session(session ?? null),
    ])

  const roomById = new Map(rooms.map((r) => [String(r._id), r]))
  const residentByRoomId = new Map(
    activeResidents
      .filter((res) => res.roomId)
      .map((res) => [String(res.roomId), res]),
  )
  const readingByRoomId = new Map(readings.map((r) => [String(r.roomId), r]))
  const billByMainMeterId = new Map(bills.map((b) => [String(b.mainMeterId), b]))
  const existingAllocByRoomId = new Map(
    existingAllocations.map((a) => [String(a.roomId), a]),
  )

  const validRoomIdsWithAllocation = new Set<string>()

  for (const meter of mainMeters) {
    const meterIdStr = String(meter._id)
    const assignedRoomIds: string[] = ((meter.assignedRooms ?? []) as unknown[]).map(
      (id: unknown) => String(id),
    )
    const bill = billByMainMeterId.get(meterIdStr)

    // Calculate totalConsumption for this main meter from saved readings of its assigned rooms
    const meterReadings = assignedRoomIds
      .map((roomId: string) => readingByRoomId.get(roomId))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))

    const totalConsumption = roundUnits(
      meterReadings.reduce((sum: number, r) => sum + Number(r.consumption ?? 0), 0),
    )

    if (bill) {
      await MonthlyMainMeterBill.updateOne(
        { _id: bill._id },
        {
          $set: {
            totalConsumption,
            assignedRooms: assignedRoomIds.map((id: string) => new mongoose.Types.ObjectId(id)),
          },
        },
        sessionOpt,
      )
    }

    if (
      meter.status !== 'active' ||
      assignedRoomIds.length === 0 ||
      meterReadings.length !== assignedRoomIds.length ||
      !bill ||
      totalConsumption <= 0
    ) {
      continue
    }

    const distribution = distributeMainMeterBill({
      billAmount: bill.billAmount,
      additionalChargeRate,
      rooms: meterReadings.map((r) => ({
        roomId: String(r.roomId),
        roomNumber: Number(r.roomNumber),
        consumption: Number(r.consumption),
      })),
    })

    for (const share of distribution.allocations) {
      validRoomIdsWithAllocation.add(share.roomId)
      const room = roomById.get(share.roomId)
      const reading = readingByRoomId.get(share.roomId)!
      const activeResident = residentByRoomId.get(share.roomId)
      const existingAlloc = existingAllocByRoomId.get(share.roomId)

      const residentId = reading.residentId ?? activeResident?._id ?? null
      const residentName = reading.residentName ?? activeResident?.fullName ?? null
      const isVacant = reading.isVacant ?? !activeResident

      if (existingAlloc) {
        const changed =
          existingAlloc.mainMeterShare !== share.mainMeterShare ||
          existingAlloc.additionalCharge !== share.additionalCharge ||
          existingAlloc.finalElectricityAmount !== share.finalElectricityAmount ||
          existingAlloc.consumption !== share.consumption

        if (changed && (revisionReason || cycle.lastCorrectionReason)) {
          existingAlloc.revisionHistory.push({
            revisedAt: new Date(),
            reason: revisionReason || cycle.lastCorrectionReason || 'Recalculated',
            consumption: existingAlloc.consumption,
            mainMeterShare: existingAlloc.mainMeterShare,
            additionalChargeRate: existingAlloc.additionalChargeRate,
            additionalCharge: existingAlloc.additionalCharge,
            finalElectricityAmount: existingAlloc.finalElectricityAmount,
          })
        }

        existingAlloc.roomNumber = room?.roomNumber ?? share.roomNumber
        existingAlloc.floor = room?.floor ?? reading.floor
        existingAlloc.residentId = residentId
        existingAlloc.residentName = residentName
        existingAlloc.isVacant = isVacant
        existingAlloc.mainMeterId = meter._id
        existingAlloc.mainMeterName = meter.name
        existingAlloc.mainMeterBillId = bill._id
        existingAlloc.subMeterReadingId = reading._id
        existingAlloc.previousReading = reading.previousReading
        existingAlloc.currentReading = reading.currentReading
        existingAlloc.consumption = share.consumption
        existingAlloc.mainMeterTotalConsumption = distribution.totalConsumption
        existingAlloc.mainMeterBillAmount = bill.billAmount
        existingAlloc.mainMeterShare = share.mainMeterShare
        existingAlloc.additionalChargeRate = share.additionalChargeRate
        existingAlloc.additionalCharge = share.additionalCharge
        existingAlloc.finalElectricityAmount = share.finalElectricityAmount
        existingAlloc.calculatedAt = new Date()
        existingAlloc.status = cycle.status
        await existingAlloc.save(sessionOpt)
      } else {
        await MonthlyElectricityAllocation.create(
          [
            {
              billingMonth,
              roomId: new mongoose.Types.ObjectId(share.roomId),
              roomNumber: room?.roomNumber ?? share.roomNumber,
              floor: room?.floor ?? reading.floor,
              residentId,
              residentName,
              isVacant,
              mainMeterId: meter._id,
              mainMeterName: meter.name,
              mainMeterBillId: bill._id,
              subMeterReadingId: reading._id,
              previousReading: reading.previousReading,
              currentReading: reading.currentReading,
              consumption: share.consumption,
              mainMeterTotalConsumption: distribution.totalConsumption,
              mainMeterBillAmount: bill.billAmount,
              mainMeterShare: share.mainMeterShare,
              additionalChargeRate: share.additionalChargeRate,
              additionalCharge: share.additionalCharge,
              finalElectricityAmount: share.finalElectricityAmount,
              calculatedAt: new Date(),
              status: cycle.status,
              finalizedAt: cycle.status === 'finalized' ? new Date() : null,
            },
          ],
          sessionOpt,
        )
      }
    }
  }

  // Remove any draft allocations for rooms that no longer have a complete meter bill/reading in draft status
  if (cycle.status === 'draft') {
    const staleAllocationIds = existingAllocations
      .filter((a) => !validRoomIdsWithAllocation.has(String(a.roomId)) && a.status === 'draft')
      .map((a) => a._id)

    if (staleAllocationIds.length > 0) {
      await MonthlyElectricityAllocation.deleteMany(
        { _id: { $in: staleAllocationIds } },
        sessionOpt,
      )
    }
  }
}

export async function getMonthlyElectricityWorkspace(billingMonth: string) {
  const [
    rooms,
    activeResidents,
    mainMeters,
    subMeters,
    readings,
    priorReadings,
    bills,
    allocations,
    cycleDoc,
    readingMonths,
    billMonths,
    cycleMonths,
  ] = await Promise.all([
    Room.find().sort({ roomNumber: 1 }).lean(),
    Resident.find({ status: 'active' }).lean(),
    MainMeter.find()
      .populate({
        path: 'assignedRooms',
        select: 'roomNumber floor status currentResident',
        options: { sort: { roomNumber: 1 } },
      })
      .sort({ slotNumber: 1 })
      .lean(),
    SubMeter.find().sort({ roomNumber: 1 }).lean(),
    MonthlySubMeterReading.find({ billingMonth }).sort({ roomNumber: 1 }).lean(),
    MonthlySubMeterReading.find({ billingMonth: { $lt: billingMonth } })
      .sort({ billingMonth: -1 })
      .lean(),
    MonthlyMainMeterBill.find({ billingMonth }).sort({ slotNumber: 1 }).lean(),
    MonthlyElectricityAllocation.find({ billingMonth }).sort({ roomNumber: 1 }).lean(),
    MonthlyElectricityCycle.findOne({ billingMonth }).lean(),
    MonthlySubMeterReading.distinct('billingMonth'),
    MonthlyMainMeterBill.distinct('billingMonth'),
    MonthlyElectricityCycle.distinct('billingMonth'),
  ])

  const cycle = cycleDoc ?? {
    billingMonth,
    additionalChargeRate: 1,
    status: 'draft' as const,
    finalizedAt: null,
    lastCorrectionReason: '',
    auditLog: [],
  }

  const residentByRoomId = new Map(
    activeResidents
      .filter((res) => res.roomId)
      .map((res) => [String(res.roomId), res]),
  )
  const subMeterByRoomId = new Map(subMeters.map((s) => [String(s.roomId), s]))
  const readingByRoomId = new Map(readings.map((r) => [String(r.roomId), r]))
  const allocationByRoomId = new Map(allocations.map((a) => [String(a.roomId), a]))
  const billByMainMeterId = new Map(bills.map((b) => [String(b.mainMeterId), b]))

  // Latest prior reading per room (since priorReadings is sorted by billingMonth: -1, first seen per roomId is latest)
  const latestPriorByRoomId = new Map<string, (typeof priorReadings)[number]>()
  for (const prior of priorReadings) {
    const key = String(prior.roomId)
    if (!latestPriorByRoomId.has(key)) {
      latestPriorByRoomId.set(key, prior)
    }
  }

  // Map room._id -> active MainMeter
  const roomToActiveMainMeter = new Map<string, (typeof mainMeters)[number]>()
  for (const meter of mainMeters) {
    if (meter.status === 'active' && Array.isArray(meter.assignedRooms)) {
      for (const room of meter.assignedRooms as { _id?: unknown }[]) {
        const rId = room && typeof room === 'object' && '_id' in room ? String(room._id) : String(room)
        if (rId) roomToActiveMainMeter.set(rId, meter)
      }
    }
  }

  const roomRows = rooms.map((room) => {
    const roomIdStr = String(room._id)
    const activeResident = residentByRoomId.get(roomIdStr)
    const subMeter = subMeterByRoomId.get(roomIdStr)
    const mainMeter = roomToActiveMainMeter.get(roomIdStr)
    const reading = readingByRoomId.get(roomIdStr) ?? null
    const allocation = allocationByRoomId.get(roomIdStr) ?? null
    const prior = latestPriorByRoomId.get(roomIdStr) ?? null

    const isFinalized = cycle.status === 'finalized'
    const residentName = isFinalized && reading
      ? reading.residentName
      : activeResident?.fullName ?? reading?.residentName ?? null
    const isVacant = isFinalized && reading
      ? reading.isVacant
      : !activeResident

    return {
      roomId: roomIdStr,
      roomNumber: room.roomNumber,
      floor: room.floor,
      roomStatus: room.status,
      residentId: activeResident ? String(activeResident._id) : reading?.residentId ? String(reading.residentId) : null,
      residentName,
      isVacant,
      subMeterId: subMeter ? String(subMeter._id) : null,
      subMeterNumber: subMeter?.meterNumber ?? null,
      mainMeterId: mainMeter ? String(mainMeter._id) : allocation ? String(allocation.mainMeterId) : null,
      mainMeterName: mainMeter?.name ?? allocation?.mainMeterName ?? null,
      hasPriorReading: Boolean(prior),
      priorReadingMonth: prior?.billingMonth ?? null,
      autoPreviousReading: prior ? prior.currentReading : null,
      reading,
      allocation,
    }
  })

  const warnings: string[] = []
  const unassignedRoomNumbers = roomRows
    .filter((r) => !r.mainMeterId)
    .map((r) => r.roomNumber)

  if (unassignedRoomNumbers.length > 0) {
    warnings.push(
      `${unassignedRoomNumbers.length} room(s) are not assigned to any active main meter (Rooms: ${unassignedRoomNumbers
        .map((n) => String(n).padStart(2, '0'))
        .join(', ')}). Assign all rooms to main meters to distribute their electricity bills.`,
    )
  }

  const missingReadingRoomNumbers = roomRows
    .filter((r) => !r.reading)
    .map((r) => r.roomNumber)

  if (missingReadingRoomNumbers.length > 0) {
    warnings.push(
      `${missingReadingRoomNumbers.length} room(s) are missing sub-meter readings for ${billingMonth} (Rooms: ${missingReadingRoomNumbers
        .map((n) => String(n).padStart(2, '0'))
        .join(', ')}).`,
    )
  }

  const mainMeterRows = mainMeters.map((meter) => {
    const meterIdStr = String(meter._id)
    const assignedRoomsList = ((meter.assignedRooms ?? []) as { _id: unknown; roomNumber: number; floor: number }[]).map(
      (r) => {
        const rId = String(r._id)
        const reading = readingByRoomId.get(rId)
        return {
          roomId: rId,
          roomNumber: r.roomNumber,
          floor: r.floor,
          hasReading: Boolean(reading),
          consumption: reading ? reading.consumption : null,
        }
      },
    )

    const missingReadingRooms = assignedRoomsList
      .filter((r) => !r.hasReading)
      .map((r) => r.roomNumber)
    const allReadingsComplete =
      assignedRoomsList.length > 0 && missingReadingRooms.length === 0
    const totalConsumption = roundUnits(
      assignedRoomsList.reduce((sum, r) => sum + (r.consumption ?? 0), 0),
    )

    const bill = billByMainMeterId.get(meterIdStr) ?? null

    let distributionStatus:
      | 'distributed'
      | 'missing_rooms'
      | 'missing_readings'
      | 'missing_bill'
      | 'zero_consumption'
      | 'inactive' = 'distributed'
    let distributionWarning = ''

    if (meter.status === 'inactive') {
      distributionStatus = 'inactive'
      distributionWarning = 'Main meter is inactive.'
    } else if (assignedRoomsList.length === 0) {
      distributionStatus = 'missing_rooms'
      distributionWarning = 'No rooms assigned to this main meter.'
    } else if (!allReadingsComplete) {
      distributionStatus = 'missing_readings'
      distributionWarning = `Waiting for sub-meter readings from Room(s) ${missingReadingRooms
        .map((n) => String(n).padStart(2, '0'))
        .join(', ')}.`
    } else if (!bill) {
      distributionStatus = 'missing_bill'
      distributionWarning = 'Main meter electricity bill not entered yet.'
    } else if (totalConsumption <= 0) {
      distributionStatus = 'zero_consumption'
      distributionWarning =
        'Total consumption across assigned rooms is 0 units. Bill cannot be distributed when total consumption is zero.'
      warnings.push(
        `${meter.name} has a bill of ৳${bill.billAmount} but total consumption across its assigned rooms is 0 units.`,
      )
    }

    return {
      mainMeterId: meterIdStr,
      slotNumber: meter.slotNumber,
      name: meter.name,
      meterNumber: meter.meterNumber,
      location: meter.location,
      status: meter.status,
      assignedRooms: assignedRoomsList,
      missingReadingRooms,
      allReadingsComplete,
      totalConsumption,
      bill,
      distributionStatus,
      distributionWarning,
    }
  })

  const activeMainMetersWithRooms = mainMeterRows.filter(
    (m) => m.status === 'active' && m.assignedRooms.length > 0,
  )
  const mainMetersWithCompletedBills = activeMainMetersWithRooms.filter((m) => Boolean(m.bill)).length
  const mainMetersPendingBills = activeMainMetersWithRooms.length - mainMetersWithCompletedBills

  if (mainMetersPendingBills > 0) {
    const pendingNames = activeMainMetersWithRooms
      .filter((m) => !m.bill)
      .map((m) => m.name)
      .join(', ')
    warnings.push(`${mainMetersPendingBills} active main meter(s) have pending bills (${pendingNames}).`)
  }

  const totalMainMeterBills = roundMoney(
    bills.reduce((sum, b) => sum + b.billAmount, 0),
  )
  const totalSubMeterConsumption = roundUnits(
    readings.reduce((sum, r) => sum + r.consumption, 0),
  )
  const totalMainMeterShareDistributed = roundMoney(
    allocations.reduce((sum, a) => sum + a.mainMeterShare, 0),
  )
  const totalAdditionalCharges = roundMoney(
    allocations.length > 0
      ? allocations.reduce((sum, a) => sum + a.additionalCharge, 0)
      : readings.reduce(
          (sum, r) => sum + roundMoney(r.consumption * (cycle.additionalChargeRate ?? 1)),
          0,
        ),
  )
  const totalElectricityAmountDistributed = roundMoney(
    allocations.reduce((sum, a) => sum + a.finalElectricityAmount, 0),
  )

  const canFinalize =
    cycle.status === 'draft' &&
    rooms.length === 26 &&
    unassignedRoomNumbers.length === 0 &&
    missingReadingRoomNumbers.length === 0 &&
    activeMainMetersWithRooms.length > 0 &&
    mainMetersPendingBills === 0 &&
    activeMainMetersWithRooms.every((m) => m.distributionStatus === 'distributed') &&
    allocations.length === 26

  const defaultMonths = ['2026-10', '2026-11', '2026-12']
  const availableMonths = Array.from(
    new Set([
      ...defaultMonths,
      billingMonth,
      ...(readingMonths as string[]),
      ...(billMonths as string[]),
      ...(cycleMonths as string[]),
    ]),
  ).sort()

  return {
    billingMonth,
    availableMonths,
    cycle,
    roomRows,
    mainMeterRows,
    allocations,
    warnings,
    canFinalize,
    summary: {
      totalMainMeterBills,
      totalSubMeterConsumption,
      totalAdditionalCharges,
      totalMainMeterShareDistributed,
      totalElectricityAmountDistributed,
      roomsWithCompletedReadings: readings.length,
      roomsWithMissingReadings: rooms.length - readings.length,
      mainMetersWithCompletedBills,
      mainMetersPendingBills,
      activeMainMetersWithRooms: activeMainMetersWithRooms.length,
      additionalChargeRate: cycle.additionalChargeRate ?? 1,
    },
  }
}
