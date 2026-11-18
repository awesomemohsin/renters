import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ensureRoomsExist, Room } from '@/models/room'
import { Resident } from '@/models/resident'
import { ensureSubMetersExist, SubMeter } from '@/models/sub-meter'
import { MonthlySubMeterReading } from '@/models/monthly-sub-meter-reading'
import { MonthlyElectricityAllocation } from '@/models/monthly-electricity-allocation'
import { WiFiConfiguration } from '@/models/wifi-configuration'
import { WiFiDevice } from '@/models/wifi-device'
import { MonthlyBill } from '@/models/monthly-bill'
import { Payment } from '@/models/payment'
import { isValidBillingMonth } from '@/lib/electricity-calculations'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const monthParam = url.searchParams.get('month')?.trim()
    const currentMonth = new Date().toISOString().slice(0, 7)
    const billingMonth = monthParam && isValidBillingMonth(monthParam) ? monthParam : currentMonth

    await connectToDatabase()
    await ensureRoomsExist()
    await ensureSubMetersExist()

    const [
      rooms,
      allResidents,
      subMeters,
      readings,
      priorReadings,
      allocations,
      wifiConfigs,
      wifiDevices,
      bills,
      readingMonths,
      billMonths,
    ] = await Promise.all([
      Room.find().sort({ roomNumber: 1 }).lean(),
      Resident.find().sort({ createdAt: -1 }).lean(),
      SubMeter.find().sort({ roomNumber: 1 }).lean(),
      MonthlySubMeterReading.find({ billingMonth }).lean(),
      MonthlySubMeterReading.find({ billingMonth: { $lt: billingMonth } })
        .sort({ billingMonth: -1 })
        .lean(),
      MonthlyElectricityAllocation.find({ billingMonth }).lean(),
      WiFiConfiguration.find().lean(),
      WiFiDevice.find().lean(),
      MonthlyBill.find({ billingMonth }).lean(),
      MonthlySubMeterReading.distinct('billingMonth'),
      MonthlyBill.distinct('billingMonth'),
    ])

    // Distinct billing months available for dropdown
    const allMonthsSet = new Set<string>([
      billingMonth,
      currentMonth,
      ...(readingMonths as string[]),
      ...(billMonths as string[]),
    ])
    const availableMonths = Array.from(allMonthsSet).sort().reverse()

    // Group active residents and past residents by roomId
    const residentByRoomId = new Map<string, (typeof allResidents)[number]>()
    const pastResidentsByRoomId = new Map<string, Array<(typeof allResidents)[number]>>()

    for (const r of allResidents) {
      if (!r.roomId) continue
      const roomIdStr = String(r.roomId)
      if (r.status === 'active') {
        residentByRoomId.set(roomIdStr, r)
      } else {
        const list = pastResidentsByRoomId.get(roomIdStr) || []
        list.push(r)
        pastResidentsByRoomId.set(roomIdStr, list)
      }
    }
    const subMeterByRoomId = new Map(subMeters.map((s) => [String(s.roomId), s]))
    const readingByRoomId = new Map(readings.map((r) => [String(r.roomId), r]))
    const allocByRoomId = new Map(allocations.map((a) => [String(a.roomId), a]))
    const wifiConfigByResidentId = new Map(
      wifiConfigs.map((w) => [String(w.residentId), w]),
    )
    const activeDevicesByResidentId = new Map<string, number>()
    for (const d of wifiDevices) {
      if (d.status === 'active' && d.residentId) {
        const key = String(d.residentId)
        activeDevicesByResidentId.set(key, (activeDevicesByResidentId.get(key) || 0) + 1)
      }
    }
    const billByRoomId = new Map(bills.map((b) => [String(b.roomId), b]))

    // Find latest prior reading for rooms that don't have a reading this month
    const latestPriorReadingByRoomId = new Map<string, number>()
    for (const pr of priorReadings) {
      const key = String(pr.roomId)
      if (!latestPriorReadingByRoomId.has(key)) {
        latestPriorReadingByRoomId.set(key, pr.currentReading)
      }
    }

    let totalBilled = 0
    let totalCollected = 0
    let totalDue = 0
    let totalUnits = 0
    let readingsCount = 0

    const roomSummaries = rooms.map((room) => {
      const roomIdStr = String(room._id)
      const resident = residentByRoomId.get(roomIdStr) || null
      const subMeter = subMeterByRoomId.get(roomIdStr) || null
      const reading = readingByRoomId.get(roomIdStr) || null
      const allocation = allocByRoomId.get(roomIdStr) || null
      const bill = billByRoomId.get(roomIdStr) || null

      let wifiInfo = null
      if (resident) {
        const config = wifiConfigByResidentId.get(String(resident._id))
        const deviceCount = activeDevicesByResidentId.get(String(resident._id)) || 0
        wifiInfo = {
          hasConfig: Boolean(config),
          status: config?.status || 'inactive',
          monthlyCharge: config?.monthlyCharge || 0,
          deviceCount,
        }
      }

      // Estimate or actual previous reading
      const initialReading = subMeter?.initialReading ?? 0
      const baselinePrevious = latestPriorReadingByRoomId.get(roomIdStr) ?? initialReading
      const effectivePreviousReading = reading ? reading.previousReading : baselinePrevious

      if (reading) {
        readingsCount++
        totalUnits += reading.consumption
      }

      if (bill) {
        totalBilled += bill.totalPayable
        totalCollected += bill.totalPaid
        totalDue += bill.remainingDue
      }

      return {
        _id: roomIdStr,
        roomNumber: room.roomNumber,
        floor: room.floor,
        status: resident ? 'occupied' : 'vacant',
        monthlyRent: resident?.monthlyRent ?? room.monthlyRent ?? null,
        resident: resident
          ? {
              _id: String(resident._id),
              fullName: resident.fullName,
              phone: resident.phone,
              email: resident.email,
              nidNumber: resident.nidNumber || '',
              photoUrl: resident.profilePhoto?.url || '',
              partnerName: resident.partnerName || resident.spouseName || '',
              partnerPhone: resident.partnerPhone || '',
              partnerNid: resident.partnerNid || '',
              permanentAddress: resident.permanentAddress || '',
              nidFrontUrl: resident.nidFront?.url || '',
              nidBackUrl: resident.nidBack?.url || '',
              moveInDate: resident.moveInDate || '',
              status: resident.status,
            }
          : null,
        pastResidents: (pastResidentsByRoomId.get(roomIdStr) || []).map((pr) => ({
          _id: String(pr._id),
          fullName: pr.fullName,
          phone: pr.phone,
          nidNumber: pr.nidNumber || '',
          photoUrl: pr.profilePhoto?.url || '',
          partnerName: pr.partnerName || pr.spouseName || '',
          permanentAddress: pr.permanentAddress || '',
          moveInDate: pr.moveInDate || '',
          moveOutDate: pr.moveOutDate || '',
          status: pr.status,
        })),
        subMeter: subMeter
          ? {
              _id: String(subMeter._id),
              meterNumber: subMeter.meterNumber,
              initialReading: subMeter.initialReading,
            }
          : null,
        reading: reading
          ? {
              _id: String(reading._id),
              previousReading: reading.previousReading,
              currentReading: reading.currentReading,
              consumption: reading.consumption,
              readingDate: reading.readingDate,
              status: reading.status,
            }
          : null,
        baselinePreviousReading: effectivePreviousReading,
        electricityAllocation: allocation
          ? {
              status: allocation.status,
              mainMeterShare: allocation.mainMeterShare,
              additionalCharge: allocation.additionalCharge,
              finalElectricityAmount: allocation.finalElectricityAmount,
            }
          : null,
        wifi: wifiInfo,
        bill: bill
          ? {
              _id: String(bill._id),
              billingMonth: bill.billingMonth,
              status: bill.status,
              monthlyRent: bill.monthlyRent,
              electricityUnits: bill.electricityUnits,
              totalElectricity: bill.totalElectricity,
              wifiCharge: bill.wifiCharge,
              totalPayable: bill.totalPayable,
              totalPaid: bill.totalPaid,
              remainingDue: bill.remainingDue,
              previousOutstanding: bill.previousOutstanding,
            }
          : null,
      }
    })

    const occupiedCount = roomSummaries.filter((r) => r.status === 'occupied').length

    return NextResponse.json({
      billingMonth,
      availableMonths,
      summary: {
        totalRooms: rooms.length,
        occupiedCount,
        vacantCount: rooms.length - occupiedCount,
        readingsCount,
        totalBilled,
        totalCollected,
        totalDue,
        totalUnits,
      },
      rooms: roomSummaries,
    })
  } catch (error) {
    console.error('Dashboard rooms error:', error)
    return NextResponse.json(
      { error: 'Unable to load dashboard room summaries.' },
      { status: 500 },
    )
  }
}
