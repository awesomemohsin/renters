'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  Cpu,
  History,
  Laptop,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Search,
  Smartphone,
  Tv,
  Wifi,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatRoomNumber } from '@/lib/utils'
import { WIFI_DEVICE_TYPES, type WiFiDeviceType } from '@/lib/wifi-types'

type DeviceHistoryItem = {
  action: string
  timestamp: string
  details: string
}

type WiFiDeviceItem = {
  _id: string
  wifiConfigurationId: string
  residentId: string
  deviceName: string
  deviceType: WiFiDeviceType
  macAddress: string
  registrationDate: string
  deactivatedDate?: string | null
  status: 'active' | 'inactive'
  notes?: string
  history?: DeviceHistoryItem[]
}

type WiFiConfigHistoryItem = {
  monthlyCharge: number
  effectiveDate: string
  changedAt: string
  notes?: string
}

type WiFiConfigurationItem = {
  _id: string
  residentId: string
  roomId: string
  wifiName: string
  monthlyCharge: number
  startDate: string
  endDate?: string | null
  status: 'active' | 'inactive'
  notes?: string
  chargeHistory?: WiFiConfigHistoryItem[]
}

type WiFiTableRow = {
  residentId: string
  residentName: string
  residentPhone: string
  residentStatus: 'active' | 'inactive'
  roomId: string
  roomNumber: number
  floor: number
  hasConfiguration: boolean
  configurationId: string | null
  wifiName: string
  monthlyCharge: number
  configuredCharge: number
  startDate: string
  endDate?: string | null
  status: 'active' | 'inactive'
  notes: string
  activeDeviceCount: number
  totalDeviceCount: number
  devices: WiFiDeviceItem[]
  configurationHistory: WiFiConfigurationItem[]
  outstandingWiFi: number
}

type WorkspaceSummary = {
  totalResidentsUsingWiFi: number
  totalRegisteredDevices: number
  activeRegisteredDevices: number
  activeWiFiConnections: number
  totalMonthlyWiFiCharges: number
  outstandingWiFiAmount: number
}

function getDeviceIcon(type: WiFiDeviceType) {
  switch (type) {
    case 'Mobile':
      return <Smartphone className="size-3.5 text-slate-500" />
    case 'Laptop':
      return <Laptop className="size-3.5 text-slate-500" />
    case 'Desktop':
      return <Cpu className="size-3.5 text-slate-500" />
    case 'Smart TV':
      return <Tv className="size-3.5 text-slate-500" />
    case 'Router':
      return <Wifi className="size-3.5 text-slate-500" />
    default:
      return <Cpu className="size-3.5 text-slate-500" />
  }
}

export function WiFiManagementPage() {
  const [rows, setRows] = useState<WiFiTableRow[]>([])
  const [summary, setSummary] = useState<WorkspaceSummary>({
    totalResidentsUsingWiFi: 0,
    totalRegisteredDevices: 0,
    activeRegisteredDevices: 0,
    activeWiFiConnections: 0,
    totalMonthlyWiFiCharges: 0,
    outstandingWiFiAmount: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [floorFilter, setFloorFilter] = useState('0')
  const [statusFilter, setStatusFilter] = useState('all')

  // Configuration Modal State
  const [configModalRow, setConfigModalRow] = useState<WiFiTableRow | null>(null)
  const [configForm, setConfigForm] = useState({
    wifiName: '',
    monthlyCharge: '0',
    startDate: '',
    status: 'active' as 'active' | 'inactive',
    notes: '',
  })
  const [savingConfig, setSavingConfig] = useState(false)
  const [configError, setConfigError] = useState('')

  // Device Management Modal State
  const [deviceModalRow, setDeviceModalRow] = useState<WiFiTableRow | null>(null)
  const [deviceList, setDeviceList] = useState<WiFiDeviceItem[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [deviceError, setDeviceError] = useState('')

  // Add Device Form
  const [newDeviceName, setNewDeviceName] = useState('')
  const [newDeviceType, setNewDeviceType] = useState<WiFiDeviceType>('Mobile')
  const [newDeviceMac, setNewDeviceMac] = useState('')
  const [newDeviceRegDate, setNewDeviceRegDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [newDeviceNotes, setNewDeviceNotes] = useState('')
  const [savingNewDevice, setSavingNewDevice] = useState(false)

  // Edit Device State
  const [editingDevice, setEditingDevice] = useState<WiFiDeviceItem | null>(null)
  const [editDeviceName, setEditDeviceName] = useState('')
  const [editDeviceType, setEditDeviceType] = useState<WiFiDeviceType>('Mobile')
  const [editDeviceMac, setEditDeviceMac] = useState('')
  const [editDeviceRegDate, setEditDeviceRegDate] = useState('')
  const [editDeviceNotes, setEditDeviceNotes] = useState('')
  const [savingEditDevice, setSavingEditDevice] = useState(false)

  // History Drawer State
  const [historyDevice, setHistoryDevice] = useState<WiFiDeviceItem | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/wifi')
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'Failed to load WiFi records.')
      } else {
        setRows(data.rows ?? [])
        setSummary(data.summary ?? {
          totalResidentsUsingWiFi: 0,
          totalRegisteredDevices: 0,
          activeRegisteredDevices: 0,
          activeWiFiConnections: 0,
          totalMonthlyWiFiCharges: 0,
          outstandingWiFiAmount: 0,
        })
      }
    } catch {
      setError('Unable to load WiFi records.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filtered rows
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const floorNum = Number(floorFilter || 0)

    return rows.filter((row) => {
      if (floorNum && row.floor !== floorNum) return false
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (q) {
        const roomStr = formatRoomNumber(row.roomNumber).toLowerCase()
        const matchName = row.residentName.toLowerCase().includes(q)
        const matchRoom =
          roomStr.includes(q) || `room ${roomStr}`.includes(q) || String(row.roomNumber).includes(q)
        const matchMac = row.devices.some((d) => d.macAddress.toLowerCase().includes(q))
        const matchSsid = row.wifiName.toLowerCase().includes(q)
        if (!matchName && !matchRoom && !matchMac && !matchSsid) return false
      }
      return true
    })
  }, [rows, search, floorFilter, statusFilter])

  // Open Configuration Modal
  const openConfigModal = (row: WiFiTableRow) => {
    setConfigModalRow(row)
    setConfigError('')
    setConfigForm({
      wifiName: row.wifiName === 'Not configured' ? `Room-${formatRoomNumber(row.roomNumber)}-WiFi` : row.wifiName,
      monthlyCharge: String(row.hasConfiguration ? row.configuredCharge : row.monthlyCharge || 500),
      startDate: row.startDate || new Date().toISOString().slice(0, 10),
      status: row.status === 'inactive' && row.hasConfiguration ? 'inactive' : 'active',
      notes: row.notes || '',
    })
  }

  // Save Configuration
  const handleSaveConfig = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!configModalRow) return
    setSavingConfig(true)
    setConfigError('')

    try {
      const response = await fetch('/api/wifi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId: configModalRow.residentId,
          wifiName: configForm.wifiName,
          monthlyCharge: Number(configForm.monthlyCharge),
          startDate: configForm.startDate,
          status: configForm.status,
          notes: configForm.notes,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setConfigError(data.error ?? 'Failed to save WiFi configuration.')
      } else {
        setConfigModalRow(null)
        setNotice(`WiFi configuration saved for ${configModalRow.residentName}.`)
        await loadData()
      }
    } catch {
      setConfigError('Network error while saving WiFi configuration.')
    } finally {
      setSavingConfig(false)
    }
  }

  // Open Device Modal
  const openDeviceModal = (row: WiFiTableRow) => {
    setDeviceModalRow(row)
    setDeviceError('')
    setNewDeviceName('')
    setNewDeviceType('Mobile')
    setNewDeviceMac('')
    setNewDeviceRegDate(new Date().toISOString().slice(0, 10))
    setNewDeviceNotes('')
    setEditingDevice(null)
    setHistoryDevice(null)
    loadDevicesForResident(row.residentId)
  }

  const loadDevicesForResident = async (residentId: string) => {
    setLoadingDevices(true)
    try {
      const res = await fetch(`/api/wifi/devices?residentId=${encodeURIComponent(residentId)}`)
      const data = await res.json()
      if (res.ok) {
        setDeviceList(data.devices ?? [])
      }
    } catch {
      // ignore
    } finally {
      setLoadingDevices(false)
    }
  }

  // Add Device
  const handleAddDevice = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!deviceModalRow) return
    setSavingNewDevice(true)
    setDeviceError('')

    try {
      const response = await fetch('/api/wifi/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId: deviceModalRow.residentId,
          deviceName: newDeviceName,
          deviceType: newDeviceType,
          macAddress: newDeviceMac,
          registrationDate: newDeviceRegDate,
          status: 'active',
          notes: newDeviceNotes,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setDeviceError(data.error ?? 'Failed to register device.')
      } else {
        setNewDeviceName('')
        setNewDeviceMac('')
        setNewDeviceNotes('')
        setNotice(`Device registered successfully.`)
        await loadDevicesForResident(deviceModalRow.residentId)
        await loadData()
      }
    } catch {
      setDeviceError('Network error while registering device.')
    } finally {
      setSavingNewDevice(false)
    }
  }

  // Toggle Device Status (Deactivate / Reactivate)
  const handleToggleDeviceStatus = async (device: WiFiDeviceItem) => {
    if (!deviceModalRow) return
    setDeviceError('')
    const nextStatus = device.status === 'active' ? 'inactive' : 'active'
    try {
      const res = await fetch(`/api/wifi/devices/${device._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: nextStatus === 'active' ? 'reactivate' : 'deactivate',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDeviceError(data.error ?? 'Failed to update device status.')
      } else {
        await loadDevicesForResident(deviceModalRow.residentId)
        await loadData()
      }
    } catch {
      setDeviceError('Network error while updating device status.')
    }
  }

  // Start Edit Device
  const startEditDevice = (device: WiFiDeviceItem) => {
    setEditingDevice(device)
    setEditDeviceName(device.deviceName)
    setEditDeviceType(device.deviceType)
    setEditDeviceMac(device.macAddress)
    setEditDeviceRegDate(device.registrationDate)
    setEditDeviceNotes(device.notes ?? '')
    setDeviceError('')
  }

  // Save Edit Device
  const handleSaveEditDevice = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editingDevice || !deviceModalRow) return
    setSavingEditDevice(true)
    setDeviceError('')

    try {
      const res = await fetch(`/api/wifi/devices/${editingDevice._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceName: editDeviceName,
          deviceType: editDeviceType,
          macAddress: editDeviceMac,
          registrationDate: editDeviceRegDate,
          notes: editDeviceNotes,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDeviceError(data.error ?? 'Failed to update device.')
      } else {
        setEditingDevice(null)
        await loadDevicesForResident(deviceModalRow.residentId)
        await loadData()
      }
    } catch {
      setDeviceError('Network error while updating device.')
    } finally {
      setSavingEditDevice(false)
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      {/* Header */}
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
            <Wifi aria-hidden="true" className="size-3.5 text-slate-700" />
            WiFi & Device Registry
          </div>
          <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
            WiFi Management
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Maintain resident WiFi profiles, track registered devices and MAC addresses with building-wide uniqueness,
            and manage per-resident monthly WiFi charges that integrate into monthly bills.
          </p>
        </div>
      </div>

      {notice && (
        <div className="mt-5 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="size-4" /> {notice}
          </span>
          <button type="button" onClick={() => setNotice('')} className="text-emerald-700 hover:text-emerald-950">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          {error}
        </div>
      )}

      {/* 5 Summary Cards */}
      <section aria-label="WiFi summary" className="mt-7 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Residents Using WiFi</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {summary.totalResidentsUsingWiFi}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Active resident connections</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Registered Devices</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {summary.totalRegisteredDevices}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {summary.activeRegisteredDevices} currently active
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Active WiFi Connections</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-emerald-700">
            {summary.activeWiFiConnections}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Active network profiles</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Monthly WiFi Charges</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {formatCurrency(summary.totalMonthlyWiFiCharges)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Monthly recurring total</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Outstanding WiFi Amount</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-rose-600">
            {formatCurrency(summary.outstandingWiFiAmount)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Unpaid across billing history</p>
        </article>
      </section>

      {/* Search and Filters */}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <Search aria-hidden="true" className="absolute left-3 top-2.5 size-4 text-slate-400" />
          <input
            aria-label="Search WiFi records"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by resident name, room number, SSID, or MAC address..."
            className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400"
          />
        </label>
        <select
          aria-label="Filter by floor"
          value={floorFilter}
          onChange={(e) => setFloorFilter(e.target.value)}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="0">All floors</option>
          {[1, 2, 3, 4, 5].map((f) => (
            <option key={f} value={f}>
              Floor {f}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* WiFi Table */}
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3.5">Room</th>
                <th className="px-4 py-3.5">Resident</th>
                <th className="px-4 py-3.5">Floor</th>
                <th className="px-4 py-3.5">WiFi Name</th>
                <th className="px-4 py-3.5">Devices</th>
                <th className="px-4 py-3.5">Monthly Charge</th>
                <th className="px-4 py-3.5">Outstanding</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <tr key={row.residentId} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3.5 font-medium text-slate-900">
                    Room {formatRoomNumber(row.roomNumber)}
                    {row.residentStatus === 'inactive' && (
                      <p className="text-[11px] font-normal text-slate-400">Vacated</p>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/residents/${row.residentId}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {row.residentName}
                    </Link>
                    <p className="text-xs text-slate-400">{row.residentPhone}</p>
                  </td>
                  <td className="px-4 py-3.5 text-slate-700">Floor {row.floor}</td>
                  <td className="px-4 py-3.5 font-medium text-slate-800">
                    {row.wifiName === 'Not configured' ? (
                      <span className="text-slate-400">Not configured</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Wifi className="size-3.5 text-indigo-600" />
                        {row.wifiName}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-slate-700">
                    <span className="font-semibold text-slate-900">{row.activeDeviceCount}</span> active
                    <span className="text-xs text-slate-400"> ({row.totalDeviceCount} registered)</span>
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-slate-900">
                    {formatCurrency(row.monthlyCharge)}
                  </td>
                  <td className="px-4 py-3.5 text-slate-700">
                    {row.outstandingWiFi > 0 ? (
                      <span className="font-medium text-rose-600">{formatCurrency(row.outstandingWiFi)}</span>
                    ) : (
                      <span className="text-slate-400">{formatCurrency(0)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${row.status === 'active'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                        }`}
                    >
                      {row.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="xs" variant="outline" onClick={() => openConfigModal(row)}>
                        <Pencil className="size-3" /> Profile
                      </Button>
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={() => openDeviceModal(row)}
                        disabled={!row.hasConfiguration && row.residentStatus === 'inactive'}
                      >
                        <Cpu className="size-3" /> Devices ({row.activeDeviceCount})
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-14 text-center text-sm text-slate-500">
                    No WiFi records match your criteria.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={9} className="px-5 py-14 text-center text-sm text-slate-400">
                    Loading WiFi management records...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Configure WiFi Modal */}
      {configModalRow && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wifi-config-title"
            className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-7"
          >
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  WiFi Configuration
                </p>
                <h3 id="wifi-config-title" className="mt-1 text-xl font-semibold text-slate-950">
                  {configModalRow.residentName} · Room {formatRoomNumber(configModalRow.roomNumber)}
                </h3>
                <p className="text-xs text-slate-500">Floor {configModalRow.floor}</p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setConfigModalRow(null)}>
                <X />
              </Button>
            </div>

            <form onSubmit={handleSaveConfig} className="mt-5 space-y-4">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                WiFi Name / SSID *
                <input
                  required
                  type="text"
                  placeholder="e.g. Room-01-WiFi"
                  value={configForm.wifiName}
                  onChange={(e) => setConfigForm((c) => ({ ...c, wifiName: e.target.value }))}
                  className="h-9 rounded-md border border-slate-200 px-3 text-sm font-normal"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                Monthly WiFi Charge (BDT) *
                <input
                  required
                  min="0"
                  step="0.01"
                  type="number"
                  value={configForm.monthlyCharge}
                  onChange={(e) => setConfigForm((c) => ({ ...c, monthlyCharge: e.target.value }))}
                  className="h-9 rounded-md border border-slate-200 px-3 text-sm font-normal"
                />
                <span className="text-[11px] font-normal text-slate-400">
                  Used for upcoming monthly bills. Historical bills remain unchanged.
                </span>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                  Connection Start Date *
                  <input
                    required
                    type="date"
                    value={configForm.startDate}
                    onChange={(e) => setConfigForm((c) => ({ ...c, startDate: e.target.value }))}
                    className="h-9 rounded-md border border-slate-200 px-3 text-sm font-normal"
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                  Status *
                  <select
                    value={configForm.status}
                    onChange={(e) =>
                      setConfigForm((c) => ({ ...c, status: e.target.value as 'active' | 'inactive' }))
                    }
                    className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                Notes (optional)
                <input
                  type="text"
                  placeholder="Plan details, credentials, or remarks"
                  value={configForm.notes}
                  onChange={(e) => setConfigForm((c) => ({ ...c, notes: e.target.value }))}
                  className="h-9 rounded-md border border-slate-200 px-3 text-sm font-normal"
                />
              </label>

              {configError && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{configError}</p>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <Button type="button" variant="outline" onClick={() => setConfigModalRow(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={savingConfig}>
                  {savingConfig ? 'Saving...' : 'Save WiFi Profile'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Device Management Modal */}
      {deviceModalRow && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="device-management-title"
            className="my-8 max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl sm:p-7"
          >
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Device Registry · Room {formatRoomNumber(deviceModalRow.roomNumber)}
                </p>
                <h3 id="device-management-title" className="mt-1 text-xl font-semibold text-slate-950">
                  {deviceModalRow.residentName} · {deviceModalRow.wifiName}
                </h3>
                <p className="text-xs text-slate-500">
                  {deviceList.filter((d) => d.status === 'active').length} active registered device(s)
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setDeviceModalRow(null)}>
                <X />
              </Button>
            </div>

            {deviceError && (
              <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{deviceError}</div>
            )}

            {/* Device List Table */}
            <div className="mt-5">
              <h4 className="text-sm font-semibold text-slate-900">Registered Devices</h4>
              <div className="mt-2.5 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-2.5">Device</th>
                      <th className="px-3 py-2.5">Type</th>
                      <th className="px-3 py-2.5">MAC Address</th>
                      <th className="px-3 py-2.5">Registered</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deviceList.map((dev) => (
                      <tr key={dev._id} className={dev.status === 'inactive' ? 'bg-slate-50/60 opacity-60' : ''}>
                        <td className="px-3 py-2.5 font-medium text-slate-800">
                          {dev.deviceName}
                          {dev.notes && <p className="text-[10px] text-slate-400">{dev.notes}</p>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1 text-slate-700">
                            {getDeviceIcon(dev.deviceType)} {dev.deviceType}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-900">{dev.macAddress}</td>
                        <td className="px-3 py-2.5 text-slate-600">{dev.registrationDate}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${dev.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                              }`}
                          >
                            {dev.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="xs" variant="ghost" onClick={() => startEditDevice(dev)}>
                              <Pencil className="size-3" /> Edit
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => handleToggleDeviceStatus(dev)}
                              title={dev.status === 'active' ? 'Deactivate device' : 'Reactivate device'}
                            >
                              <Power className="size-3" />
                              {dev.status === 'active' ? 'Deactivate' : 'Reactivate'}
                            </Button>
                            <Button size="xs" variant="ghost" onClick={() => setHistoryDevice(dev)}>
                              <History className="size-3" /> History
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {deviceList.length === 0 && !loadingDevices && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">
                          No devices registered for this resident yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Edit Device Inline Form */}
            {editingDevice && (
              <form
                onSubmit={handleSaveEditDevice}
                className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4"
              >
                <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                  <span className="text-xs font-semibold text-indigo-950">Edit Device: {editingDevice.deviceName}</span>
                  <button
                    type="button"
                    onClick={() => setEditingDevice(null)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                    Device Name *
                    <input
                      required
                      type="text"
                      value={editDeviceName}
                      onChange={(e) => setEditDeviceName(e.target.value)}
                      className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                    Device Type *
                    <select
                      value={editDeviceType}
                      onChange={(e) => setEditDeviceType(e.target.value as WiFiDeviceType)}
                      className="h-8 rounded border border-slate-200 bg-white px-2 text-xs"
                    >
                      {WIFI_DEVICE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                    MAC Address *
                    <input
                      required
                      type="text"
                      value={editDeviceMac}
                      onChange={(e) => setEditDeviceMac(e.target.value)}
                      className="h-8 rounded border border-slate-200 bg-white px-2.5 font-mono text-xs"
                    />
                  </label>
                  <div className="flex items-end">
                    <Button type="submit" size="xs" disabled={savingEditDevice}>
                      {savingEditDevice ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              </form>
            )}

            {/* Add Device Section */}
            {!editingDevice && (
              <form onSubmit={handleAddDevice} className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Register New Device
                </h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                    Device Name *
                    <input
                      required
                      type="text"
                      placeholder="e.g. iPhone 15, Dell XPS"
                      value={newDeviceName}
                      onChange={(e) => setNewDeviceName(e.target.value)}
                      className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                    Device Type *
                    <select
                      value={newDeviceType}
                      onChange={(e) => setNewDeviceType(e.target.value as WiFiDeviceType)}
                      className="h-8 rounded border border-slate-200 bg-white px-2 text-xs"
                    >
                      {WIFI_DEVICE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                    MAC Address *
                    <input
                      required
                      type="text"
                      placeholder="AA:BB:CC:11:22:33"
                      value={newDeviceMac}
                      onChange={(e) => setNewDeviceMac(e.target.value)}
                      className="h-8 rounded border border-slate-200 bg-white px-2.5 font-mono text-xs"
                    />
                  </label>
                </div>

                <div className="mt-2.5 grid gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                    Registration Date *
                    <input
                      required
                      type="date"
                      value={newDeviceRegDate}
                      onChange={(e) => setNewDeviceRegDate(e.target.value)}
                      className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-700 sm:col-span-2">
                    Notes (optional)
                    <input
                      type="text"
                      placeholder="e.g. Work laptop, 5GHz only"
                      value={newDeviceNotes}
                      onChange={(e) => setNewDeviceNotes(e.target.value)}
                      className="h-8 rounded border border-slate-200 bg-white px-2.5 text-xs"
                    />
                  </label>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-200/80 pt-3">
                  <span className="text-[11px] text-slate-500">
                    MAC format is normalized automatically. Must be unique across active devices in the building.
                  </span>
                  <Button type="submit" size="xs" disabled={savingNewDevice}>
                    <Plus className="size-3" />
                    {savingNewDevice ? 'Registering...' : 'Register Device'}
                  </Button>
                </div>
              </form>
            )}

            {/* Device History Modal */}
            {historyDevice && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-semibold text-slate-900">
                    Device History: {historyDevice.deviceName} ({historyDevice.macAddress})
                  </span>
                  <button
                    type="button"
                    onClick={() => setHistoryDevice(null)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Close
                  </button>
                </div>
                <ul className="mt-2.5 space-y-2 text-xs">
                  {historyDevice.history && historyDevice.history.length > 0 ? (
                    historyDevice.history.map((h, i) => (
                      <li key={i} className="flex items-start justify-between gap-4 border-b border-slate-50 pb-1.5">
                        <span className="font-medium text-slate-800">{h.details}</span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(h.timestamp).toLocaleString()}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="text-slate-400">No additional history logs recorded.</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
