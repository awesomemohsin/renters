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
    <main className="mx-auto max-w-7xl px-3.5 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
            <UserRound aria-hidden="true" className="size-3 text-slate-700" /> Resident management
          </div>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-950">People, not paperwork.</h2>
          <p className="mt-1 max-w-xl text-xs sm:text-sm leading-relaxed text-slate-500">
            Keep resident details connected to the room they call home, view current monthly dues at a glance, and
            collect payments directly.
          </p>
        </div>
        <Button
          className="w-full sm:w-auto shrink-0"
          onClick={() => {
            setOpen(true)
            setError('')
          }}
        >
          <UserPlus data-icon="inline-start" className="size-4" /> Add new resident
        </Button>
      </div>

      <section aria-label="Resident summary" className="mt-5 sm:mt-7 grid grid-cols-3 gap-2 sm:gap-4">
        {summaryItems.map(([label, value, detail]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-5">
            <p className="text-[11px] sm:text-sm text-slate-500 truncate">{label}</p>
            <p className="mt-1 sm:mt-2 text-lg sm:text-3xl font-bold tracking-tight text-slate-950">{value}</p>
            <p className="mt-0.5 text-[10px] sm:text-xs text-slate-400 truncate">{detail}</p>
          </article>
        ))}
      </section>

      <div className="mt-5 sm:mt-7 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search aria-hidden="true" className="absolute left-3 top-2.5 size-4 text-slate-400" />
          <input
            aria-label="Search residents"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="h-9 sm:h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs sm:text-sm outline-none focus:border-slate-400"
          />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center shrink-0">
          <select
            aria-label="Filter by floor"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            className="h-9 sm:h-10 rounded-xl border border-slate-200 bg-white px-2.5 sm:px-3 text-xs sm:text-sm"
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
            className="h-9 sm:h-10 rounded-xl border border-slate-200 bg-white px-2.5 sm:px-3 text-xs sm:text-sm"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {error && !open && <p className="mt-3 text-xs sm:text-sm text-red-600">{error}</p>}

      {/* Mobile & Tablet Card View (No Side-Scrolling!) */}
      <div className="mt-4 space-y-3 lg:hidden">
        {residents.map((resident) => {
          const bs = resident.billingSummary
          return (
            <article
              key={resident._id}
              className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs transition hover:border-slate-300"
            >
              {/* Header: Room badge + Resident Name & Status */}
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-950 text-sm">
                      {resident.roomId
                        ? `Room ${formatRoomNumber(resident.roomId.roomNumber)}`
                        : 'Vacated'}
                    </span>
                    {resident.roomId && (
                      <span className="text-[11px] font-medium text-slate-400">
                        Floor {resident.roomId.floor}
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/residents/${resident._id}`}
                    className="font-medium text-xs text-slate-800 hover:underline mt-0.5 block"
                  >
                    {resident.fullName}
                  </Link>
                  <p className="text-[10px] text-slate-400">
                    {resident.phone}
                    {bs ? ` · Bill ${bs.billingMonth}` : ''}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0 ${
                    resident.status === 'active'
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  {resident.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Dues Breakdown Grid (3 columns) */}
              <div className="grid grid-cols-3 gap-1.5 py-2.5 text-center border-b border-slate-100 bg-slate-50/60 rounded-xl my-2 px-1">
                <div>
                  <p className="text-[10px] text-slate-400">Rent</p>
                  <p className="text-xs font-semibold text-slate-800 mt-0.5">
                    {formatCurrency(resident.monthlyRent)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Electricity</p>
                  <p className="text-xs font-semibold text-slate-800 mt-0.5">
                    {bs ? formatCurrency(bs.electricityDue) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">WiFi</p>
                  <p className="text-xs font-semibold text-slate-800 mt-0.5">
                    {bs ? formatCurrency(bs.wifiDue) : formatCurrency(resident.wifiCharge ?? 0)}
                  </p>
                </div>
              </div>

              {/* Footer: Payable, Paid, Remaining Due & Actions */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <div>
                  {bs ? (
                    <>
                      <p className="text-xs text-slate-500">
                        Payable: <span className="font-semibold text-slate-900">{formatCurrency(bs.totalPayable)}</span>
                        {' · '}Paid: <span className="font-semibold text-emerald-700">{formatCurrency(bs.totalPaid)}</span>
                      </p>
                      <p className="text-xs font-bold text-rose-600 mt-0.5">
                        Remaining Due: {formatCurrency(bs.remainingDue)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">No active bill for this month</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {bs && !bs.isLocked && (
                    <Button size="xs" onClick={() => openQuickCollect(resident)}>
                      <CreditCard className="size-3" /> Collect
                    </Button>
                  )}
                  <Link
                    href={`/residents/${resident._id}`}
                    className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900"
                  >
                    Profile
                  </Link>
                </div>
              </div>
            </article>
          )
        })}

        {residents.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
            No residents found.
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="mt-4 sm:mt-5 hidden lg:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-xs sm:text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-[11px] sm:text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3.5 py-3">Room</th>
                <th className="px-3.5 py-3">Resident name</th>
                <th className="px-3.5 py-3">Monthly rent</th>
                <th className="px-3.5 py-3">Electricity due</th>
                <th className="px-3.5 py-3">WiFi due</th>
                <th className="px-3.5 py-3">Prev. outstanding</th>
                <th className="px-3.5 py-3">Total payable</th>
                <th className="px-3.5 py-3">Total paid</th>
                <th className="px-3.5 py-3">Remaining due</th>
                <th className="px-3.5 py-3">Status</th>
                <th className="px-3.5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {residents.map((resident) => {
                const bs = resident.billingSummary
                return (
                  <tr key={resident._id} className="hover:bg-slate-50">
                    <td className="px-3.5 py-3 font-medium text-slate-800">
                      {resident.roomId
                        ? `Room ${formatRoomNumber(resident.roomId.roomNumber)}${
                            resident.status === 'inactive' ? ' (Vacated)' : ''
                          }`
                        : 'Vacated'}
                      <p className="mt-0.5 text-[11px] font-normal text-slate-400">
                        {resident.roomId ? `Floor ${resident.roomId.floor}` : '—'}
                      </p>
                    </td>
                    <td className="px-3.5 py-3">
                      <Link href={`/residents/${resident._id}`} className="font-medium text-slate-900 hover:underline">
                        {resident.fullName}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {resident.phone}
                        {bs ? ` · Bill ${bs.billingMonth}` : ''}
                      </p>
                    </td>
                    <td className="px-3.5 py-3 text-slate-700">{formatCurrency(resident.monthlyRent)}</td>
                    <td className="px-3.5 py-3 text-slate-700">
                      {bs ? formatCurrency(bs.electricityDue) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3.5 py-3 text-slate-700">
                      {bs ? formatCurrency(bs.wifiDue) : formatCurrency(resident.wifiCharge ?? 0)}
                    </td>
                    <td className="px-3.5 py-3 text-slate-700">
                      {bs ? (
                        <span className={bs.previousOutstanding > 0 ? 'font-medium text-amber-700' : 'text-slate-500'}>
                          {formatCurrency(bs.previousOutstanding)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-3 font-semibold text-slate-900">
                      {bs ? formatCurrency(bs.totalPayable) : <span className="font-normal text-slate-400">No bill</span>}
                    </td>
                    <td className="px-3.5 py-3 font-medium text-emerald-700">
                      {bs ? formatCurrency(bs.totalPaid) : <span className="font-normal text-slate-400">—</span>}
                    </td>
                    <td className="px-3.5 py-3 font-semibold text-rose-600">
                      {bs ? formatCurrency(bs.remainingDue) : <span className="font-normal text-slate-400">—</span>}
                    </td>
                    <td className="px-3.5 py-3">
                      <span className={resident.status === 'active' ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                        {resident.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {bs && !bs.isLocked && (
                          <Button size="xs" onClick={() => openQuickCollect(resident)}>
                            <CreditCard className="size-3" /> Collect
                          </Button>
                        )}
                        <Link
                          href={`/residents/${resident._id}`}
                          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900"
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
                  <td colSpan={11} className="px-5 py-12 text-center text-xs sm:text-sm text-slate-500">
                    No residents found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/30 p-2 sm:p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-resident-title"
            className="my-auto w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 lg:p-8 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500">Resident record</p>
                <h3 id="add-resident-title" className="text-lg sm:text-2xl font-bold tracking-tight text-slate-950">
                  Add new resident
                </h3>
              </div>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setOpen(false)}>
                <X />
              </Button>
            </div>
            <p className="mt-2.5 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              Document uploads are available via Vercel Blob. You can also save resident details directly.
            </p>
            <form onSubmit={submit} className="mt-4 sm:mt-6 grid gap-3 sm:gap-4 sm:grid-cols-2">
              {formFields.map(([key, label]) => (
                <label key={key} className="flex flex-col gap-1.5 text-xs sm:text-sm font-medium text-slate-700">
                  {label}
                  <input
                    required={key === 'fullName' || key === 'phone' || key === 'moveInDate'}
                    type={key === 'moveInDate' || key === 'dateOfBirth' ? 'date' : 'text'}
                    value={form[key]}
                    onChange={(e) => update(key, e.target.value)}
                    className="h-9 sm:h-10 rounded-xl border border-slate-200 px-3 text-xs sm:text-sm font-normal"
                  />
                </label>
              ))}
              <label className="flex flex-col gap-1.5 text-xs sm:text-sm font-medium text-slate-700">
                Room number *
                <select
                  required
                  value={form.roomId}
                  onChange={(e) => selectRoom(e.target.value)}
                  className="h-9 sm:h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs sm:text-sm font-normal"
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
              <label className="flex flex-col gap-1.5 text-xs sm:text-sm font-medium text-slate-700">
                Monthly rent *
                <input
                  required
                  min="0"
                  type="number"
                  value={form.monthlyRent}
                  onChange={(e) => update('monthlyRent', e.target.value)}
                  className="h-9 sm:h-10 rounded-xl border border-slate-200 px-3 text-xs sm:text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs sm:text-sm font-medium text-slate-700">
                Monthly WiFi charge (optional)
                <input
                  min="0"
                  type="number"
                  value={form.wifiCharge}
                  onChange={(e) => update('wifiCharge', e.target.value)}
                  placeholder="0"
                  className="h-9 sm:h-10 rounded-xl border border-slate-200 px-3 text-xs sm:text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs sm:text-sm font-medium text-slate-700">
                Security deposit
                <input
                  min="0"
                  type="number"
                  value={form.securityDeposit}
                  onChange={(e) => update('securityDeposit', e.target.value)}
                  className="h-9 sm:h-10 rounded-xl border border-slate-200 px-3 text-xs sm:text-sm font-normal"
                />
              </label>
              {error && <p className="sm:col-span-2 text-xs sm:text-sm text-red-600">{error}</p>}
              <div className="sm:col-span-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <span className="text-[11px] sm:text-xs text-slate-400 text-center sm:text-left">
                  {selectedRoom
                    ? `Floor ${selectedRoom.floor} · Room ${formatRoomNumber(selectedRoom.roomNumber)} available${
                        selectedRoom.monthlyRent != null ? ` · Default rent ${formatCurrency(selectedRoom.monthlyRent)}` : ''
                      }`
                    : 'Room floor appears after selection.'}
                </span>
                <Button type="submit" disabled={saving} className="w-full sm:w-auto">
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
