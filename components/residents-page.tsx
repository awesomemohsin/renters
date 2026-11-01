'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CreditCard, Search, UserPlus, UserRound, X } from 'lucide-react'
import { CollectPaymentModal, type CollectibleBillTarget } from '@/components/collect-payment-modal'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatRoomNumber } from '@/lib/utils'

type Room = {
  _id: string
  roomNumber: number
  floor: number
  status: 'occupied' | 'vacant'
  monthlyRent: number | null
}

type ResidentBillingSummary = {
  billId: string
  billingMonth: string
  monthlyRent: number
  rentDue: number
  electricityDue: number
  wifiDue: number
  otherDue: number
  previousOutstanding: number
  previousDueRemaining: number
  totalPayable: number
  totalPaid: number
  remainingDue: number
  status: 'Paid' | 'Partially Paid' | 'Unpaid'
  isLocked: boolean
}

type Resident = {
  _id: string
  fullName: string
  phone: string
  monthlyRent: number
  wifiCharge?: number
  advanceBalance?: number
  status: 'active' | 'inactive'
  roomId?: Room | null
  nidNumber?: string
  dateOfBirth?: string
  moveInDate: string
  moveOutDate?: string | null
  securityDeposit?: number | null
  billingSummary?: ResidentBillingSummary | null
}

const empty = {
  fullName: '',
  spouseName: '',
  fatherName: '',
  motherName: '',
  phone: '',
  alternativePhone: '',
  nidNumber: '',
  dateOfBirth: '',
  permanentAddress: '',
  presentAddress: '',
  occupation: '',
  emergencyContact: '',
  roomId: '',
  monthlyRent: '',
  wifiCharge: '',
  moveInDate: '',
  securityDeposit: '',
}

const formFields: [keyof typeof empty, string][] = [
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

export function ResidentsPage() {
  const [residents, setResidents] = useState<Resident[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [summary, setSummary] = useState({ total: 0, active: 0, vacant: 0 })
  const [search, setSearch] = useState('')
  const [floor, setFloor] = useState('0')
  const [status, setStatus] = useState('all')
  const [form, setForm] = useState<typeof empty>(empty)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [collectTarget, setCollectTarget] = useState<CollectibleBillTarget | null>(null)

  const load = async () => {
    const response = await fetch(
      `/api/residents?search=${encodeURIComponent(search)}&floor=${floor}&status=${status === 'all' ? '' : status}`,
    )
    const data = await response.json()
    if (response.ok) {
      setResidents(data.residents)
      setRooms(data.rooms)
      setSummary(data.summary)
    } else {
      setError(data.error)
    }
  }

  useEffect(() => {
    load()
  }, [search, floor, status])

  const available = useMemo(() => rooms.filter((room) => room.status === 'vacant'), [rooms])
  const selectedRoom = rooms.find((room) => room._id === form.roomId)

  const update = (key: keyof typeof empty, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const selectRoom = (roomId: string) => {
    const chosenRoom = rooms.find((room) => room._id === roomId)
    setForm((current) => ({
      ...current,
      roomId,
      monthlyRent: chosenRoom?.monthlyRent != null ? String(chosenRoom.monthlyRent) : '',
    }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const response = await fetch('/api/residents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        monthlyRent: Number(form.monthlyRent),
        wifiCharge: form.wifiCharge ? Number(form.wifiCharge) : 0,
        securityDeposit: form.securityDeposit ? Number(form.securityDeposit) : null,
      }),
    })
    const data = await response.json()
    if (!response.ok) {
      setError(data.error)
    } else {
      setOpen(false)
      setForm(empty)
      load()
    }
    setSaving(false)
  }

  const openQuickCollect = (resident: Resident) => {
    const bs = resident.billingSummary
    if (!bs) return
    setCollectTarget({
      billId: bs.billId,
      billingMonth: bs.billingMonth,
      residentId: resident._id,
      residentName: resident.fullName,
      roomNumber: resident.roomId?.roomNumber ?? 0,
      floor: resident.roomId?.floor ?? 0,
      rentDue: bs.rentDue,
      electricityDue: bs.electricityDue,
      wifiDue: bs.wifiDue,
      otherDue: bs.otherDue,
      previousDueRemaining: bs.previousDueRemaining,
      totalPayable: bs.totalPayable,
      totalPaid: bs.totalPaid,
      remainingDue: bs.remainingDue,
    })
  }

  const summaryItems: [string, number, string][] = [
    ['Total residents', summary.total, 'All resident records'],
    ['Active residents', summary.active, 'Currently living here'],
    ['Vacant rooms', summary.vacant, 'Available for assignment'],
  ]

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
            <UserRound aria-hidden="true" className="size-3.5" /> Resident management
          </div>
          <h2 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">People, not paperwork.</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
            Keep resident details connected to the room they call home, view current monthly dues at a glance, and
            collect payments directly.
          </p>
        </div>
        <Button
          onClick={() => {
            setOpen(true)
            setError('')
          }}
        >
          <UserPlus data-icon="inline-start" /> Add new resident
        </Button>
      </div>

      <section aria-label="Resident summary" className="mt-9 grid gap-4 sm:grid-cols-3">
        {summaryItems.map(([label, value, detail]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-slate-400">{detail}</p>
          </article>
        ))}
      </section>

      <div className="mt-8 flex flex-col gap-3 lg:flex-row">
        <label className="relative flex-1">
          <Search aria-hidden="true" className="absolute left-3 top-2.5 size-4 text-slate-400" />
          <input
            aria-label="Search residents"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone"
            className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400"
          />
        </label>
        <select
          aria-label="Filter by floor"
          value={floor}
          onChange={(e) => setFloor(e.target.value)}
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
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {error && !open && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-4">Room</th>
                <th className="px-4 py-4">Resident name</th>
                <th className="px-4 py-4">Monthly rent</th>
                <th className="px-4 py-4">Electricity due</th>
                <th className="px-4 py-4">WiFi due</th>
                <th className="px-4 py-4">Prev. outstanding</th>
                <th className="px-4 py-4">Total payable</th>
                <th className="px-4 py-4">Total paid</th>
                <th className="px-4 py-4">Remaining due</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {residents.map((resident) => {
                const bs = resident.billingSummary
                return (
                  <tr key={resident._id} className="hover:bg-slate-50">
                    <td className="px-4 py-4 font-medium text-slate-800">
                      {resident.roomId
                        ? `Room ${formatRoomNumber(resident.roomId.roomNumber)}${
                            resident.status === 'inactive' ? ' (Vacated)' : ''
                          }`
                        : 'Vacated'}
                      <p className="mt-0.5 text-xs font-normal text-slate-400">
                        {resident.roomId ? `Floor ${resident.roomId.floor}` : '—'}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <Link href={`/residents/${resident._id}`} className="font-medium text-slate-900 hover:underline">
                        {resident.fullName}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {resident.phone}
                        {bs ? ` · Bill ${bs.billingMonth}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{formatCurrency(resident.monthlyRent)}</td>
                    <td className="px-4 py-4 text-slate-700">
                      {bs ? formatCurrency(bs.electricityDue) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {bs ? formatCurrency(bs.wifiDue) : formatCurrency(resident.wifiCharge ?? 0)}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {bs ? (
                        <span className={bs.previousOutstanding > 0 ? 'font-medium text-amber-700' : 'text-slate-500'}>
                          {formatCurrency(bs.previousOutstanding)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-900">
                      {bs ? formatCurrency(bs.totalPayable) : <span className="font-normal text-slate-400">No bill</span>}
                    </td>
                    <td className="px-4 py-4 font-medium text-emerald-700">
                      {bs ? formatCurrency(bs.totalPaid) : <span className="font-normal text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-4 font-semibold text-rose-600">
                      {bs ? formatCurrency(bs.remainingDue) : <span className="font-normal text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-4">
                      <span className={resident.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}>
                        {resident.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {bs && !bs.isLocked && (
                          <Button size="xs" onClick={() => openQuickCollect(resident)}>
                            <CreditCard className="size-3" /> Collect
                          </Button>
                        )}
                        <Link
                          href={`/residents/${resident._id}`}
                          className="text-xs font-medium text-slate-500 hover:text-slate-900"
                        >
                          Profile
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {residents.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-5 py-14 text-center text-sm text-slate-500">
                    No residents found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/30 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-resident-title"
            className="my-8 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl sm:p-8"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">Resident record</p>
                <h3 id="add-resident-title" className="text-2xl font-semibold">
                  Add new resident
                </h3>
              </div>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setOpen(false)}>
                <X />
              </Button>
            </div>
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              Document uploads are unavailable until a storage provider is configured. You can add the resident details now.
            </p>
            <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
              {formFields.map(([key, label]) => (
                <label key={key} className="flex flex-col gap-2 text-sm font-medium">
                  {label}
                  <input
                    required={key === 'fullName' || key === 'phone' || key === 'moveInDate'}
                    type={key === 'moveInDate' || key === 'dateOfBirth' ? 'date' : 'text'}
                    value={form[key]}
                    onChange={(e) => update(key, e.target.value)}
                    className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                  />
                </label>
              ))}
              <label className="flex flex-col gap-2 text-sm font-medium">
                Room number *
                <select
                  required
                  value={form.roomId}
                  onChange={(e) => selectRoom(e.target.value)}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 font-normal"
                >
                  <option value="">Select vacant room</option>
                  {available.map((room) => (
                    <option key={room._id} value={room._id}>
                      Room {formatRoomNumber(room.roomNumber)} · Floor {room.floor}
                      {room.monthlyRent != null ? ` (${formatCurrency(room.monthlyRent)})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Monthly rent *
                <input
                  required
                  min="0"
                  type="number"
                  value={form.monthlyRent}
                  onChange={(e) => update('monthlyRent', e.target.value)}
                  className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Monthly WiFi charge (optional)
                <input
                  min="0"
                  type="number"
                  value={form.wifiCharge}
                  onChange={(e) => update('wifiCharge', e.target.value)}
                  placeholder="0"
                  className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Security deposit
                <input
                  min="0"
                  type="number"
                  value={form.securityDeposit}
                  onChange={(e) => update('securityDeposit', e.target.value)}
                  className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                />
              </label>
              {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
              <div className="sm:col-span-2 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <span className="text-xs text-slate-400">
                  {selectedRoom
                    ? `Floor ${selectedRoom.floor} · Room ${formatRoomNumber(selectedRoom.roomNumber)} available${
                        selectedRoom.monthlyRent != null ? ` · Default rent ${formatCurrency(selectedRoom.monthlyRent)}` : ''
                      }`
                    : 'Room floor appears after selection.'}
                </span>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save resident'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CollectPaymentModal
        target={collectTarget}
        onClose={() => setCollectTarget(null)}
        onSuccess={() => {
          load()
        }}
      />
    </main>
  )
}
