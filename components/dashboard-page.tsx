'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Cpu,
  CreditCard,
  DoorOpen,
  Filter,
  Flame,
  HelpCircle,
  Home,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wifi,
  X,
  Zap,
} from 'lucide-react'
import { formatCurrency, formatRoomNumber } from '@/lib/utils'

type RoomSummary = {
  _id: string
  roomNumber: number
  floor: number
  status: 'occupied' | 'vacant'
  monthlyRent: number | null
  resident: {
    _id: string
    fullName: string
    phone: string
    email: string
    status: string
  } | null
  subMeter: {
    _id: string
    meterNumber: string
    initialReading: number
  } | null
  reading: {
    _id: string
    previousReading: number
    currentReading: number
    consumption: number
    readingDate: string
    status: string
  } | null
  baselinePreviousReading: number
  electricityAllocation: {
    status: string
    mainMeterShare: number
    additionalCharge: number
    finalElectricityAmount: number
  } | null
  wifi: {
    hasConfig: boolean
    status: string
    monthlyCharge: number
    deviceCount: number
  } | null
  bill: {
    _id: string
    billingMonth: string
    status: 'unpaid' | 'partially_paid' | 'paid'
    monthlyRent: number
    electricityUnits: number
    totalElectricity: number
    wifiCharge: number
    totalPayable: number
    totalPaid: number
    remainingDue: number
    previousOutstanding: number
  } | null
}

type DashboardData = {
  billingMonth: string
  availableMonths: string[]
  summary: {
    totalRooms: number
    occupiedCount: number
    vacantCount: number
    readingsCount: number
    totalBilled: number
    totalCollected: number
    totalDue: number
    totalUnits: number
  }
  rooms: RoomSummary[]
}

const floors = [
  { value: 0, label: 'All floors' },
  { value: 1, label: 'Floor 1 (R1-5)' },
  { value: 2, label: 'Floor 2 (R6-10)' },
  { value: 3, label: 'Floor 3 (R11-15)' },
  { value: 4, label: 'Floor 4 (R16-20)' },
  { value: 5, label: 'Floor 5 (R21-26)' },
]

export function DashboardPage() {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedFloor, setSelectedFloor] = useState(0)
  const [statusFilter, setStatusFilter] = useState<'all' | 'occupied' | 'vacant' | 'needs_reading' | 'has_due'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Active drawer room
  const [activeRoom, setActiveRoom] = useState<RoomSummary | null>(null)
  const [drawerTab, setDrawerTab] = useState<'electricity' | 'wifi' | 'bill' | 'payment'>('electricity')

  // Reading form state
  const [readingPrev, setReadingPrev] = useState<number>(0)
  const [readingCurr, setReadingCurr] = useState<string>('')
  const [readingDate, setReadingDate] = useState(new Date().toISOString().slice(0, 10))
  const [savingReading, setSavingReading] = useState(false)
  const [readingMessage, setReadingMessage] = useState<{ text: string; isError: boolean } | null>(null)

  // WiFi form state
  const [wifiFee, setWifiFee] = useState<string>('600')
  const [savingWifi, setSavingWifi] = useState(false)
  const [wifiMessage, setWifiMessage] = useState<{ text: string; isError: boolean } | null>(null)

  // Bill generation state
  const [generatingBill, setGeneratingBill] = useState(false)
  const [billMessage, setBillMessage] = useState<{ text: string; isError: boolean } | null>(null)

  // Payment form state
  const [payAmount, setPayAmount] = useState<string>('')
  const [payMethod, setPayMethod] = useState<'cash' | 'bkash' | 'nagad' | 'bank_transfer'>('cash')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payRef, setPayRef] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)
  const [paymentMessage, setPaymentMessage] = useState<{ text: string; isError: boolean } | null>(null)

  // Fetch Dashboard Data
  const loadDashboard = async (month: string) => {
    try {
      setLoading(true)
      setError('')
      const res = await fetch(`/api/dashboard/rooms?month=${month}`)
      if (!res.ok) throw new Error('Unable to load rooms data')
      const json = await res.json()
      setData(json)
    } catch {
      setError('Unable to load building rooms. Please refresh.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard(selectedMonth)
  }, [selectedMonth])

  // Open drawer for a room
  const handleOpenRoom = (room: RoomSummary) => {
    setActiveRoom(room)
    setReadingMessage(null)
    setWifiMessage(null)
    setBillMessage(null)
    setPaymentMessage(null)

    // Pre-populate electricity reading
    const prev = room.reading ? room.reading.previousReading : room.baselinePreviousReading
    setReadingPrev(prev)
    setReadingCurr(room.reading ? String(room.reading.currentReading) : '')
    setReadingDate(room.reading ? room.reading.readingDate : new Date().toISOString().slice(0, 10))

    // Pre-populate WiFi
    setWifiFee(room.wifi ? String(room.wifi.monthlyCharge) : '600')

    // Pre-populate Payment
    if (room.bill && room.bill.remainingDue > 0) {
      setPayAmount(String(room.bill.remainingDue))
    } else {
      setPayAmount('')
    }

    // Default tab based on needs
    if (!room.reading) {
      setDrawerTab('electricity')
    } else if (!room.bill) {
      setDrawerTab('bill')
    } else if (room.bill.remainingDue > 0) {
      setDrawerTab('payment')
    } else {
      setDrawerTab('bill')
    }
  }

  // Save electricity reading
  const handleSaveReading = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeRoom) return
    const curr = Number(readingCurr)
    if (Number.isNaN(curr) || curr < readingPrev) {
      setReadingMessage({
        text: `Current reading (${readingCurr || 0}) must be greater than or equal to previous reading (${readingPrev}).`,
        isError: true,
      })
      return
    }

    try {
      setSavingReading(true)
      setReadingMessage(null)
      const res = await fetch('/api/utilities/readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingMonth: selectedMonth,
          roomId: activeRoom._id,
          previousReading: readingPrev,
          currentReading: curr,
          readingDate,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        setReadingMessage({ text: result.error || 'Failed to save reading.', isError: true })
      } else {
        setReadingMessage({ text: `Meter reading saved: ${curr - readingPrev} units consumed.`, isError: false })
        await loadDashboard(selectedMonth)
      }
    } catch {
      setReadingMessage({ text: 'Error saving meter reading.', isError: true })
    } finally {
      setSavingReading(false)
    }
  }

  // Save WiFi configuration
  const handleSaveWifi = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeRoom || !activeRoom.resident) return
    const charge = Number(wifiFee)
    if (Number.isNaN(charge) || charge < 0) {
      setWifiMessage({ text: 'Monthly WiFi charge must be a non-negative number.', isError: true })
      return
    }

    try {
      setSavingWifi(true)
      setWifiMessage(null)
      const res = await fetch('/api/wifi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId: activeRoom.resident._id,
          monthlyCharge: charge,
          wifiName: `Room ${formatRoomNumber(activeRoom.roomNumber)} WiFi`,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        setWifiMessage({ text: result.error || 'Failed to update WiFi.', isError: true })
      } else {
        setWifiMessage({ text: `WiFi package updated to ৳${charge}/month.`, isError: false })
        await loadDashboard(selectedMonth)
      }
    } catch {
      setWifiMessage({ text: 'Error saving WiFi package.', isError: true })
    } finally {
      setSavingWifi(false)
    }
  }

  // Generate / refresh bill for this room
  const handleGenerateBill = async () => {
    if (!activeRoom || !activeRoom.resident) return
    try {
      setGeneratingBill(true)
      setBillMessage(null)
      const res = await fetch('/api/monthly-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingMonth: selectedMonth,
          residentId: activeRoom.resident._id,
          allowUnfinalizedElectricity: true,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        setBillMessage({ text: result.error || 'Failed to generate monthly bill.', isError: true })
      } else {
        setBillMessage({ text: 'Monthly bill generated successfully.', isError: false })
        await loadDashboard(selectedMonth)
      }
    } catch {
      setBillMessage({ text: 'Error generating bill.', isError: true })
    } finally {
      setGeneratingBill(false)
    }
  }

  // Record payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeRoom || !activeRoom.bill) return
    const amount = Number(payAmount)
    if (Number.isNaN(amount) || amount <= 0) {
      setPaymentMessage({ text: 'Please enter a valid payment amount.', isError: true })
      return
    }

    try {
      setSavingPayment(true)
      setPaymentMessage(null)
      const res = await fetch('/api/monthly-bills/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billId: activeRoom.bill._id,
          amount,
          paymentMethod: payMethod,
          paymentDate: payDate,
          notes: payRef,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        setPaymentMessage({ text: result.error || 'Failed to record payment.', isError: true })
      } else {
        setPaymentMessage({ text: `Payment of ৳${amount.toLocaleString()} recorded successfully!`, isError: false })
        setPayAmount('')
        await loadDashboard(selectedMonth)
      }
    } catch {
      setPaymentMessage({ text: 'Error recording payment.', isError: true })
    } finally {
      setSavingPayment(false)
    }
  }

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    if (!data) return []
    return data.rooms.filter((room) => {
      // Floor filter
      if (selectedFloor !== 0 && room.floor !== selectedFloor) return false

      // Status filter
      if (statusFilter === 'occupied' && room.status !== 'occupied') return false
      if (statusFilter === 'vacant' && room.status !== 'vacant') return false
      if (statusFilter === 'needs_reading' && (room.status !== 'occupied' || room.reading !== null)) return false
      if (statusFilter === 'has_due' && (!room.bill || room.bill.remainingDue <= 0)) return false

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const roomMatch = `room ${room.roomNumber}`.includes(q) || `r${room.roomNumber}`.includes(q) || String(room.roomNumber) === q
        const resMatch = room.resident?.fullName.toLowerCase().includes(q) || room.resident?.phone.includes(q)
        if (!roomMatch && !resMatch) return false
      }

      return true
    })
  }, [data, selectedFloor, statusFilter, searchQuery])

  // Update activeRoom reference when data refreshes
  useEffect(() => {
    if (activeRoom && data) {
      const refreshed = data.rooms.find((r) => r.roomNumber === activeRoom.roomNumber)
      if (refreshed) setActiveRoom(refreshed)
    }
  }, [data])

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
      {/* ----------------- Top Header & Month Bar ----------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 border border-amber-200/60 mb-2">
            <Sparkles className="size-3.5 text-amber-600" /> All-in-One Building Hub
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            26 Rooms Workspace
          </h1>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            Click any room card to directly update meter readings, WiFi charges, bills, and payments.
          </p>
        </div>

        {/* Month Picker Pills */}
        <div className="flex items-center gap-2 self-start rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xs sm:self-auto">
          <Calendar className="ml-2 size-4 text-slate-400" />
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="cursor-pointer bg-transparent py-1 pr-3 text-xs font-semibold text-slate-800 focus:outline-none sm:text-sm"
          >
            {data?.availableMonths.map((m) => (
              <option key={m} value={m}>
                {new Date(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} ({m})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => loadDashboard(selectedMonth)}
            title="Refresh dashboard"
            className="rounded-xl p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ----------------- Summary Stat Chips (Claude-style soft cards) ----------------- */}
      {data?.summary && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Occupancy */}
          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between text-xs font-medium text-slate-400">
              <span>Occupancy</span>
              <Users className="size-4 text-emerald-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-slate-900">{data.summary.occupiedCount}</span>
              <span className="text-xs text-slate-400">/ 26 rooms</span>
            </div>
            <div className="mt-1.5 text-[11px] text-emerald-600 font-medium">
              {data.summary.vacantCount} vacant rooms
            </div>
          </div>

          {/* Electricity Units */}
          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between text-xs font-medium text-slate-400">
              <span>Electricity Units</span>
              <Zap className="size-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-slate-900">{data.summary.totalUnits.toLocaleString()}</span>
              <span className="text-xs text-slate-400">kWh</span>
            </div>
            <div className="mt-1.5 text-[11px] text-amber-700 font-medium">
              {data.summary.readingsCount} of {data.summary.occupiedCount} readings logged
            </div>
          </div>

          {/* Collected */}
          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between text-xs font-medium text-slate-400">
              <span>Collected</span>
              <CheckCircle2 className="size-4 text-teal-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-teal-700">৳{data.summary.totalCollected.toLocaleString()}</span>
            </div>
            <div className="mt-1.5 text-[11px] text-slate-400">
              Total billed: ৳{data.summary.totalBilled.toLocaleString()}
            </div>
          </div>

          {/* Due */}
          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between text-xs font-medium text-slate-400">
              <span>Outstanding Due</span>
              <AlertCircle className="size-4 text-rose-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-rose-600">৳{data.summary.totalDue.toLocaleString()}</span>
            </div>
            <div className="mt-1.5 text-[11px] text-rose-500 font-medium">
              {data.summary.totalDue > 0 ? 'Pending payments' : 'All cleared!'}
            </div>
          </div>
        </div>
      )}

      {/* ----------------- Filters & Floor Pills ----------------- */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/60 pb-4">
        {/* Floor Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {floors.map((floor) => (
            <button
              key={floor.value}
              type="button"
              onClick={() => setSelectedFloor(floor.value)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                selectedFloor === floor.value
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200/80 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {floor.label}
            </button>
          ))}
        </div>

        {/* Search & Quick Status Filters */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search room or resident..."
              className="h-8 w-44 rounded-full border border-slate-200/80 bg-white pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-slate-900 focus:outline-none sm:w-56"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="h-8 rounded-full border border-slate-200/80 bg-white px-3 text-xs font-medium text-slate-700 focus:border-slate-900 focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="occupied">Occupied</option>
            <option value="vacant">Vacant</option>
            <option value="needs_reading">Reading Needed</option>
            <option value="has_due">Has Due</option>
          </select>
        </div>
      </div>

      {/* ----------------- 26 All-in-One Claude-Style Room Cards Grid ----------------- */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredRooms.map((room) => {
          const isOccupied = room.status === 'occupied'
          const hasReading = room.reading !== null
          const hasBill = room.bill !== null
          const billStatus = room.bill?.status

          return (
            <div
              key={room.roomNumber}
              onClick={() => handleOpenRoom(room)}
              className="group relative flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_12px_28px_rgba(15,23,42,0.07)] cursor-pointer"
            >
              {/* Card Header: Room Number + Floor + Status */}
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex size-9 items-center justify-center rounded-2xl bg-slate-900 text-white font-bold text-xs shadow-xs">
                      {formatRoomNumber(room.roomNumber)}
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                        Room {formatRoomNumber(room.roomNumber)}
                      </h2>
                      <p className="text-[11px] text-slate-400">Floor {room.floor}</p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      isOccupied
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    <span className={`size-1.5 rounded-full ${isOccupied ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {isOccupied ? 'Occupied' : 'Vacant'}
                  </span>
                </div>

                {/* Resident Details */}
                <div className="mt-3.5 pb-3 border-b border-slate-100">
                  {isOccupied && room.resident ? (
                    <div>
                      <p className="text-xs font-semibold text-slate-800 truncate">{room.resident.fullName}</p>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                        <Phone className="size-3 text-slate-300" />
                        {room.resident.phone || 'No phone'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No resident assigned</p>
                  )}
                </div>

                {/* All-in-One Vital Metrics (Electricity, WiFi, Rent) */}
                <div className="mt-3 space-y-2">
                  {/* Electricity Meter & Units */}
                  <div className="flex items-center justify-between rounded-xl bg-slate-50/80 px-2.5 py-1.5 text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-slate-600">
                      <Zap className="size-3.5 text-amber-500" />
                      <span>Electricity</span>
                    </span>
                    {hasReading ? (
                      <span className="font-semibold text-slate-800">
                        {room.reading?.consumption} units{' '}
                        {room.electricityAllocation ? (
                          <span className="text-slate-500 font-normal">
                            (৳{room.electricityAllocation.finalElectricityAmount})
                          </span>
                        ) : null}
                      </span>
                    ) : isOccupied ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/50">
                        Enter reading
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">0 units</span>
                    )}
                  </div>

                  {/* WiFi Package */}
                  <div className="flex items-center justify-between rounded-xl bg-slate-50/80 px-2.5 py-1.5 text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-slate-600">
                      <Wifi className="size-3.5 text-sky-500" />
                      <span>WiFi</span>
                    </span>
                    <span className="font-semibold text-slate-800">
                      {room.wifi && room.wifi.hasConfig && room.wifi.monthlyCharge > 0
                        ? `৳${room.wifi.monthlyCharge}`
                        : 'None'}
                    </span>
                  </div>

                  {/* Base Rent */}
                  <div className="flex items-center justify-between rounded-xl bg-slate-50/80 px-2.5 py-1.5 text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-slate-600">
                      <Home className="size-3.5 text-indigo-500" />
                      <span>Base Rent</span>
                    </span>
                    <span className="font-semibold text-slate-800">
                      {room.monthlyRent ? `৳${room.monthlyRent.toLocaleString()}` : 'Not set'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Card Footer: Total Bill & Status */}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      {selectedMonth} Bill
                    </span>
                    <div className="text-base font-bold text-slate-900">
                      {hasBill ? `৳${room.bill?.totalPayable.toLocaleString()}` : 'Unbilled'}
                    </div>
                  </div>

                  {/* Status Pill */}
                  {hasBill ? (
                    billStatus === 'paid' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                        <Check className="size-3 stroke-[3]" /> Paid
                      </span>
                    ) : billStatus === 'partially_paid' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/80 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        Due ৳{room.bill?.remainingDue.toLocaleString()}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100/80 px-2.5 py-1 text-xs font-semibold text-rose-800">
                        Due ৳{room.bill?.remainingDue.toLocaleString()}
                      </span>
                    )
                  ) : isOccupied ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      Generate Bill
                    </span>
                  ) : null}
                </div>

                {/* Friendly Tactile Action Prompt */}
                <div className="mt-3 flex items-center justify-between text-xs font-semibold text-slate-700 group-hover:text-slate-950 transition">
                  <span className="text-[11px] text-slate-400 group-hover:text-slate-600">
                    Quick bills & readings
                  </span>
                  <div className="flex size-6 items-center justify-center rounded-full bg-slate-100 group-hover:bg-slate-900 group-hover:text-white transition">
                    <ArrowRight className="size-3" />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ----------------- Slide-Over Drawer / Quick Action Modal ----------------- */}
      {activeRoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/40 backdrop-blur-xs p-0 transition-opacity"
          onClick={() => setActiveRoom(null)}
        >
          <div
            className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200 sm:rounded-l-3xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-start justify-between border-b border-slate-200/80 bg-[#fbfbfc] p-6">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white">
                    {formatRoomNumber(activeRoom.roomNumber)}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">
                    Room {formatRoomNumber(activeRoom.roomNumber)}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      activeRoom.status === 'occupied'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {activeRoom.status === 'occupied' ? 'Occupied' : 'Vacant'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Floor {activeRoom.floor} · {activeRoom.resident ? activeRoom.resident.fullName : 'No resident'}
                  {activeRoom.resident?.phone ? ` (${activeRoom.resident.phone})` : ''}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveRoom(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Quick Action Navigation Tabs (Claude Pill Style) */}
            <div className="flex items-center gap-1 border-b border-slate-100 bg-white px-6 py-2.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => setDrawerTab('electricity')}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  drawerTab === 'electricity'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Zap className="size-3.5" /> Electricity
              </button>

              <button
                type="button"
                onClick={() => setDrawerTab('wifi')}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  drawerTab === 'wifi'
                    ? 'bg-sky-500 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Wifi className="size-3.5" /> WiFi
              </button>

              <button
                type="button"
                onClick={() => setDrawerTab('bill')}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  drawerTab === 'bill'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <CircleDollarSign className="size-3.5" /> Bill Breakdown
              </button>

              <button
                type="button"
                onClick={() => setDrawerTab('payment')}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  drawerTab === 'payment'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <CreditCard className="size-3.5" /> Collect Payment
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* TAB 1: ELECTRICITY */}
              {drawerTab === 'electricity' && (
                <form onSubmit={handleSaveReading} className="space-y-5">
                  <div className="rounded-2xl border border-amber-200/70 bg-amber-50/50 p-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                      <Zap className="size-4 text-amber-600" />
                      <span>Sub-Meter #{activeRoom.subMeter?.meterNumber || '01'} ({selectedMonth})</span>
                    </div>
                    <p className="mt-1 text-xs text-amber-700/80 leading-relaxed">
                      Enter the current reading on the room sub-meter. The consumption will be calculated automatically.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
                        Previous Reading
                      </label>
                      <input
                        type="number"
                        disabled
                        value={readingPrev}
                        className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
                      />
                      <span className="text-[10px] text-slate-400">Baseline / Last month</span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1">
                        Current Reading *
                      </label>
                      <input
                        type="number"
                        required
                        autoFocus
                        min={readingPrev}
                        value={readingCurr}
                        onChange={(e) => setReadingCurr(e.target.value)}
                        placeholder={`>= ${readingPrev}`}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 focus:border-slate-950 focus:outline-none focus:ring-1 focus:ring-slate-950"
                      />
                      <span className="text-[10px] text-slate-400">Meter dial value</span>
                    </div>
                  </div>

                  {/* Live Calculation Preview */}
                  {readingCurr !== '' && Number(readingCurr) >= readingPrev && (
                    <div className="flex items-center justify-between rounded-xl bg-slate-900 text-white p-3.5">
                      <div>
                        <div className="text-xs text-slate-400">Units Consumed</div>
                        <div className="text-lg font-bold">
                          {Number(readingCurr) - readingPrev} kWh
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Additional +৳1/unit</div>
                        <div className="text-xs font-semibold text-amber-400">
                          +৳{Number(readingCurr) - readingPrev} charge
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Reading Date
                    </label>
                    <input
                      type="date"
                      value={readingDate}
                      onChange={(e) => setReadingDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-slate-950 focus:outline-none"
                    />
                  </div>

                  {readingMessage && (
                    <div
                      className={`rounded-xl p-3 text-xs font-medium ${
                        readingMessage.isError
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {readingMessage.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={savingReading}
                    className="w-full rounded-full bg-slate-950 py-3 text-sm font-semibold text-white shadow-xs hover:bg-slate-800 transition disabled:opacity-50"
                  >
                    {savingReading ? 'Saving Reading...' : 'Save Meter Reading'}
                  </button>
                </form>
              )}

              {/* TAB 2: WIFI */}
              {drawerTab === 'wifi' && (
                <form onSubmit={handleSaveWifi} className="space-y-5">
                  <div className="rounded-2xl border border-sky-200/70 bg-sky-50/50 p-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-sky-800">
                      <Wifi className="size-4 text-sky-600" />
                      <span>WiFi Subscription for {activeRoom.resident?.fullName || 'Resident'}</span>
                    </div>
                    <p className="mt-1 text-xs text-sky-700/80 leading-relaxed">
                      Configure the monthly WiFi fee for this resident. Devices registered: {activeRoom.wifi?.deviceCount || 0}.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Monthly WiFi Fee (BDT)
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-sm font-bold text-slate-400">
                        ৳
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={wifiFee}
                        onChange={(e) => setWifiFee(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm font-bold text-slate-900 focus:border-slate-950 focus:outline-none"
                      />
                    </div>
                  </div>

                  {wifiMessage && (
                    <div
                      className={`rounded-xl p-3 text-xs font-medium ${
                        wifiMessage.isError
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {wifiMessage.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={savingWifi || !activeRoom.resident}
                    className="w-full rounded-full bg-slate-950 py-3 text-sm font-semibold text-white shadow-xs hover:bg-slate-800 transition disabled:opacity-50"
                  >
                    {savingWifi ? 'Saving...' : 'Update WiFi Package'}
                  </button>
                </form>
              )}

              {/* TAB 3: BILL BREAKDOWN */}
              {drawerTab === 'bill' && (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        Monthly Statement: {selectedMonth}
                      </span>
                      {activeRoom.bill ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            activeRoom.bill.status === 'paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {activeRoom.bill.status === 'paid' ? 'PAID' : 'DUE'}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          NOT GENERATED
                        </span>
                      )}
                    </div>

                    {/* Breakdown items */}
                    <div className="mt-4 space-y-2.5 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Base Rent</span>
                        <span className="font-semibold text-slate-900">
                          ৳{(activeRoom.bill?.monthlyRent ?? activeRoom.monthlyRent ?? 0).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex justify-between text-slate-600">
                        <span>Electricity ({activeRoom.bill?.electricityUnits ?? activeRoom.reading?.consumption ?? 0} units)</span>
                        <span className="font-semibold text-slate-900">
                          ৳{(activeRoom.bill?.totalElectricity ?? activeRoom.electricityAllocation?.finalElectricityAmount ?? 0).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex justify-between text-slate-600">
                        <span>WiFi Charges</span>
                        <span className="font-semibold text-slate-900">
                          ৳{(activeRoom.bill?.wifiCharge ?? activeRoom.wifi?.monthlyCharge ?? 0).toLocaleString()}
                        </span>
                      </div>

                      {Boolean(activeRoom.bill?.previousOutstanding) && (
                        <div className="flex justify-between text-rose-600 font-medium">
                          <span>Past Outstanding Due</span>
                          <span>+৳{activeRoom.bill?.previousOutstanding.toLocaleString()}</span>
                        </div>
                      )}

                      <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-bold text-slate-900">
                        <span>Total Payable</span>
                        <span>
                          ৳{(
                            activeRoom.bill?.totalPayable ??
                            (activeRoom.monthlyRent || 0) +
                              (activeRoom.electricityAllocation?.finalElectricityAmount || 0) +
                              (activeRoom.wifi?.monthlyCharge || 0)
                          ).toLocaleString()}
                        </span>
                      </div>

                      {activeRoom.bill && (
                        <>
                          <div className="flex justify-between text-emerald-600 font-medium">
                            <span>Amount Paid</span>
                            <span>-৳{activeRoom.bill.totalPaid.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm font-bold text-rose-600 pt-1 border-t border-dashed border-slate-200">
                            <span>Remaining Balance</span>
                            <span>৳{activeRoom.bill.remainingDue.toLocaleString()}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {billMessage && (
                    <div
                      className={`rounded-xl p-3 text-xs font-medium ${
                        billMessage.isError
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {billMessage.text}
                    </div>
                  )}

                  {activeRoom.resident ? (
                    <button
                      type="button"
                      disabled={generatingBill}
                      onClick={handleGenerateBill}
                      className="w-full rounded-full bg-slate-950 py-3 text-sm font-semibold text-white shadow-xs hover:bg-slate-800 transition disabled:opacity-50"
                    >
                      {generatingBill
                        ? 'Generating...'
                        : activeRoom.bill
                        ? 'Recalculate & Refresh Bill'
                        : 'Generate Monthly Bill'}
                    </button>
                  ) : (
                    <div className="rounded-xl bg-slate-100 p-3 text-center text-xs text-slate-500">
                      Cannot generate bill for a vacant room.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: COLLECT PAYMENT */}
              {drawerTab === 'payment' && (
                <form onSubmit={handleRecordPayment} className="space-y-5">
                  <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/50 p-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                      <CreditCard className="size-4 text-emerald-600" />
                      <span>Collect Payment ({selectedMonth})</span>
                    </div>
                    <p className="mt-1 text-xs text-emerald-700/80 leading-relaxed">
                      Outstanding balance:{' '}
                      <strong className="text-emerald-900">
                        ৳{activeRoom.bill?.remainingDue.toLocaleString() || '0'}
                      </strong>
                      . Recording payment updates resident financial balance in real time.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Amount Received (BDT) *
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-sm font-bold text-slate-400">
                        ৳
                      </span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder="Enter amount"
                        className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-8 pr-3 text-sm font-bold text-slate-900 focus:border-slate-950 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Payment Method
                      </label>
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-slate-950 focus:outline-none"
                      >
                        <option value="cash">Cash</option>
                        <option value="bkash">bKash</option>
                        <option value="nagad">Nagad</option>
                        <option value="bank_transfer">Bank Transfer</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Date Received
                      </label>
                      <input
                        type="date"
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-slate-950 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Reference Note (optional)
                    </label>
                    <input
                      type="text"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder="e.g. TrxID / Received by hand"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-slate-950 focus:outline-none"
                    />
                  </div>

                  {paymentMessage && (
                    <div
                      className={`rounded-xl p-3 text-xs font-medium ${
                        paymentMessage.isError
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {paymentMessage.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={savingPayment || !activeRoom.bill}
                    className="w-full rounded-full bg-emerald-600 py-3 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700 transition disabled:opacity-50"
                  >
                    {savingPayment ? 'Recording...' : 'Record Payment Now'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
