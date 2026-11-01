import mongoose from 'mongoose'
import { roundMoney } from '@/lib/electricity-calculations'
import { computeBillCategoryState, fromPaisa, toPaisa } from '@/lib/monthly-billing'
import { MonthlyBill } from '@/models/monthly-bill'
import { Resident } from '@/models/resident'
import { Room } from '@/models/room'
import { WiFiConfiguration } from '@/models/wifi-configuration'
import { WiFiDevice } from '@/models/wifi-device'
import { WIFI_DEVICE_TYPES, type WiFiDeviceType } from '@/lib/wifi-types'

const COLON_OR_HYPHEN_MAC_REGEX = /^([0-9A-Fa-f]{2})([:-])([0-9A-Fa-f]{2})\2([0-9A-Fa-f]{2})\2([0-9A-Fa-f]{2})\2([0-9A-Fa-f]{2})\2([0-9A-Fa-f]{2})$/
const DOT_MAC_REGEX = /^([0-9A-Fa-f]{4})\.([0-9A-Fa-f]{4})\.([0-9A-Fa-f]{4})$/
const RAW_HEX_MAC_REGEX = /^[0-9A-Fa-f]{12}$/

/**
 * Validates and normalizes a MAC address to uppercase colon-separated format (AA:BB:CC:DD:EE:FF).
 * Returns null if the format is invalid.
 */
export function normalizeMacAddress(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null

  if (COLON_OR_HYPHEN_MAC_REGEX.test(trimmed)) {
    const hex = trimmed.replace(/[:-]/g, '').toUpperCase()
    return hex.match(/.{2}/g)!.join(':')
  }

  if (DOT_MAC_REGEX.test(trimmed)) {
    const hex = trimmed.replace(/\./g, '').toUpperCase()
    return hex.match(/.{2}/g)!.join(':')
  }

  if (RAW_HEX_MAC_REGEX.test(trimmed)) {
    const hex = trimmed.toUpperCase()
    return hex.match(/.{2}/g)!.join(':')
  }

  return null
}

export function isValidDeviceType(value: unknown): value is WiFiDeviceType {
  return (
    typeof value === 'string' &&
    (WIFI_DEVICE_TYPES as readonly string[]).includes(value)
  )
}

let wifiCollectionsInitialized = false

export async function ensureWiFiCollectionsExist() {
  if (wifiCollectionsInitialized) return
  try {
    await WiFiConfiguration.createCollection().catch(() => {})
    await WiFiDevice.createCollection().catch(() => {})
    await WiFiConfiguration.init().catch(() => {})
    await WiFiDevice.init().catch(() => {})
    wifiCollectionsInitialized = true
  } catch {
    // Ignore if already initialized
  }
}

export async function getResidentWiFiDetails(residentId: string | mongoose.Types.ObjectId) {
  await ensureWiFiCollectionsExist()

  const [resident, configurations, devices, residentBills] = await Promise.all([
    Resident.findById(residentId).populate('roomId').lean(),
    WiFiConfiguration.find({ residentId }).sort({ status: 1, createdAt: -1 }).lean(),
    WiFiDevice.find({ residentId }).sort({ status: 1, createdAt: -1 }).lean(),
    MonthlyBill.find({ residentId }).lean(),
  ])

  const activeConfig =
    configurations.find((c) => c.status === 'active') ??
    configurations[0] ??
    null

  const activeDeviceCount = devices.filter((d) => d.status === 'active').length
  const outstandingWiFiPaisa = residentBills.reduce(
    (sum, bill) => sum + toPaisa(computeBillCategoryState(bill).unpaidWifi),
    0,
  )

  const roomObj = (resident as { roomId?: { _id: mongoose.Types.ObjectId; roomNumber: number; floor: number } | null } | null)?.roomId ?? null

  return {
    activeConfiguration: activeConfig
      ? {
          ...activeConfig,
          residentName: resident?.fullName ?? '',
          roomNumber: roomObj?.roomNumber ?? null,
          floor: roomObj?.floor ?? null,
          activeDeviceCount: devices.filter(
            (d) =>
              String(d.wifiConfigurationId) === String(activeConfig._id) &&
              d.status === 'active',
          ).length,
          totalDeviceCount: devices.filter(
            (d) => String(d.wifiConfigurationId) === String(activeConfig._id),
          ).length,
        }
      : null,
    configurations,
    devices,
    activeDeviceCount,
    totalDeviceCount: devices.length,
    monthlyCharge:
      activeConfig && activeConfig.status === 'active'
        ? activeConfig.monthlyCharge
        : 0,
    outstandingWiFiAmount: fromPaisa(outstandingWiFiPaisa),
  }
}

export async function getWiFiManagementWorkspace() {
  await ensureWiFiCollectionsExist()

  const [residents, rooms, configurations, devices, allBills] = await Promise.all([
    Resident.find().populate('roomId').sort({ createdAt: -1 }).lean(),
    Room.find().sort({ roomNumber: 1 }).lean(),
    WiFiConfiguration.find().sort({ status: 1, createdAt: -1 }).lean(),
    WiFiDevice.find().sort({ status: 1, createdAt: -1 }).lean(),
    MonthlyBill.find().lean(),
  ])

  const roomById = new Map(rooms.map((r) => [String(r._id), r]))
  const residentById = new Map(residents.map((r) => [String(r._id), r]))

  // Group devices by wifiConfigurationId and residentId
  const devicesByConfigId = new Map<string, typeof devices>()
  const devicesByResidentId = new Map<string, typeof devices>()

  for (const dev of devices) {
    const cKey = String(dev.wifiConfigurationId)
    const cList = devicesByConfigId.get(cKey) ?? []
    cList.push(dev)
    devicesByConfigId.set(cKey, cList)

    const rKey = String(dev.residentId)
    const rList = devicesByResidentId.get(rKey) ?? []
    rList.push(dev)
    devicesByResidentId.set(rKey, rList)
  }

  // Group configurations by residentId (active first, then most recent)
  const configsByResidentId = new Map<string, typeof configurations>()
  for (const cfg of configurations) {
    const rKey = String(cfg.residentId)
    const list = configsByResidentId.get(rKey) ?? []
    list.push(cfg)
    configsByResidentId.set(rKey, list)
  }

  // Compute unpaid WiFi per resident across all monthly bills
  const unpaidWifiPaisaByResidentId = new Map<string, number>()
  let totalOutstandingWiFiPaisa = 0

  for (const bill of allBills) {
    const catState = computeBillCategoryState(bill)
    const unpaidPaisa = toPaisa(catState.unpaidWifi)
    if (unpaidPaisa > 0) {
      totalOutstandingWiFiPaisa += unpaidPaisa
      const rKey = String(bill.residentId)
      unpaidWifiPaisaByResidentId.set(
        rKey,
        (unpaidWifiPaisaByResidentId.get(rKey) ?? 0) + unpaidPaisa,
      )
    }
  }

  // Build rows for:
  // 1) All active residents (whether or not they have configured WiFi yet, so the owner can easily configure WiFi for any active resident)
  // 2) Any inactive residents who have historical WiFi configurations (so historical WiFi records remain visible and searchable)
  const rows = residents
    .filter((res) => {
      if (res.status === 'active') return true
      return configsByResidentId.has(String(res._id))
    })
    .map((res) => {
      const resIdStr = String(res._id)
      const resConfigs = configsByResidentId.get(resIdStr) ?? []
      const primaryConfig =
        resConfigs.find((c) => c.status === 'active') ?? resConfigs[0] ?? null

      const populatedRoom = res.roomId as unknown as {
        _id: mongoose.Types.ObjectId
        roomNumber: number
        floor: number
      } | null
      const configRoom = primaryConfig
        ? roomById.get(String(primaryConfig.roomId))
        : null
      const roomObj = populatedRoom ?? configRoom ?? null

      const resDevices = primaryConfig
        ? devicesByConfigId.get(String(primaryConfig._id)) ?? []
        : devicesByResidentId.get(resIdStr) ?? []
      const allResidentDevices = devicesByResidentId.get(resIdStr) ?? []

      const activeDevices = resDevices.filter((d) => d.status === 'active')
      const isWiFiActive = Boolean(
        primaryConfig && primaryConfig.status === 'active',
      )
      const monthlyCharge = isWiFiActive ? primaryConfig!.monthlyCharge : 0
      const outstandingWiFi = fromPaisa(
        unpaidWifiPaisaByResidentId.get(resIdStr) ?? 0,
      )

      return {
        residentId: resIdStr,
        residentName: res.fullName,
        residentPhone: res.phone,
        residentStatus: res.status as 'active' | 'inactive',
        roomId: roomObj ? String(roomObj._id) : '',
        roomNumber: roomObj?.roomNumber ?? 0,
        floor: roomObj?.floor ?? 0,
        hasConfiguration: Boolean(primaryConfig),
        configurationId: primaryConfig ? String(primaryConfig._id) : null,
        wifiName: primaryConfig?.wifiName ?? 'Not configured',
        monthlyCharge,
        configuredCharge: primaryConfig?.monthlyCharge ?? 0,
        startDate: primaryConfig?.startDate ?? '',
        endDate: primaryConfig?.endDate ?? null,
        status: (isWiFiActive ? 'active' : 'inactive') as 'active' | 'inactive',
        notes: primaryConfig?.notes ?? '',
        activeDeviceCount: activeDevices.length,
        totalDeviceCount: allResidentDevices.length,
        devices: allResidentDevices,
        configurationHistory: resConfigs,
        outstandingWiFi,
      }
    })
    .sort((a, b) => {
      if (a.residentStatus !== b.residentStatus) {
        return a.residentStatus === 'active' ? -1 : 1
      }
      return a.roomNumber - b.roomNumber
    })

  const activeConfigs = configurations.filter((c) => c.status === 'active')
  const activeConfigsForActiveResidents = activeConfigs.filter((c) => {
    const r = residentById.get(String(c.residentId))
    return r && r.status === 'active'
  })

  const activeRegisteredDevices = devices.filter((d) => d.status === 'active').length
  const totalRegisteredDevices = devices.length
  const totalMonthlyWiFiCharges = roundMoney(
    activeConfigsForActiveResidents.reduce((sum, c) => sum + c.monthlyCharge, 0),
  )

  return {
    summary: {
      totalResidentsUsingWiFi: activeConfigsForActiveResidents.length,
      totalRegisteredDevices,
      activeRegisteredDevices,
      activeWiFiConnections: activeConfigs.length,
      totalMonthlyWiFiCharges,
      outstandingWiFiAmount: fromPaisa(totalOutstandingWiFiPaisa),
    },
    rows,
  }
}

