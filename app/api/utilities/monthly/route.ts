import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import {
  getMonthlyElectricityWorkspace,
  isValidBillingMonth,
  recalculateMonthlyAllocations,
  roundMoney,
  roundUnits,
} from '@/lib/electricity-calculations'
import { connectToDatabase, isTransactionUnsupportedError } from '@/lib/mongodb'
import { ensureMainMetersExist, MainMeter } from '@/models/main-meter'
import {
  MonthlyElectricityAllocation,
  MonthlyElectricityCycle,
} from '@/models/monthly-electricity-allocation'
import { MonthlyMainMeterBill } from '@/models/monthly-main-meter-bill'
import { MonthlySubMeterReading } from '@/models/monthly-sub-meter-reading'
import { Resident } from '@/models/resident'
import { ensureRoomsExist, Room } from '@/models/room'
import { ensureSubMetersExist, SubMeter } from '@/models/sub-meter'

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
    await ensureMainMetersExist()
    await ensureSubMetersExist()

    const workspace = await getMonthlyElectricityWorkspace(billingMonth)
    return NextResponse.json(workspace)
  } catch {
    return NextResponse.json(
      { error: 'Unable to load monthly electricity records.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const billingMonth = typeof body.billingMonth === 'string' ? body.billingMonth.trim() : ''
    const action = body.action

    if (!isValidBillingMonth(billingMonth)) {
      return NextResponse.json(
        { error: 'Invalid billing month format. Expected YYYY-MM.' },
        { status: 400 },
      )
    }

    await connectToDatabase()
    await ensureRoomsExist()
    await ensureMainMetersExist()
    await ensureSubMetersExist()

    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        let cycle = await MonthlyElectricityCycle.findOne({ billingMonth }).session(session)
        if (!cycle) {
          const [created] = await MonthlyElectricityCycle.create(
            [{ billingMonth, additionalChargeRate: 1, status: 'draft' }],
            { session },
          )
          cycle = created
        }

        if (action === 'set_rate') {
          if (cycle.status === 'finalized') {
            throw new Error('MONTH_FINALIZED')
          }
          const rate = Number(body.additionalChargeRate)
          if (!Number.isFinite(rate) || rate < 0) {
            throw new Error('INVALID_RATE')
          }
          cycle.additionalChargeRate = roundMoney(rate)
          cycle.auditLog.push({
            action: 'rate_updated',
            timestamp: new Date(),
            reason: `Additional per-unit charge set to ৳${cycle.additionalChargeRate}`,
            totalMainMeterBills: 0,
            totalConsumption: 0,
            totalAdditionalCharges: 0,
            totalFinalAmount: 0,
          })
          await cycle.save({ session })
          await recalculateMonthlyAllocations(billingMonth, session, 'Additional charge rate updated')
          return
        }

        if (action === 'reopen') {
          if (cycle.status !== 'finalized') {
            throw new Error('NOT_FINALIZED')
          }
          const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
          if (reason.length < 3) {
            throw new Error('REASON_REQUIRED')
          }

          const [bills, readings, allocations] = await Promise.all([
            MonthlyMainMeterBill.find({ billingMonth }).session(session).lean(),
            MonthlySubMeterReading.find({ billingMonth }).session(session).lean(),
            MonthlyElectricityAllocation.find({ billingMonth }).session(session).lean(),
          ])

          const totalMainMeterBills = roundMoney(bills.reduce((s, b) => s + b.billAmount, 0))
          const totalConsumption = roundUnits(readings.reduce((s, r) => s + r.consumption, 0))
          const totalAdditionalCharges = roundMoney(allocations.reduce((s, a) => s + a.additionalCharge, 0))
          const totalFinalAmount = roundMoney(allocations.reduce((s, a) => s + a.finalElectricityAmount, 0))

          cycle.status = 'draft'
          cycle.lastCorrectionReason = reason
          cycle.auditLog.push({
            action: 'reopened_for_correction',
            timestamp: new Date(),
            reason,
            totalMainMeterBills,
            totalConsumption,
            totalAdditionalCharges,
            totalFinalAmount,
          })
          await cycle.save({ session })

          await Promise.all([
            MonthlySubMeterReading.updateMany(
              { billingMonth },
              { $set: { status: 'draft' } },
              { session },
            ),
            MonthlyMainMeterBill.updateMany(
              { billingMonth },
              { $set: { status: 'draft' } },
              { session },
            ),
            MonthlyElectricityAllocation.updateMany(
              { billingMonth },
              { $set: { status: 'draft' } },
              { session },
            ),
          ])
          return
        }

        if (action === 'finalize') {
          if (cycle.status === 'finalized') {
            throw new Error('MONTH_FINALIZED')
          }

          await recalculateMonthlyAllocations(billingMonth, session)

          const [rooms, activeResidents, mainMeters, readings, bills, allocations] =
            await Promise.all([
              Room.find().sort({ roomNumber: 1 }).session(session).lean(),
              Resident.find({ status: 'active' }).session(session).lean(),
              MainMeter.find().sort({ slotNumber: 1 }).session(session).lean(),
              MonthlySubMeterReading.find({ billingMonth }).session(session),
              MonthlyMainMeterBill.find({ billingMonth }).session(session),
              MonthlyElectricityAllocation.find({ billingMonth }).session(session),
            ])

          // Verify all 26 rooms are assigned to active main meters
          const assignedRoomIds = new Set<string>()
          const activeMetersWithRooms = mainMeters.filter(
            (m) => m.status === 'active' && Array.isArray(m.assignedRooms) && m.assignedRooms.length > 0,
          )
          for (const meter of activeMetersWithRooms) {
            for (const rId of meter.assignedRooms) {
              assignedRoomIds.add(String(rId))
            }
          }

          if (assignedRoomIds.size < rooms.length) {
            throw new Error('UNASSIGNED_ROOMS_REMAIN')
          }

          if (readings.length < rooms.length) {
            throw new Error('MISSING_ROOM_READINGS')
          }

          if (bills.length < activeMetersWithRooms.length) {
            throw new Error('MISSING_MAIN_METER_BILLS')
          }

          if (allocations.length < rooms.length) {
            throw new Error('INCOMPLETE_ALLOCATIONS')
          }

          const residentByRoomId = new Map(
            activeResidents
              .filter((r) => r.roomId)
              .map((r) => [String(r.roomId), r]),
          )

          const now = new Date()

          for (const reading of readings) {
            const activeResident = residentByRoomId.get(String(reading.roomId))
            reading.residentId = activeResident ? activeResident._id : null
            reading.residentName = activeResident ? activeResident.fullName : null
            reading.isVacant = !activeResident
            reading.status = 'finalized'
            reading.finalizedAt = now
            await reading.save({ session })
          }

          for (const bill of bills) {
            bill.status = 'finalized'
            bill.finalizedAt = now
            await bill.save({ session })
          }

          for (const alloc of allocations) {
            const activeResident = residentByRoomId.get(String(alloc.roomId))
            alloc.residentId = activeResident ? activeResident._id : null
            alloc.residentName = activeResident ? activeResident.fullName : null
            alloc.isVacant = !activeResident
            alloc.status = 'finalized'
            alloc.finalizedAt = now
            await alloc.save({ session })
          }

          const totalMainMeterBills = roundMoney(bills.reduce((s, b) => s + b.billAmount, 0))
          const totalConsumption = roundUnits(readings.reduce((s, r) => s + r.consumption, 0))
          const totalAdditionalCharges = roundMoney(
            allocations.reduce((s, a) => s + a.additionalCharge, 0),
          )
          const totalFinalAmount = roundMoney(
            allocations.reduce((s, a) => s + a.finalElectricityAmount, 0),
          )

          cycle.status = 'finalized'
          cycle.finalizedAt = now
          cycle.auditLog.push({
            action: 'finalized',
            timestamp: now,
            reason: cycle.lastCorrectionReason
              ? `Re-finalized after correction: ${cycle.lastCorrectionReason}`
              : 'Monthly electricity calculations finalized',
            totalMainMeterBills,
            totalConsumption,
            totalAdditionalCharges,
            totalFinalAmount,
          })
          await cycle.save({ session })

          await Promise.all([
            MainMeter.updateMany(
              { _id: { $in: activeMetersWithRooms.map((m) => m._id) } },
              { $set: { hasHistoricalReadings: true } },
              { session },
            ),
            SubMeter.updateMany(
              { roomId: { $in: rooms.map((r) => r._id) } },
              { $set: { hasHistoricalReadings: true } },
              { session },
            ),
          ])
          return
        }

        throw new Error('INVALID_ACTION')
      })
    } catch (error) {
      const code = (error as Error).message
      if (code === 'MONTH_FINALIZED') {
        return NextResponse.json(
          {
            error:
              'This billing month is already finalized. Use the controlled correction action with a reason to reopen it.',
          },
          { status: 409 },
        )
      }
      if (code === 'NOT_FINALIZED') {
        return NextResponse.json(
          { error: 'This billing month is not finalized.' },
          { status: 400 },
        )
      }
      if (code === 'REASON_REQUIRED') {
        return NextResponse.json(
          { error: 'Please provide a reason (at least 3 characters) to reopen a finalized month.' },
          { status: 400 },
        )
      }
      if (code === 'INVALID_RATE') {
        return NextResponse.json(
          { error: 'Additional per-unit charge rate must be a non-negative number.' },
          { status: 400 },
        )
      }
      if (code === 'UNASSIGNED_ROOMS_REMAIN') {
        return NextResponse.json(
          { error: 'Cannot finalize while there are unassigned rooms. Assign all 26 rooms to main meters first.' },
          { status: 400 },
        )
      }
      if (code === 'MISSING_ROOM_READINGS') {
        return NextResponse.json(
          { error: 'Cannot finalize while sub-meter readings are missing for one or more rooms.' },
          { status: 400 },
        )
      }
      if (code === 'MISSING_MAIN_METER_BILLS') {
        return NextResponse.json(
          { error: 'Cannot finalize while electricity bills are missing for one or more active main meters.' },
          { status: 400 },
        )
      }
      if (code === 'INCOMPLETE_ALLOCATIONS') {
        return NextResponse.json(
          { error: 'Cannot finalize until all 26 rooms have valid electricity allocations (total consumption must be greater than zero).' },
          { status: 400 },
        )
      }
      if (code === 'INVALID_ACTION') {
        return NextResponse.json({ error: 'Invalid monthly action.' }, { status: 400 })
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

    const workspace = await getMonthlyElectricityWorkspace(billingMonth)
    return NextResponse.json(workspace)
  } catch {
    return NextResponse.json(
      { error: 'Unable to process monthly electricity workflow action.' },
      { status: 500 },
    )
  }
}

