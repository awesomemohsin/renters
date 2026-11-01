'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Cpu,
  Eye,
  Laptop,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Smartphone,
  Tv,
  UserRound,
  Wifi,
  X,
} from 'lucide-react'
import { RentersShell } from '@/components/renters-shell'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatRoomNumber } from '@/lib/utils'
import { WIFI_DEVICE_TYPES, type WiFiDeviceType } from '@/models/wifi-device'

type Resident = {
  _id: string
  fullName: string
  spouseName?: string
  fatherName?: string
  motherName?: string
  phone: string
  alternativePhone?: string
  nidNumber?: string
  dateOfBirth?: string
  permanentAddress?: string
  presentAddress?: string
  occupation?: string
  emergencyContact?: string
  monthlyRent: number
  wifiCharge?: number
  advanceBalance?: number
  securityDeposit?: number | null
  moveInDate: string
  moveOutDate?: string | null
  status: 'active' | 'inactive'
  roomId?: { _id: string; roomNumber: number; floor: number } | null
}

type PaymentAllocationDetail = {
  targetBillId: string
  billingMonth: string
  category: 'rent' | 'electricity' | 'wifi' | 'otherCharges' | 'previousDue' | 'advance'
  amount: number
}

type PaymentRecord = {
  _id: string
  billId: string
  billingMonth: string
  paymentDate: string
  amountReceived: number
  paymentMethod: string
  transactionReference?: string
  notes?: string
  rentAllocation: number
  electricityAllocation: number
  wifiAllocation: number
  otherAllocation: number
  previousDueAllocation: number
  advanceAllocation: number
  allocationDetails?: PaymentAllocationDetail[]
  status: 'completed' | 'reversed'
  reversedAt?: string | null
  reversalReason?: string
  createdAt?: string
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
  activeDeviceCount?: number
  totalDeviceCount?: number
}

type WiFiDetails = {
  activeConfiguration: WiFiConfigurationItem | null
  configurations: WiFiConfigurationItem[]
  devices: WiFiDeviceItem[]
  activeDeviceCount: number
  totalDeviceCount: number
  monthlyCharge: number
  outstandingWiFiAmount: number
}

type EditForm = {
  fullName: string
  spouseName: string
  fatherName: string
  motherName: string
  phone: string
  alternativePhone: string
  nidNumber: string
  dateOfBirth: string
  occupation: string
  permanentAddress: string
  presentAddress: string
  emergencyContact: string
  moveInDate: string
  monthlyRent: string
  wifiCharge: string
  securityDeposit: string
}

const editFields: [keyof EditForm, string][] = [
  ['fullName', 'Full name *'],
  ['spouseName', 'Spouse name'],
  ['fatherName', "Father's name"],
  ['motherName', "Mother's name"],
  ['phone', 'Phone number *'],
  ['alternativePhone', 'Alternative phone'],
  ['nidNumber', 'NID number'],
  ['dateOfBirth', 'Date of birth'],
  ['occupation', 'Occupation'],
  ['permanentAddress', 'Permanent address'],
  ['presentAddress', 'Present address'],
  ['emergencyContact', 'Emergency contact'],
  ['moveInDate', 'Move-in date *'],
]

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

function toEditForm(resident: Resident): EditForm {
  return {
    fullName: resident.fullName ?? '',
    spouseName: resident.spouseName ?? '',
    fatherName: resident.fatherName ?? '',
    motherName: resident.motherName ?? '',
    phone: resident.phone ?? '',
    alternativePhone: resident.alternativePhone ?? '',
    nidNumber: resident.nidNumber ?? '',
    dateOfBirth: resident.dateOfBirth ?? '',
    occupation: resident.occupation ?? '',
    permanentAddress: resident.permanentAddress ?? '',
    presentAddress: resident.presentAddress ?? '',
    emergencyContact: resident.emergencyContact ?? '',
    moveInDate: resident.moveInDate ?? '',
    monthlyRent: String(resident.monthlyRent ?? ''),
    wifiCharge: String(resident.wifiCharge ?? 0),
    securityDeposit: resident.securityDeposit != null ? String(resident.securityDeposit) : '',
  }
}

export default function ResidentProfile({ params }: { params: Promise<{ id: string }> }) {
  const [residentId, setResidentId] = useState<string>('')
  const [resident, setResident] = useState<Resident | null>(null)
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [wifiData, setWifiData] = useState<WiFiDetails | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Detailed payment view & controlled reversal state
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null)
  const [reversingId, setReversingId] = useState<string | null>(null)
  const [reversalReason, setReversalReason] = useState('')
  const [paymentActionError, setPaymentActionError] = useState('')
  const [paymentActionBusy, setPaymentActionBusy] = useState(false)

  // WiFi Configuration Modal State
  const [wifiModalOpen, setWifiModalOpen] = useState(false)
  const [wifiForm, setWifiForm] = useState({
    wifiName: '',
    monthlyCharge: '0',
    startDate: '',
    status: 'active' as 'active' | 'inactive',
    notes: '',
  })
  const [savingWiFi, setSavingWiFi] = useState(false)
  const [wifiError, setWifiError] = useState('')

  // Add Device Modal State
  const [addDeviceOpen, setAddDeviceOpen] = useState(false)
  const [newDevName, setNewDevName] = useState('')
  const [newDevType, setNewDevType] = useState<WiFiDeviceType>('Mobile')
  const [newDevMac, setNewDevMac] = useState('')
  const [newDevRegDate, setNewDevRegDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [newDevNotes, setNewDevNotes] = useState('')
  const [savingNewDev, setSavingNewDev] = useState(false)
  const [deviceModalError, setDeviceModalError] = useState('')

  // Edit Device Modal State
  const [editingDevice, setEditingDevice] = useState<WiFiDeviceItem | null>(null)
  const [editDevName, setEditDevName] = useState('')
  const [editDevType, setEditDevType] = useState<WiFiDeviceType>('Mobile')
  const [editDevMac, setEditDevMac] = useState('')
  const [editDevRegDate, setEditDevRegDate] = useState('')
  const [editDevNotes, setEditDevNotes] = useState('')
  const [savingEditDev, setSavingEditDev] = useState(false)

  const loadProfile = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/residents/${id}`)
      const d = await r.json()
      if (d.resident) {
        setResident(d.resident)
        setPayments(d.payments ?? [])
        setWifiData(d.wifi ?? null)
      } else {
        setError(d.error ?? 'Unable to load resident.')
      }
    } catch {
      setError('Unable to load resident.')
    }
  }, [])

  useEffect(() => {
    params.then(({ id }) => {
      setResidentId(id)
      loadProfile(id)
    })
  }, [params, loadProfile])

  const openEdit = () => {
    if (!resident) return
    setEditForm(toEditForm(resident))
    setEditError('')
    setEditOpen(true)
  }

  const updateField = (key: keyof EditForm, value: string) => {
    setEditForm((current) => (current ? { ...current, [key]: value } : current))
  }

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!resident || !editForm) return
    setSavingEdit(true)
    setEditError('')

    const response = await fetch(`/api/residents/${resident._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editForm,
        monthlyRent: Number(editForm.monthlyRent),
        wifiCharge: editForm.wifiCharge === '' ? 0 : Number(editForm.wifiCharge),
        securityDeposit: editForm.securityDeposit === '' ? null : Number(editForm.securityDeposit),
      }),
    })
    const data = await response.json()
    if (!response.ok) {
      setEditError(data.error ?? 'Unable to update resident.')
    } else {
      setResident(data.resident)
      setEditOpen(false)
      if (residentId) await loadProfile(residentId)
    }
    setSavingEdit(false)
  }

  const vacate = async () => {
    if (!resident || !window.confirm(`Vacate ${resident.fullName}? This will preserve the historical record and deactivate active WiFi configurations.`)) return
    setBusy(true)
    setError('')
    const r = await fetch(`/api/residents/${resident._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'vacate' }),
    })
    const d = await r.json()
    if (r.ok) {
      setResident(d.resident)
      if (residentId) await loadProfile(residentId)
    } else {
      setError(d.error ?? 'Unable to vacate resident.')
    }
    setBusy(false)
  }

  const handleReversePayment = async (paymentId: string) => {
    if (!reversalReason.trim()) {
      setPaymentActionError('Please provide a reason for reversing the payment.')
      return
    }
    setPaymentActionBusy(true)
    setPaymentActionError('')
    try {
      const response = await fetch('/api/monthly-bills/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reverse',
          paymentId,
          reason: reversalReason.trim(),
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setPaymentActionError(data.error ?? 'Unable to reverse payment.')
      } else {
        setReversingId(null)
        setReversalReason('')
        if (residentId) {
          await loadProfile(residentId)
        }
        if (selectedPayment?._id === paymentId) {
          setSelectedPayment(data.payment)
        }
      }
    } catch {
      setPaymentActionError('Network error while reversing payment.')
    } finally {
      setPaymentActionBusy(false)
    }
  }

  // WiFi Configuration Handlers
  const openWiFiModal = () => {
    if (!resident) return
    const activeCfg = wifiData?.activeConfiguration
    setWifiForm({
      wifiName: activeCfg?.wifiName || (resident.roomId ? `Room-${formatRoomNumber(resident.roomId.roomNumber)}-WiFi` : 'Resident-WiFi'),
      monthlyCharge: String(activeCfg?.monthlyCharge ?? resident.wifiCharge ?? 500),
      startDate: activeCfg?.startDate || new Date().toISOString().slice(0, 10),
      status: activeCfg?.status || 'active',
      notes: activeCfg?.notes || '',
    })
    setWifiError('')
    setWifiModalOpen(true)
  }

  const saveWiFiConfig = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!resident) return
    setSavingWiFi(true)
    setWifiError('')

    try {
      const response = await fetch('/api/wifi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId: resident._id,
          wifiName: wifiForm.wifiName,
          monthlyCharge: Number(wifiForm.monthlyCharge),
          startDate: wifiForm.startDate,
          status: wifiForm.status,
          notes: wifiForm.notes,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setWifiError(data.error ?? 'Failed to save WiFi profile.')
      } else {
        setWifiModalOpen(false)
        if (residentId) await loadProfile(residentId)
      }
    } catch {
      setWifiError('Network error while saving WiFi profile.')
    } finally {
      setSavingWiFi(false)
    }
  }

  // Device Handlers
  const openAddDeviceModal = () => {
    setNewDevName('')
    setNewDevType('Mobile')
    setNewDevMac('')
    setNewDevRegDate(new Date().toISOString().slice(0, 10))
    setNewDevNotes('')
    setDeviceModalError('')
    setAddDeviceOpen(true)
  }

  const saveNewDevice = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!resident) return
    setSavingNewDev(true)
    setDeviceModalError('')

    try {
      const response = await fetch('/api/wifi/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId: resident._id,
          deviceName: newDevName,
          deviceType: newDevType,
          macAddress: newDevMac,
          registrationDate: newDevRegDate,
          status: 'active',
          notes: newDevNotes,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setDeviceModalError(data.error ?? 'Failed to register device.')
      } else {
        setAddDeviceOpen(false)
        if (residentId) await loadProfile(residentId)
      }
    } catch {
      setDeviceModalError('Network error while registering device.')
    } finally {
      setSavingNewDev(false)
    }
  }

  const startEditDevice = (dev: WiFiDeviceItem) => {
    setEditingDevice(dev)
    setEditDevName(dev.deviceName)
    setEditDevType(dev.deviceType)
    setEditDevMac(dev.macAddress)
    setEditDevRegDate(dev.registrationDate)
    setEditDevNotes(dev.notes ?? '')
    setDeviceModalError('')
  }

  const saveEditDevice = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editingDevice) return
    setSavingEditDev(true)
    setDeviceModalError('')

    try {
      const response = await fetch(`/api/wifi/devices/${editingDevice._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceName: editDevName,
          deviceType: editDevType,
          macAddress: editDevMac,
          registrationDate: editDevRegDate,
          notes: editDevNotes,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setDeviceModalError(data.error ?? 'Failed to update device.')
      } else {
        setEditingDevice(null)
        if (residentId) await loadProfile(residentId)
      }
    } catch {
      setDeviceModalError('Network error while updating device.')
    } finally {
      setSavingEditDev(false)
    }
  }

  const toggleDeviceStatus = async (dev: WiFiDeviceItem) => {
    const nextStatus = dev.status === 'active' ? 'deactivate' : 'reactivate'
    try {
      const response = await fetch(`/api/wifi/devices/${dev._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: nextStatus }),
      })
      if (response.ok && residentId) {
        await loadProfile(residentId)
      }
    } catch {
      // ignore
    }
  }

  if (error && !resident) {
    return (
      <RentersShell currentPath="/residents" title="Resident profile">
        <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
          <Link href="/residents" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
            <ArrowLeft className="size-4" /> Back to residents
          </Link>
          <p className="mt-6 text-red-600">{error}</p>
        </main>
      </RentersShell>
    )
  }

  if (!resident) {
    return (
      <RentersShell currentPath="/residents" title="Resident profile">
        <main className="mx-auto max-w-5xl px-5 py-10 text-slate-500 sm:px-8">Loading resident profile...</main>
      </RentersShell>
    )
  }

  const fields: [string, string | undefined][] = [
    ['Spouse name', resident.spouseName],
    ["Father's name", resident.fatherName],
    ["Mother's name", resident.motherName],
    ['Phone', resident.phone],
    ['Alternative phone', resident.alternativePhone],
    ['NID number', resident.nidNumber],
    ['Date of birth', resident.dateOfBirth],
    ['Occupation', resident.occupation],
    ['Emergency contact', resident.emergencyContact],
    ['Present address', resident.presentAddress],
    ['Permanent address', resident.permanentAddress],
  ]

  const activeWiFi = wifiData?.activeConfiguration
  const registeredDevices = wifiData?.devices ?? []

  return (
    <RentersShell currentPath="/residents" title="Resident profile">
      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
        <Link href="/residents" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="size-4" /> Back to residents
        </Link>

        <div className="mt-7 flex flex-col justify-between gap-5 border-b border-slate-200 pb-7 md:flex-row md:items-end">
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <UserRound className="size-7" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Resident profile</p>
              <h1 className="text-3xl font-semibold tracking-tight">{resident.fullName}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {resident.status === 'active' ? 'Active resident' : 'Historical resident record'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={openEdit}>
              <Pencil data-icon="inline-start" /> Edit profile
            </Button>
            {resident.status === 'active' && (
              <Button variant="outline" onClick={vacate} disabled={busy}>
                {busy ? 'Vacating...' : 'Vacate room'}
              </Button>
            )}
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold">Personal details</h2>
            <div className="mt-6 grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {fields.map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="mt-1 text-sm text-slate-800">{value || 'Not provided'}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold">Rental details</h2>
            <dl className="mt-6 flex flex-col gap-5 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">
                  {resident.status === 'active' ? 'Assigned room' : 'Previous room'}
                </dt>
                <dd className="mt-1 text-slate-800">
                  {resident.roomId
                    ? `Room ${formatRoomNumber(resident.roomId.roomNumber)}${resident.status === 'inactive' ? ' (Vacated)' : ''
                    }`
                    : 'Vacated'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Floor</dt>
                <dd className="mt-1 text-slate-800">{resident.roomId ? `Floor ${resident.roomId.floor}` : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Monthly rent</dt>
                <dd className="mt-1 text-slate-800">{formatCurrency(resident.monthlyRent)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Monthly WiFi charge</dt>
                <dd className="mt-1 text-slate-800">
                  {formatCurrency(wifiData?.monthlyCharge ?? resident.wifiCharge ?? 0)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Advance credit balance</dt>
                <dd className="mt-1 font-medium text-emerald-700">{formatCurrency(resident.advanceBalance ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Move-in date</dt>
                <dd className="mt-1 text-slate-800">{resident.moveInDate}</dd>
              </div>
              {(resident.status === 'inactive' || resident.moveOutDate) && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Move-out date</dt>
                  <dd className="mt-1 text-slate-800">{resident.moveOutDate || 'Not recorded'}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Security deposit</dt>
                <dd className="mt-1 text-slate-800">{formatCurrency(resident.securityDeposit)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Current status</dt>
                <dd className={`mt-1 font-medium ${resident.status === 'active' ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {resident.status === 'active' ? 'Active' : 'Inactive'}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        {/* Section 6: Resident WiFi & Device Registry Section */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-950">WiFi & Device Registry</h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${activeWiFi && activeWiFi.status === 'active'
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                >
                  {activeWiFi && activeWiFi.status === 'active' ? 'Active Connection' : 'Inactive / Unconfigured'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Connected to {resident.roomId ? `Room ${formatRoomNumber(resident.roomId.roomNumber)}, Floor ${resident.roomId.floor}` : 'Unassigned room'}.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="xs" variant="outline" onClick={openWiFiModal}>
                <Pencil className="size-3" /> Manage WiFi / Charge
              </Button>
              {resident.status === 'active' && (
                <Button size="xs" onClick={openAddDeviceModal}>
                  <Plus className="size-3" /> Add Device
                </Button>
              )}
              <Link href="/wifi" className="text-xs font-medium text-slate-500 hover:text-slate-900">
                WiFi Desk →
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-xs text-slate-500">WiFi Name / SSID</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {activeWiFi?.wifiName || 'Not configured'}
              </p>
              <p className="text-[11px] text-slate-400">
                Started: {activeWiFi?.startDate || '—'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-xs text-slate-500">Monthly WiFi Charge</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {formatCurrency(wifiData?.monthlyCharge ?? resident.wifiCharge ?? 0)}
              </p>
              <p className="text-[11px] text-slate-400">Included in monthly bill</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-xs text-slate-500">Active Registered Devices</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {wifiData?.activeDeviceCount ?? 0}
                <span className="text-xs font-normal text-slate-500"> / {wifiData?.totalDeviceCount ?? 0} total</span>
              </p>
              <p className="text-[11px] text-slate-400">MAC-enforced unique</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-xs text-slate-500">Outstanding WiFi Due</p>
              <p className="mt-1 text-sm font-semibold text-rose-600">
                {formatCurrency(wifiData?.outstandingWiFiAmount ?? 0)}
              </p>
              <p className="text-[11px] text-slate-400">Carried forward</p>
            </div>
          </div>

          {/* Registered Devices List */}
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Registered Devices & MAC Addresses ({registeredDevices.length})
            </h3>
            <div className="mt-2.5 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5">Device Name</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">MAC Address</th>
                    <th className="px-3 py-2.5">Registration Date</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {registeredDevices.map((dev) => (
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
                            onClick={() => toggleDeviceStatus(dev)}
                            title={dev.status === 'active' ? 'Deactivate device' : 'Reactivate device'}
                          >
                            <Power className="size-3" />
                            {dev.status === 'active' ? 'Deactivate' : 'Reactivate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {registeredDevices.length === 0 && (
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
        </section>

        {/* Payment History Section (Command 06 Section 8) */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-slate-950">Payment History</h2>
              <p className="mt-1 text-xs text-slate-500">
                Permanent record of all payments and manual allocations for {resident.fullName}. Payment records are
                never deleted; reversals preserve the full audit trail.
              </p>
            </div>
            <Link href="/monthly-records" className="text-xs font-medium text-slate-600 underline hover:text-slate-950">
              Open Monthly Billing Workspace →
            </Link>
          </div>

          {paymentActionError && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{paymentActionError}</p>
          )}

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-3">Payment Date</th>
                  <th className="px-3 py-3">Billing Month</th>
                  <th className="px-3 py-3">Amount Received</th>
                  <th className="px-3 py-3">Rent Alloc.</th>
                  <th className="px-3 py-3">Electricity Alloc.</th>
                  <th className="px-3 py-3">WiFi Alloc.</th>
                  <th className="px-3 py-3">Other Allocations</th>
                  <th className="px-3 py-3">Payment Method</th>
                  <th className="px-3 py-3">Transaction Ref.</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((pmt) => {
                  const otherTotal =
                    Math.round(
                      ((pmt.otherAllocation || 0) +
                        (pmt.previousDueAllocation || 0) +
                        (pmt.advanceAllocation || 0) +
                        Number.EPSILON) *
                      100,
                    ) / 100
                  return (
                    <tr key={pmt._id} className={pmt.status === 'reversed' ? 'bg-slate-50/60 opacity-60' : ''}>
                      <td className="px-3 py-3 font-medium text-slate-800">{pmt.paymentDate}</td>
                      <td className="px-3 py-3 text-slate-700">{pmt.billingMonth}</td>
                      <td className="px-3 py-3 font-semibold text-slate-950">{formatCurrency(pmt.amountReceived)}</td>
                      <td className="px-3 py-3 text-slate-700">{formatCurrency(pmt.rentAllocation)}</td>
                      <td className="px-3 py-3 text-slate-700">{formatCurrency(pmt.electricityAllocation)}</td>
                      <td className="px-3 py-3 text-slate-700">{formatCurrency(pmt.wifiAllocation)}</td>
                      <td className="px-3 py-3 text-slate-700">
                        {formatCurrency(otherTotal)}
                        {(pmt.previousDueAllocation > 0 || pmt.advanceAllocation > 0) && (
                          <p className="text-[10px] text-slate-400">
                            {pmt.otherAllocation > 0 ? `Other ${formatCurrency(pmt.otherAllocation)} ` : ''}
                            {pmt.previousDueAllocation > 0 ? `Prev ${formatCurrency(pmt.previousDueAllocation)} ` : ''}
                            {pmt.advanceAllocation > 0 ? `Adv ${formatCurrency(pmt.advanceAllocation)}` : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{pmt.paymentMethod}</td>
                      <td className="px-3 py-3 text-slate-600">{pmt.transactionReference || '—'}</td>
                      <td className="px-3 py-3">
                        {pmt.status === 'reversed' ? (
                          <span className="font-medium text-rose-600" title={pmt.reversalReason}>
                            Reversed
                          </span>
                        ) : (
                          <span className="font-medium text-emerald-700">Completed</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button size="xs" variant="outline" onClick={() => setSelectedPayment(pmt)}>
                            <Eye className="size-3" /> Details
                          </Button>
                          {pmt.status === 'completed' && (
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                setReversingId(pmt._id)
                                setReversalReason('')
                                setPaymentActionError('')
                              }}
                            >
                              <RotateCcw className="size-3" /> Reverse
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-xs text-slate-400">
                      No payment records found for this resident yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {reversingId && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs">
              <span className="font-semibold text-rose-800">
                Controlled Payment Reversal (preserves record & restores due):
              </span>
              <input
                type="text"
                placeholder="Enter reason for reversal *"
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                className="h-8 flex-1 rounded border border-rose-300 bg-white px-2.5 text-xs"
              />
              <Button
                size="xs"
                variant="destructive"
                disabled={paymentActionBusy}
                onClick={() => handleReversePayment(reversingId)}
              >
                {paymentActionBusy ? 'Reversing...' : 'Confirm Reversal'}
              </Button>
              <Button size="xs" variant="outline" onClick={() => setReversingId(null)}>
                Cancel
              </Button>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
          <h2 className="font-semibold">Documents</h2>
          <p className="mt-2 text-sm text-slate-500">
            Document uploads are unavailable until a storage provider is configured. No files are stored in MongoDB.
          </p>
        </section>

        {/* Detailed Payment Modal */}
        {selectedPayment && (
          <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/30 p-4 sm:items-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="payment-detail-title"
              className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            >
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Payment Receipt Details</p>
                  <h3 id="payment-detail-title" className="mt-1 text-lg font-semibold text-slate-950">
                    {formatCurrency(selectedPayment.amountReceived)} · {selectedPayment.paymentDate}
                  </h3>
                </div>
                <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setSelectedPayment(null)}>
                  <X />
                </Button>
              </div>
              <dl className="mt-4 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Billing Month</dt>
                  <dd className="font-medium text-slate-900">{selectedPayment.billingMonth}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Payment Method</dt>
                  <dd className="font-medium text-slate-900">{selectedPayment.paymentMethod}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Transaction Reference</dt>
                  <dd className="font-medium text-slate-900">{selectedPayment.transactionReference || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Notes</dt>
                  <dd className="font-medium text-slate-900">{selectedPayment.notes || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Status</dt>
                  <dd
                    className={`font-semibold ${selectedPayment.status === 'reversed' ? 'text-rose-600' : 'text-emerald-700'
                      }`}
                  >
                    {selectedPayment.status === 'reversed'
                      ? `Reversed (${selectedPayment.reversalReason || 'No reason'})`
                      : 'Completed'}
                  </dd>
                </div>
                <div className="border-t border-slate-100 pt-2.5">
                  <p className="font-semibold text-slate-800">Manual Category Allocations</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
                    <div>
                      Rent: <strong>{formatCurrency(selectedPayment.rentAllocation)}</strong>
                    </div>
                    <div>
                      Electricity: <strong>{formatCurrency(selectedPayment.electricityAllocation)}</strong>
                    </div>
                    <div>
                      WiFi: <strong>{formatCurrency(selectedPayment.wifiAllocation)}</strong>
                    </div>
                    <div>
                      Other Charges: <strong>{formatCurrency(selectedPayment.otherAllocation)}</strong>
                    </div>
                    <div>
                      Previous Due: <strong>{formatCurrency(selectedPayment.previousDueAllocation)}</strong>
                    </div>
                    <div>
                      Advance Credit: <strong>{formatCurrency(selectedPayment.advanceAllocation)}</strong>
                    </div>
                  </div>
                </div>
              </dl>
            </div>
          </div>
        )}

        {/* Manage WiFi Modal */}
        {wifiModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/30 p-4 sm:items-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="manage-wifi-title"
              className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-7"
            >
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    WiFi Configuration
                  </p>
                  <h3 id="manage-wifi-title" className="mt-1 text-xl font-semibold text-slate-950">
                    {resident.fullName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {resident.roomId ? `Room ${formatRoomNumber(resident.roomId.roomNumber)}, Floor ${resident.roomId.floor}` : 'Unassigned room'}
                  </p>
                </div>
                <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setWifiModalOpen(false)}>
                  <X />
                </Button>
              </div>

              <form onSubmit={saveWiFiConfig} className="mt-5 space-y-4">
                <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                  WiFi Name / SSID *
                  <input
                    required
                    type="text"
                    value={wifiForm.wifiName}
                    onChange={(e) => setWifiForm((f) => ({ ...f, wifiName: e.target.value }))}
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
                    value={wifiForm.monthlyCharge}
                    onChange={(e) => setWifiForm((f) => ({ ...f, monthlyCharge: e.target.value }))}
                    className="h-9 rounded-md border border-slate-200 px-3 text-sm font-normal"
                  />
                  <span className="text-[11px] font-normal text-slate-400">
                    Will apply to subsequent monthly bills without mutating past bills.
                  </span>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                    Start Date *
                    <input
                      required
                      type="date"
                      value={wifiForm.startDate}
                      onChange={(e) => setWifiForm((f) => ({ ...f, startDate: e.target.value }))}
                      className="h-9 rounded-md border border-slate-200 px-3 text-sm font-normal"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                    Status *
                    <select
                      value={wifiForm.status}
                      onChange={(e) =>
                        setWifiForm((f) => ({ ...f, status: e.target.value as 'active' | 'inactive' }))
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
                    value={wifiForm.notes}
                    onChange={(e) => setWifiForm((f) => ({ ...f, notes: e.target.value }))}
                    className="h-9 rounded-md border border-slate-200 px-3 text-sm font-normal"
                  />
                </label>

                {wifiError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{wifiError}</p>}

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                  <Button type="button" variant="outline" onClick={() => setWifiModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={savingWiFi}>
                    {savingWiFi ? 'Saving...' : 'Save WiFi Profile'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Device Modal */}
        {addDeviceOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/30 p-4 sm:items-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-device-title"
              className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-7"
            >
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Device Registration
                  </p>
                  <h3 id="add-device-title" className="mt-1 text-xl font-semibold text-slate-950">
                    Add Device for {resident.fullName}
                  </h3>
                </div>
                <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setAddDeviceOpen(false)}>
                  <X />
                </Button>
              </div>

              <form onSubmit={saveNewDevice} className="mt-5 space-y-4">
                <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                  Device Name *
                  <input
                    required
                    type="text"
                    placeholder="e.g. Work Laptop, Android Phone"
                    value={newDevName}
                    onChange={(e) => setNewDevName(e.target.value)}
                    className="h-9 rounded-md border border-slate-200 px-3 text-sm font-normal"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                    Device Type *
                    <select
                      value={newDevType}
                      onChange={(e) => setNewDevType(e.target.value as WiFiDeviceType)}
                      className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal"
                    >
                      {WIFI_DEVICE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                    Registration Date *
                    <input
                      required
                      type="date"
                      value={newDevRegDate}
                      onChange={(e) => setNewDevRegDate(e.target.value)}
                      className="h-9 rounded-md border border-slate-200 px-3 text-sm font-normal"
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                  MAC Address *
                  <input
                    required
                    type="text"
                    placeholder="AA:BB:CC:11:22:33"
                    value={newDevMac}
                    onChange={(e) => setNewDevMac(e.target.value)}
                    className="h-9 rounded-md border border-slate-200 px-3 font-mono text-sm font-normal"
                  />
                  <span className="text-[11px] font-normal text-slate-400">
                    Must be unique among active devices in the building.
                  </span>
                </label>

                <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                  Notes (optional)
                  <input
                    type="text"
                    placeholder="Optional remarks"
                    value={newDevNotes}
                    onChange={(e) => setNewDevNotes(e.target.value)}
                    className="h-9 rounded-md border border-slate-200 px-3 text-sm font-normal"
                  />
                </label>

                {deviceModalError && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{deviceModalError}</p>
                )}

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                  <Button type="button" variant="outline" onClick={() => setAddDeviceOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={savingNewDev}>
                    {savingNewDev ? 'Registering...' : 'Register Device'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Device Modal */}
        {editingDevice && (
          <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/30 p-4 sm:items-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-device-title"
              className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-7"
            >
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Edit Device
                  </p>
                  <h3 id="edit-device-title" className="mt-1 text-xl font-semibold text-slate-950">
                    {editingDevice.deviceName}
                  </h3>
                </div>
                <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setEditingDevice(null)}>
                  <X />
                </Button>
              </div>

              <form onSubmit={saveEditDevice} className="mt-5 space-y-4">
                <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                  Device Name *
                  <input
                    required
                    type="text"
                    value={editDevName}
                    onChange={(e) => setEditDevName(e.target.value)}
                    className="h-9 rounded-md border border-slate-200 px-3 text-sm font-normal"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                    Device Type *
                    <select
                      value={editDevType}
                      onChange={(e) => setEditDevType(e.target.value as WiFiDeviceType)}
                      className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal"
                    >
                      {WIFI_DEVICE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                    Registration Date *
                    <input
                      required
                      type="date"
                      value={editDevRegDate}
                      onChange={(e) => setEditDevRegDate(e.target.value)}
                      className="h-9 rounded-md border border-slate-200 px-3 text-sm font-normal"
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                  MAC Address *
                  <input
                    required
                    type="text"
                    value={editDevMac}
                    onChange={(e) => setEditDevMac(e.target.value)}
                    className="h-9 rounded-md border border-slate-200 px-3 font-mono text-sm font-normal"
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                  Notes
                  <input
                    type="text"
                    value={editDevNotes}
                    onChange={(e) => setEditDevNotes(e.target.value)}
                    className="h-9 rounded-md border border-slate-200 px-3 text-sm font-normal"
                  />
                </label>

                {deviceModalError && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{deviceModalError}</p>
                )}

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                  <Button type="button" variant="outline" onClick={() => setEditingDevice(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={savingEditDev}>
                    {savingEditDev ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Resident Profile Modal */}
        {editOpen && editForm && (
          <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/30 p-4 sm:items-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-resident-title"
              className="my-8 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl sm:p-8"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">Resident record</p>
                  <h3 id="edit-resident-title" className="text-2xl font-semibold">
                    Edit resident profile
                  </h3>
                </div>
                <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setEditOpen(false)}>
                  <X />
                </Button>
              </div>

              <form onSubmit={saveEdit} className="mt-6 grid gap-4 sm:grid-cols-2">
                {editFields.map(([key, label]) => (
                  <label key={key} className="flex flex-col gap-2 text-sm font-medium">
                    {label}
                    <input
                      required={key === 'fullName' || key === 'phone' || key === 'moveInDate'}
                      type={key === 'moveInDate' || key === 'dateOfBirth' ? 'date' : 'text'}
                      value={editForm[key]}
                      onChange={(e) => updateField(key, e.target.value)}
                      className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                    />
                  </label>
                ))}
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Monthly rent *
                  <input
                    required
                    min="0"
                    type="number"
                    value={editForm.monthlyRent}
                    onChange={(e) => updateField('monthlyRent', e.target.value)}
                    className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Monthly WiFi charge
                  <input
                    min="0"
                    type="number"
                    value={editForm.wifiCharge}
                    onChange={(e) => updateField('wifiCharge', e.target.value)}
                    className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Security deposit
                  <input
                    min="0"
                    type="number"
                    value={editForm.securityDeposit}
                    onChange={(e) => updateField('securityDeposit', e.target.value)}
                    className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                  />
                </label>

                {editError && <p className="sm:col-span-2 text-sm text-red-600">{editError}</p>}

                <div className="sm:col-span-2 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
                  <span className="text-xs text-slate-400">
                    {resident.roomId
                      ? `Room ${formatRoomNumber(resident.roomId.roomNumber)} · Floor ${resident.roomId.floor}`
                      : 'Unassigned room'}
                  </span>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={savingEdit}>
                      {savingEdit ? 'Saving...' : 'Save changes'}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </RentersShell>
  )
}
