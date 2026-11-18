'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Cpu,
  CreditCard,
  DoorOpen,
  FileText,
  Filter,
  Flame,
  HelpCircle,
  History,
  Home,
  Image as ImageIcon,
  LogOut,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  User,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Wifi,
  X,
  Zap,
} from 'lucide-react'
import { formatBillingMonth, formatCurrency, formatRoomNumber } from '@/lib/utils'

type PastResident = {
  _id: string
  fullName: string
  phone: string
  nidNumber: string
  photoUrl: string
  partnerName: string
  permanentAddress: string
  moveInDate: string
  moveOutDate: string
  status: string
}

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
    nidNumber: string
    photoUrl: string
    partnerName: string
    partnerPhone: string
    partnerNid: string
    permanentAddress: string
    nidFrontUrl: string
    nidBackUrl: string
    moveInDate: string
    advanceBalance?: number
    monthlyRent?: number
    roomHistory?: Array<{
      roomId: string
      roomNumber: number
      floor: number
      monthlyRent: number
      fromDate: string
      toDate?: string | null
      reason?: string
    }>
    status: string
  } | null
  pastResidents: PastResident[]
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
  const [drawerTab, setDrawerTab] = useState<'renter' | 'electricity' | 'wifi' | 'bill' | 'payment'>('renter')

  // --- Renter Form State (Add Renter) ---
  const [renterName, setRenterName] = useState('')
  const [renterPhone, setRenterPhone] = useState('')
  const [renterNid, setRenterNid] = useState('')
  const [renterPhotoUrl, setRenterPhotoUrl] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [partnerPhone, setPartnerPhone] = useState('')
  const [partnerNid, setPartnerNid] = useState('')
  const [permanentAddress, setPermanentAddress] = useState('')
  const [nidFrontUrl, setNidFrontUrl] = useState('')
  const [nidBackUrl, setNidBackUrl] = useState('')
  const [renterRent, setRenterRent] = useState('')
  const [renterMoveInDate, setRenterMoveInDate] = useState(new Date().toISOString().slice(0, 10))
  const [savingRenter, setSavingRenter] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState<'front' | 'back' | null>(null)
  const [renterMessage, setRenterMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const [vacatingRenter, setVacatingRenter] = useState(false)

  // File input refs
  const photoInputRef = useRef<HTMLInputElement>(null)
  const nidFrontInputRef = useRef<HTMLInputElement>(null)
  const nidBackInputRef = useRef<HTMLInputElement>(null)

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
  const [payMode, setPayMode] = useState<'bill' | 'advance'>('bill')
  const [applyingAdvance, setApplyingAdvance] = useState(false)
  const [payAmount, setPayAmount] = useState<string>('')
  const [payMethod, setPayMethod] = useState<'cash' | 'bkash' | 'nagad' | 'bank_transfer'>('cash')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payRef, setPayRef] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)
  const [paymentMessage, setPaymentMessage] = useState<{ text: string; isError: boolean } | null>(null)

  // Room shift state
  const [showShiftModal, setShowShiftModal] = useState(false)
  const [shiftTargetRoomId, setShiftTargetRoomId] = useState('')
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().slice(0, 10))
  const [shiftRent, setShiftRent] = useState('')
  const [shiftNotes, setShiftNotes] = useState('')
  const [shiftingResident, setShiftingResident] = useState(false)
  const [shiftMessage, setShiftMessage] = useState<{ text: string; isError: boolean } | null>(null)

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
  const handleOpenRoom = (room: RoomSummary, defaultTab?: typeof drawerTab) => {
    setActiveRoom(room)
    setReadingMessage(null)
    setWifiMessage(null)
    setBillMessage(null)
    setPaymentMessage(null)
    setRenterMessage(null)

    // Pre-populate Renter form
    setRenterName('')
    setRenterPhone('')
    setRenterNid('')
    setRenterPhotoUrl('')
    setPartnerName('')
    setPartnerPhone('')
    setPartnerNid('')
    setPermanentAddress('')
    setNidFrontUrl('')
    setNidBackUrl('')
    setRenterRent(room.monthlyRent ? String(room.monthlyRent) : '')
    setRenterMoveInDate(new Date().toISOString().slice(0, 10))

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
      setPayMode('bill')
    } else {
      setPayAmount('')
      setPayMode(room.resident ? 'advance' : 'bill')
    }
    setShowShiftModal(false)
    setShiftTargetRoomId('')
    setShiftRent(room.resident?.monthlyRent ? String(room.resident.monthlyRent) : '')
    setShiftNotes('')
    setShiftMessage(null)

    if (defaultTab) {
      setDrawerTab(defaultTab)
    } else if (room.status === 'vacant') {
      setDrawerTab('renter')
    } else if (!room.reading) {
      setDrawerTab('electricity')
    } else if (!room.bill) {
      setDrawerTab('bill')
    } else if (room.bill.remainingDue > 0) {
      setDrawerTab('payment')
    } else {
      setDrawerTab('renter')
    }
  }

  // Upload an image file to Vercel Blob via /api/upload
  const handleUploadImage = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    })
    const json = await res.json()
    if (!res.ok) {
      throw new Error(json.error || 'Failed to upload image.')
    }
    return json.url as string
  }

  // Upload Photo handler
  const onPhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setUploadingPhoto(true)
      setRenterMessage(null)
      const url = await handleUploadImage(file)
      setRenterPhotoUrl(url)
    } catch (err) {
      setRenterMessage({ text: (err as Error).message || 'Photo upload failed', isError: true })
    } finally {
      setUploadingPhoto(false)
    }
  }

  // Upload NID Front / Back
  const onDocSelected = async (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back') => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setUploadingDoc(type)
      setRenterMessage(null)
      const url = await handleUploadImage(file)
      if (type === 'front') setNidFrontUrl(url)
      if (type === 'back') setNidBackUrl(url)
    } catch (err) {
      setRenterMessage({ text: (err as Error).message || 'Document upload failed', isError: true })
    } finally {
      setUploadingDoc(null)
    }
  }

  // Add / Assign Renter
  const handleAddRenter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeRoom) return

    if (!renterName.trim()) {
      setRenterMessage({ text: "Renter's full name is required.", isError: true })
      return
    }
    if (!renterPhone.trim()) {
      setRenterMessage({ text: "Renter's mobile number is required.", isError: true })
      return
    }
    if (!renterNid.trim()) {
      setRenterMessage({ text: "Renter's National ID (NID) is mandatory.", isError: true })
      return
    }
    if (!renterPhotoUrl.trim()) {
      setRenterMessage({ text: "Renter's photo is mandatory. Please upload an image.", isError: true })
      return
    }
    if (!renterRent || Number(renterRent) <= 0) {
      setRenterMessage({ text: 'Please specify monthly rent for this room.', isError: true })
      return
    }

    try {
      setSavingRenter(true)
      setRenterMessage(null)

      const res = await fetch('/api/residents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: renterName.trim(),
          phone: renterPhone.trim(),
          nidNumber: renterNid.trim(),
          photoUrl: renterPhotoUrl,
          partnerName: partnerName.trim(),
          partnerPhone: partnerPhone.trim(),
          partnerNid: partnerNid.trim(),
          permanentAddress: permanentAddress.trim(),
          nidFrontUrl,
          nidBackUrl,
          roomId: activeRoom._id,
          monthlyRent: Number(renterRent),
          moveInDate: renterMoveInDate,
          wifiCharge: 0,
        }),
      })

      const result = await res.json()
      if (!res.ok) {
        setRenterMessage({ text: result.error || 'Failed to add renter.', isError: true })
      } else {
        setRenterMessage({ text: `Renter ${renterName} assigned to Room ${formatRoomNumber(activeRoom.roomNumber)}!`, isError: false })
        await loadDashboard(selectedMonth)
      }
    } catch {
      setRenterMessage({ text: 'Error adding resident.', isError: true })
    } finally {
      setSavingRenter(false)
    }
  }

  // Vacate current renter
  const handleVacateRenter = async () => {
    if (!activeRoom || !activeRoom.resident) return
    const confirmed = window.confirm(
      `Are you sure you want to vacate ${activeRoom.resident.fullName} from Room ${formatRoomNumber(activeRoom.roomNumber)}?\n\nTheir records, past bills, and documents will be preserved in room history permanently.`,
    )
    if (!confirmed) return

    try {
      setVacatingRenter(true)
      setRenterMessage(null)

      const res = await fetch(`/api/residents/${activeRoom.resident._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'vacate' }),
      })

      const result = await res.json()
      if (!res.ok) {
        setRenterMessage({ text: result.error || 'Failed to vacate renter.', isError: true })
      } else {
        setRenterMessage({
          text: `Renter vacated successfully. Room ${formatRoomNumber(activeRoom.roomNumber)} is now vacant.`,
          isError: false,
        })
        await loadDashboard(selectedMonth)
      }
    } catch {
      setRenterMessage({ text: 'Error vacating renter.', isError: true })
    } finally {
      setVacatingRenter(false)
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

  // Record payment (Regular or Advance)
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeRoom || !activeRoom.resident) return
    const amount = Number(payAmount)
    if (Number.isNaN(amount) || amount <= 0) {
      setPaymentMessage({ text: 'Please enter a valid payment amount.', isError: true })
      return
    }

    try {
      setSavingPayment(true)
      setPaymentMessage(null)

      const isAdv = payMode === 'advance' || !activeRoom.bill
      const payload = isAdv
        ? {
            action: 'record_advance',
            residentId: activeRoom.resident._id,
            roomId: activeRoom._id,
            amount,
            paymentMethod: payMethod,
            paymentDate: payDate,
            notes: payRef || 'Advance bill payment deposit',
          }
        : {
            billId: activeRoom.bill?._id,
            amount,
            paymentMethod: payMethod,
            paymentDate: payDate,
            notes: payRef,
            recordExcessAsAdvance: true,
          }

      const res = await fetch('/api/monthly-bills/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      if (!res.ok) {
        setPaymentMessage({ text: result.error || 'Failed to record payment.', isError: true })
      } else {
        const msg = isAdv
          ? `Advance payment of ৳${amount.toLocaleString()} credited successfully!`
          : `Payment of ৳${amount.toLocaleString()} recorded successfully!`
        setPaymentMessage({ text: msg, isError: false })
        setPayAmount('')
        await loadDashboard(selectedMonth)
      }
    } catch {
      setPaymentMessage({ text: 'Error recording payment.', isError: true })
    } finally {
      setSavingPayment(false)
    }
  }

  // Apply advance credit to current bill
  const handleApplyAdvance = async () => {
    if (!activeRoom || !activeRoom.bill || !activeRoom.resident?.advanceBalance) return
    const maxApply = Math.min(activeRoom.resident.advanceBalance, activeRoom.bill.remainingDue)
    if (maxApply <= 0) return

    try {
      setApplyingAdvance(true)
      setPaymentMessage(null)
      const res = await fetch(`/api/monthly-bills/${activeRoom.bill._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply_advance',
          notes: 'Applied from renter advance balance',
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        setPaymentMessage({ text: result.error || 'Failed to apply advance.', isError: true })
      } else {
        setPaymentMessage({ text: `Successfully applied advance credit to bill!`, isError: false })
        await loadDashboard(selectedMonth)
      }
    } catch {
      setPaymentMessage({ text: 'Error applying advance credit.', isError: true })
    } finally {
      setApplyingAdvance(false)
    }
  }

  // Shift / Transfer room
  const handleShiftRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeRoom || !activeRoom.resident) return
    if (!shiftTargetRoomId) {
      setShiftMessage({ text: 'Please select a vacant destination room.', isError: true })
      return
    }

    try {
      setShiftingResident(true)
      setShiftMessage(null)
      const res = await fetch(`/api/residents/${activeRoom.resident._id}/shift-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetRoomId: shiftTargetRoomId,
          shiftDate,
          newMonthlyRent: shiftRent ? Number(shiftRent) : undefined,
          notes: shiftNotes,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        setShiftMessage({ text: result.error || 'Failed to shift room.', isError: true })
      } else {
        setShiftMessage({ text: result.message || 'Room shifted successfully!', isError: false })
        setShowShiftModal(false)
        await loadDashboard(selectedMonth)
      }
    } catch {
      setShiftMessage({ text: 'Error executing room shift.', isError: true })
    } finally {
      setShiftingResident(false)
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
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 border border-amber-200/60 mb-1.5">
            <Sparkles className="size-3 text-amber-600" /> All-in-One Building Hub
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">
            26 Rooms Workspace
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
            Click any room card to directly update meter readings, WiFi charges, bills, and renter profiles.
          </p>
        </div>

        {/* Month Picker Pills */}
        <div className="flex items-center justify-between sm:justify-start gap-2 self-stretch sm:self-auto rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xs">
          <div className="flex items-center gap-1.5">
            <Calendar className="ml-1 size-3.5 sm:size-4 text-slate-400 shrink-0" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="cursor-pointer bg-transparent py-1 pr-2 text-xs font-semibold text-slate-800 focus:outline-none sm:text-sm"
            >
              {data?.availableMonths.map((m) => (
                <option key={m} value={m}>
                  {formatBillingMonth(m)} ({m})
                </option>
              ))}
            </select>
          </div>
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
        <div className="mt-4 sm:mt-6 grid grid-cols-2 gap-2.5 sm:gap-4 sm:grid-cols-4">
          {/* Occupancy */}
          <div className="rounded-2xl border border-slate-200/70 bg-white p-3 sm:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between text-[11px] sm:text-xs font-medium text-slate-400">
              <span>Occupancy</span>
              <Users className="size-3.5 sm:size-4 text-emerald-600" />
            </div>
            <div className="mt-1.5 sm:mt-2 flex items-baseline gap-1">
              <span className="text-lg sm:text-2xl font-bold text-slate-900">{data.summary.occupiedCount}</span>
              <span className="text-[10px] sm:text-xs text-slate-400">/ 26</span>
            </div>
            <div className="mt-1 text-[10px] sm:text-[11px] text-emerald-600 font-medium truncate">
              {data.summary.vacantCount} vacant rooms
            </div>
          </div>

          {/* Electricity Units */}
          <div className="rounded-2xl border border-slate-200/70 bg-white p-3 sm:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between text-[11px] sm:text-xs font-medium text-slate-400">
              <span>Units</span>
              <Zap className="size-3.5 sm:size-4 text-amber-500" />
            </div>
            <div className="mt-1.5 sm:mt-2 flex items-baseline gap-1">
              <span className="text-lg sm:text-2xl font-bold text-slate-900">{data.summary.totalUnits.toLocaleString()}</span>
              <span className="text-[10px] sm:text-xs text-slate-400">kWh</span>
            </div>
            <div className="mt-1 text-[10px] sm:text-[11px] text-amber-700 font-medium truncate">
              {data.summary.readingsCount} of {data.summary.occupiedCount} logged
            </div>
          </div>

          {/* Collected */}
          <div className="rounded-2xl border border-slate-200/70 bg-white p-3 sm:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between text-[11px] sm:text-xs font-medium text-slate-400">
              <span>Collected</span>
              <CheckCircle2 className="size-3.5 sm:size-4 text-teal-600" />
            </div>
            <div className="mt-1.5 sm:mt-2 flex items-baseline gap-1">
              <span className="text-lg sm:text-2xl font-bold text-teal-700">৳{data.summary.totalCollected.toLocaleString()}</span>
            </div>
            <div className="mt-1 text-[10px] sm:text-[11px] text-slate-400 truncate">
              Billed: ৳{data.summary.totalBilled.toLocaleString()}
            </div>
          </div>

          {/* Due */}
          <div className="rounded-2xl border border-slate-200/70 bg-white p-3 sm:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between text-[11px] sm:text-xs font-medium text-slate-400">
              <span>Due</span>
              <AlertCircle className="size-3.5 sm:size-4 text-rose-500" />
            </div>
            <div className="mt-1.5 sm:mt-2 flex items-baseline gap-1">
              <span className="text-lg sm:text-2xl font-bold text-rose-600">৳{data.summary.totalDue.toLocaleString()}</span>
            </div>
            <div className="mt-1 text-[10px] sm:text-[11px] text-rose-500 font-medium truncate">
              {data.summary.totalDue > 0 ? 'Pending dues' : 'All cleared!'}
            </div>
          </div>
        </div>
      )}

      {/* ----------------- Filters & Floor Pills ----------------- */}
      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/60 pb-3 sm:pb-4">
        {/* Floor Pills */}
        <div className="flex overflow-x-auto gap-1.5 scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] pb-1 sm:pb-0">
          {floors.map((floor) => (
            <button
              key={floor.value}
              type="button"
              onClick={() => setSelectedFloor(floor.value)}
              className={`rounded-full px-3 py-1 sm:px-3.5 sm:py-1.5 text-xs font-medium whitespace-nowrap transition-all ${
                selectedFloor === floor.value
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200/80 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {floor.label}
            </button>
          ))}
        </div>

        {/* Search & Quick Status Filters in 1 row on mobile */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search room or resident..."
              className="h-8 w-full rounded-full border border-slate-200/80 bg-white pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-slate-900 focus:outline-none sm:w-56"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="h-8 rounded-full border border-slate-200/80 bg-white px-2.5 sm:px-3 text-xs font-medium text-slate-700 focus:border-slate-900 focus:outline-none shrink-0"
          >
            <option value="all">All</option>
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
                  <div className="flex items-center gap-2.5">
                    {/* Renter Photo / Avatar Thumbnail */}
                    {isOccupied && room.resident?.photoUrl ? (
                      <img
                        src={room.resident.photoUrl}
                        alt={room.resident.fullName}
                        className="size-10 rounded-2xl object-cover border border-slate-200 shadow-xs"
                      />
                    ) : (
                      <div className="flex size-10 items-center justify-center rounded-2xl bg-slate-900 text-white font-bold text-xs shadow-xs">
                        {formatRoomNumber(room.roomNumber)}
                      </div>
                    )}
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                        Room {formatRoomNumber(room.roomNumber)}
                      </h2>
                      <p className="text-[11px] text-slate-400">Floor {room.floor}</p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
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
                    {room.resident?.advanceBalance && room.resident.advanceBalance > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Adv: ৳{room.resident.advanceBalance.toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Resident Details */}
                <div className="mt-3.5 pb-3 border-b border-slate-100">
                  {isOccupied && room.resident ? (
                    <div>
                      <p className="text-xs font-semibold text-slate-800 truncate">{room.resident.fullName}</p>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-0.5">
                        <span className="flex items-center gap-1">
                          <Phone className="size-3 text-slate-300" />
                          {room.resident.phone || 'No phone'}
                        </span>
                        {room.resident.nidNumber ? (
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            NID: {room.resident.nidNumber}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400 italic">No resident</p>
                      <span className="text-[11px] font-medium text-indigo-600 group-hover:underline">
                        + Add Renter
                      </span>
                    </div>
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
            className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200 sm:rounded-l-3xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-start justify-between border-b border-slate-200/80 bg-[#fbfbfc] p-3.5 sm:p-6">
              <div>
                <div className="flex items-center gap-2 sm:gap-2.5">
                  {activeRoom.resident?.photoUrl ? (
                    <img
                      src={activeRoom.resident.photoUrl}
                      alt={activeRoom.resident.fullName}
                      className="size-9 sm:size-10 rounded-2xl object-cover border border-slate-200 shadow-xs"
                    />
                  ) : (
                    <div className="flex size-9 sm:size-10 items-center justify-center rounded-2xl bg-slate-900 text-xs font-bold text-white">
                      {formatRoomNumber(activeRoom.roomNumber)}
                    </div>
                  )}
                  <div>
                    <h3 className="text-base sm:text-xl font-bold text-slate-900">
                      Room {formatRoomNumber(activeRoom.roomNumber)}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-slate-500 truncate max-w-[170px] sm:max-w-none">
                      Floor {activeRoom.floor} · {activeRoom.resident ? activeRoom.resident.fullName : 'Vacant Room'}
                    </p>
                  </div>
                  <span
                    className={`ml-1.5 rounded-full px-2 py-0.5 text-[10px] sm:text-xs font-semibold shrink-0 ${
                      activeRoom.status === 'occupied'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {activeRoom.status === 'occupied' ? 'Occupied' : 'Vacant'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveRoom(null)}
                className="rounded-full p-1.5 sm:p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
              >
                <X className="size-4 sm:size-5" />
              </button>
            </div>

            {/* Quick Action Navigation Tabs (Claude Pill Style) */}
            <div className="flex items-center gap-1 border-b border-slate-100 bg-white px-3 sm:px-6 py-2 overflow-x-auto scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none]">
              <button
                type="button"
                onClick={() => setDrawerTab('renter')}
                className={`flex items-center gap-1.5 rounded-full px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                  drawerTab === 'renter'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <User className="size-3.5" /> Renter Profile
              </button>

              <button
                type="button"
                onClick={() => setDrawerTab('electricity')}
                className={`flex items-center gap-1.5 rounded-full px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-xs font-semibold whitespace-nowrap transition ${
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
                className={`flex items-center gap-1.5 rounded-full px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-xs font-semibold whitespace-nowrap transition ${
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
                className={`flex items-center gap-1.5 rounded-full px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                  drawerTab === 'bill'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <CircleDollarSign className="size-3.5" /> Bill
              </button>

              <button
                type="button"
                onClick={() => setDrawerTab('payment')}
                className={`flex items-center gap-1.5 rounded-full px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                  drawerTab === 'payment'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <CreditCard className="size-3.5" /> Pay
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-5 sm:space-y-6">
              {/* TAB 0: RENTER PROFILE & DOCUMENTS */}
              {drawerTab === 'renter' && (
                <div className="space-y-6">
                  {/* If Room is Occupied: Show Current Renter Profile & Documents */}
                  {activeRoom.status === 'occupied' && activeRoom.resident ? (
                    <div className="space-y-5">
                      <div className="rounded-3xl border border-slate-200/80 bg-slate-50/50 p-5">
                        <div className="flex items-start gap-4">
                          {activeRoom.resident.photoUrl ? (
                            <img
                              src={activeRoom.resident.photoUrl}
                              alt={activeRoom.resident.fullName}
                              className="size-20 rounded-2xl object-cover border-2 border-white shadow-md"
                            />
                          ) : (
                            <div className="flex size-20 items-center justify-center rounded-2xl bg-slate-900 text-white font-bold text-xl">
                              {activeRoom.resident.fullName.charAt(0)}
                            </div>
                          )}
                          <div className="flex-1">
                            <h4 className="text-base font-bold text-slate-900">
                              {activeRoom.resident.fullName}
                            </h4>
                            <p className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-1.5">
                              <Phone className="size-3.5 text-slate-400" />
                              {activeRoom.resident.phone}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                NID: {activeRoom.resident.nidNumber || 'Not specified'}
                              </span>
                              <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                In: {activeRoom.resident.moveInDate || 'Active'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Additional Renter Details */}
                        <div className="mt-4 pt-4 border-t border-slate-200/60 grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                              Partner Name
                            </span>
                            <span className="font-semibold text-slate-800">
                              {activeRoom.resident.partnerName || 'None'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                              Partner Mobile
                            </span>
                            <span className="font-semibold text-slate-800 font-mono">
                              {activeRoom.resident.partnerPhone || 'None'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                              Partner NID
                            </span>
                            <span className="font-semibold text-slate-800 font-mono">
                              {activeRoom.resident.partnerNid || 'None'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                              Permanent Address
                            </span>
                            <span className="font-semibold text-slate-800 truncate block">
                              {activeRoom.resident.permanentAddress || 'None provided'}
                            </span>
                          </div>
                        </div>

                        {/* Document Previews (NID Front & Back) */}
                        <div className="mt-4 pt-4 border-t border-slate-200/60">
                          <span className="text-slate-500 block text-xs font-bold mb-2">
                            Uploaded Documents (Vercel Blob)
                          </span>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-[10px] text-slate-400 mb-1">NID Front</p>
                              {activeRoom.resident.nidFrontUrl ? (
                                <a
                                  href={activeRoom.resident.nidFrontUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="group relative block overflow-hidden rounded-xl border border-slate-200 bg-white"
                                >
                                  <img
                                    src={activeRoom.resident.nidFrontUrl}
                                    alt="NID Front"
                                    className="h-24 w-full object-cover group-hover:scale-105 transition"
                                  />
                                </a>
                              ) : (
                                <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-xs text-slate-400">
                                  No NID Front
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-400 mb-1">NID Back</p>
                              {activeRoom.resident.nidBackUrl ? (
                                <a
                                  href={activeRoom.resident.nidBackUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="group relative block overflow-hidden rounded-xl border border-slate-200 bg-white"
                                >
                                  <img
                                    src={activeRoom.resident.nidBackUrl}
                                    alt="NID Back"
                                    className="h-24 w-full object-cover group-hover:scale-105 transition"
                                  />
                                </a>
                              ) : (
                                <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-xs text-slate-400">
                                  No NID Back
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Room Tenancy & Shift History if any */}
                        {Array.isArray(activeRoom.resident.roomHistory) &&
                          activeRoom.resident.roomHistory.length > 0 && (
                            <div className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3.5">
                              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-2">
                                Room Shift History
                              </span>
                              <div className="space-y-1.5 text-xs text-slate-600">
                                {activeRoom.resident.roomHistory.map((h, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center justify-between py-1 border-b border-slate-200/50 last:border-0"
                                  >
                                    <span className="font-semibold text-slate-800">
                                      Room {formatRoomNumber(h.roomNumber)} (Floor {h.floor})
                                    </span>
                                    <span className="font-mono text-[11px] text-slate-400">
                                      {h.fromDate} → {h.toDate || 'Present'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                        {/* Room Shift Form Modal / Section */}
                        {showShiftModal && (
                          <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                                <RefreshCw className="size-3.5 text-indigo-600" />
                                <span>Shift Renter to Another Room</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowShiftModal(false)}
                                className="text-xs text-slate-400 hover:text-slate-600"
                              >
                                Cancel
                              </button>
                            </div>

                            <p className="text-[11px] text-indigo-700/80 leading-relaxed">
                              Move {activeRoom.resident.fullName} to a vacant room. All unpaid dues (including past electricity bills arriving 1 month late) automatically carry forward to the new room.
                            </p>

                            <form onSubmit={handleShiftRoom} className="space-y-3 pt-1">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Destination Room *
                                </label>
                                <select
                                  required
                                  value={shiftTargetRoomId}
                                  onChange={(e) => {
                                    setShiftTargetRoomId(e.target.value)
                                    const target = data?.rooms.find((r) => r._id === e.target.value)
                                    if (target?.monthlyRent) {
                                      setShiftRent(String(target.monthlyRent))
                                    }
                                  }}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-slate-950 focus:outline-none"
                                >
                                  <option value="">-- Choose Vacant Room --</option>
                                  {data?.rooms
                                    .filter((r) => r.status === 'vacant' && r._id !== activeRoom._id)
                                    .map((r) => (
                                      <option key={r._id} value={r._id}>
                                        Room {formatRoomNumber(r.roomNumber)} (Floor {r.floor}) — ৳
                                        {r.monthlyRent ? r.monthlyRent.toLocaleString() : 'N/A'}/mo
                                      </option>
                                    ))}
                                </select>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                    Effective Shift Date *
                                  </label>
                                  <input
                                    type="date"
                                    required
                                    value={shiftDate}
                                    onChange={(e) => setShiftDate(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-slate-950 focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                    New Monthly Rent (৳)
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={shiftRent}
                                    onChange={(e) => setShiftRent(e.target.value)}
                                    placeholder="Keep or override rent"
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-slate-950 focus:outline-none"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                  Shift Reason / Note (optional)
                                </label>
                                <input
                                  type="text"
                                  value={shiftNotes}
                                  onChange={(e) => setShiftNotes(e.target.value)}
                                  placeholder="e.g. Shifted to larger room"
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-slate-950 focus:outline-none"
                                />
                              </div>

                              {shiftMessage && (
                                <div
                                  className={`rounded-xl p-2.5 text-xs font-medium ${
                                    shiftMessage.isError
                                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  }`}
                                >
                                  {shiftMessage.text}
                                </div>
                              )}

                              <button
                                type="submit"
                                disabled={shiftingResident || !shiftTargetRoomId}
                                className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition disabled:opacity-50"
                              >
                                {shiftingResident ? 'Shifting Renter...' : 'Confirm Room Shift & Transfer Dues'}
                              </button>
                            </form>
                          </div>
                        )}

                        {/* Tenancy Actions: Shift Room & Vacate */}
                        <div className="mt-5 pt-4 border-t border-slate-200/60 space-y-2.5">
                          {!showShiftModal && (
                            <button
                              type="button"
                              onClick={() => {
                                setShowShiftModal(true)
                                setShiftMessage(null)
                                setShiftRent(
                                  String(activeRoom.resident?.monthlyRent || activeRoom.monthlyRent || ''),
                                )
                              }}
                              className="w-full flex items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/80 py-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition shadow-xs"
                            >
                              <RefreshCw className="size-3.5" />
                              <span>Shift / Transfer Room</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={vacatingRenter}
                            onClick={handleVacateRenter}
                            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/80 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
                          >
                            <UserMinus className="size-3.5" />
                            {vacatingRenter ? 'Vacating Renter...' : 'Vacate Current Renter (Move Out)'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* If Room is Vacant: Show "Add New Renter" Form */
                    <form onSubmit={handleAddRenter} className="space-y-4">
                      <div className="rounded-2xl border border-indigo-200/70 bg-indigo-50/50 p-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                          <UserPlus className="size-4 text-indigo-600" />
                          <span>Assign New Renter to Room {formatRoomNumber(activeRoom.roomNumber)}</span>
                        </div>
                        <p className="mt-1 text-xs text-indigo-700/80 leading-relaxed">
                          Fill in the renter details below. Photo and NID will be uploaded directly to Vercel Blob.
                        </p>
                      </div>

                      {/* Photo Upload (Mandatory) */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                          <span>Renter Photograph *</span>
                          <span className="text-[10px] font-normal text-rose-600">(Mandatory)</span>
                        </label>
                        <input
                          ref={photoInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={onPhotoSelected}
                        />

                        {renterPhotoUrl ? (
                          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
                            <img
                              src={renterPhotoUrl}
                              alt="Renter preview"
                              className="size-14 rounded-xl object-cover border border-emerald-300"
                            />
                            <div className="flex-1 text-xs">
                              <p className="font-bold text-emerald-900 flex items-center gap-1">
                                <CheckCircle2 className="size-3.5 text-emerald-600" /> Photo Uploaded
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">Stored on Vercel Blob</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => photoInputRef.current?.click()}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={uploadingPhoto}
                            onClick={() => photoInputRef.current?.click()}
                            className="w-full flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-4 hover:border-slate-400 hover:bg-slate-100/50 transition cursor-pointer"
                          >
                            <Camera className="size-6 text-slate-400" />
                            <span className="text-xs font-bold text-slate-700">
                              {uploadingPhoto ? 'Uploading to Vercel Blob...' : 'Click to Upload Renter Photo'}
                            </span>
                            <span className="text-[10px] text-slate-400">JPG, PNG, WEBP up to 10MB</span>
                          </button>
                        )}
                      </div>

                      {/* Mandatory Fields */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-800 mb-1">
                            Renter Full Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={renterName}
                            onChange={(e) => setRenterName(e.target.value)}
                            placeholder="e.g. Kazi Nazrul Islam"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-slate-950 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-800 mb-1">
                            Mobile Number *
                          </label>
                          <input
                            type="tel"
                            required
                            value={renterPhone}
                            onChange={(e) => setRenterPhone(e.target.value)}
                            placeholder="017XXXXXXXX"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 font-mono focus:border-slate-950 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-800 mb-1">
                            National ID (NID) *
                          </label>
                          <input
                            type="text"
                            required
                            value={renterNid}
                            onChange={(e) => setRenterNid(e.target.value)}
                            placeholder="NID number"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 font-mono focus:border-slate-950 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-800 mb-1">
                            Monthly Rent (BDT) *
                          </label>
                          <input
                            type="number"
                            required
                            min="0"
                            value={renterRent}
                            onChange={(e) => setRenterRent(e.target.value)}
                            placeholder="e.g. 12000"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-slate-950 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Optional Partner & Address Fields */}
                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                          Optional Information (Partner & Address)
                        </p>

                        <div className="grid grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Partner Name
                            </label>
                            <input
                              type="text"
                              value={partnerName}
                              onChange={(e) => setPartnerName(e.target.value)}
                              placeholder="Spouse / Partner"
                              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-950 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Partner Phone
                            </label>
                            <input
                              type="tel"
                              value={partnerPhone}
                              onChange={(e) => setPartnerPhone(e.target.value)}
                              placeholder="Mobile"
                              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:border-slate-950 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Partner NID
                            </label>
                            <input
                              type="text"
                              value={partnerNid}
                              onChange={(e) => setPartnerNid(e.target.value)}
                              placeholder="Partner NID"
                              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:border-slate-950 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="mt-3">
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Renter Permanent Address
                          </label>
                          <input
                            type="text"
                            value={permanentAddress}
                            onChange={(e) => setPermanentAddress(e.target.value)}
                            placeholder="Village, Upazila, District"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-slate-950 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Optional Document Uploads (NID Front / Back) */}
                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                          Optional Document Uploads (Vercel Blob)
                        </p>
                        <input
                          ref={nidFrontInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => onDocSelected(e, 'front')}
                        />
                        <input
                          ref={nidBackInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => onDocSelected(e, 'back')}
                        />

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            {nidFrontUrl ? (
                              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs">
                                <img src={nidFrontUrl} alt="NID Front" className="size-10 rounded-lg object-cover" />
                                <span className="font-medium text-slate-700 truncate">NID Front ✓</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={uploadingDoc === 'front'}
                                onClick={() => nidFrontInputRef.current?.click()}
                                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                              >
                                <Upload className="size-3.5" />
                                {uploadingDoc === 'front' ? 'Uploading...' : 'Upload NID Front'}
                              </button>
                            )}
                          </div>

                          <div>
                            {nidBackUrl ? (
                              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs">
                                <img src={nidBackUrl} alt="NID Back" className="size-10 rounded-lg object-cover" />
                                <span className="font-medium text-slate-700 truncate">NID Back ✓</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={uploadingDoc === 'back'}
                                onClick={() => nidBackInputRef.current?.click()}
                                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                              >
                                <Upload className="size-3.5" />
                                {uploadingDoc === 'back' ? 'Uploading...' : 'Upload NID Back'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {renterMessage && (
                        <div
                          className={`rounded-xl p-3 text-xs font-medium ${
                            renterMessage.isError
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {renterMessage.text}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={savingRenter}
                        className="w-full rounded-full bg-slate-950 py-3 text-sm font-semibold text-white shadow-xs hover:bg-slate-800 transition disabled:opacity-50"
                      >
                        {savingRenter ? 'Adding Renter...' : 'Add Renter & Assign to Room'}
                      </button>
                    </form>
                  )}

                  {/* Room Past Renters History */}
                  <div className="pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2 mb-3">
                      <History className="size-4 text-slate-400" />
                      <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Past Renters History ({activeRoom.pastResidents?.length || 0})
                      </h5>
                    </div>

                    {activeRoom.pastResidents && activeRoom.pastResidents.length > 0 ? (
                      <div className="space-y-2.5">
                        {activeRoom.pastResidents.map((pr) => (
                          <div
                            key={pr._id}
                            className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white p-3 text-xs"
                          >
                            <div className="flex items-center gap-3">
                              {pr.photoUrl ? (
                                <img
                                  src={pr.photoUrl}
                                  alt={pr.fullName}
                                  className="size-10 rounded-xl object-cover border border-slate-200"
                                />
                              ) : (
                                <div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 font-bold">
                                  {pr.fullName.charAt(0)}
                                </div>
                              )}
                              <div>
                                <p className="font-bold text-slate-800">{pr.fullName}</p>
                                <p className="text-[11px] text-slate-400 font-mono">{pr.phone}</p>
                              </div>
                            </div>
                            <div className="text-right text-[11px] text-slate-500">
                              <span className="rounded bg-slate-100 px-1.5 py-0.5">Vacated</span>
                              <p className="mt-1 text-[10px] text-slate-400 font-mono">
                                {pr.moveInDate} → {pr.moveOutDate || 'Vacated'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No previous renters on record for this room.</p>
                    )}
                  </div>
                </div>
              )}

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

              {/* TAB 4: COLLECT PAYMENT & ADVANCE DEPOSIT */}
              {drawerTab === 'payment' && (
                <div className="space-y-4">
                  {/* Balance & Advance Overview */}
                  <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/50 p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                        <CreditCard className="size-4 text-emerald-600" />
                        <span>Payment & Advance Balance</span>
                      </div>
                      <span className="text-[11px] text-emerald-700 font-mono">
                        {selectedMonth}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200/60">
                      <div className="bg-white/80 rounded-xl p-2.5 border border-emerald-200/50">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Bill Remaining Due</span>
                        <span className="text-sm font-bold text-rose-600">
                          ৳{activeRoom.bill?.remainingDue.toLocaleString() || '0'}
                        </span>
                      </div>
                      <div className="bg-white/80 rounded-xl p-2.5 border border-emerald-200/50">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Renter Advance Credit</span>
                        <span className="text-sm font-bold text-emerald-700">
                          ৳{(activeRoom.resident?.advanceBalance || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick-Apply Advance Balance if Available */}
                  {Boolean(
                    activeRoom.resident?.advanceBalance &&
                      activeRoom.resident.advanceBalance > 0 &&
                      activeRoom.bill &&
                      activeRoom.bill.remainingDue > 0,
                  ) && (
                    <div className="flex items-center justify-between rounded-2xl bg-emerald-50 border border-emerald-200 p-3">
                      <div>
                        <span className="text-xs font-bold text-emerald-900 block">
                          Apply Advance Credit
                        </span>
                        <span className="text-[11px] text-emerald-700/90">
                          Deduct up to ৳
                          {Math.min(
                            activeRoom.resident?.advanceBalance || 0,
                            activeRoom.bill?.remainingDue || 0,
                          ).toLocaleString()}{' '}
                          from renter balance
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={applyingAdvance}
                        onClick={handleApplyAdvance}
                        className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition disabled:opacity-50"
                      >
                        {applyingAdvance ? 'Applying...' : 'Apply Credit Now'}
                      </button>
                    </div>
                  )}

                  {/* Payment Type Selector */}
                  <div className="flex rounded-2xl bg-slate-100 p-1 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setPayMode('bill')
                        if (activeRoom.bill && activeRoom.bill.remainingDue > 0) {
                          setPayAmount(String(activeRoom.bill.remainingDue))
                        }
                      }}
                      className={`flex-1 rounded-xl py-2 transition text-center ${
                        payMode === 'bill'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      📄 Regular Bill Payment
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPayMode('advance')
                        setPayAmount('')
                      }}
                      className={`flex-1 rounded-xl py-2 transition text-center ${
                        payMode === 'advance'
                          ? 'bg-white text-emerald-700 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      💰 Advance Payment Deposit
                    </button>
                  </div>

                  {/* Payment Form */}
                  <form onSubmit={handleRecordPayment} className="space-y-4">
                    {payMode === 'advance' ? (
                      <div className="rounded-xl bg-amber-50 border border-amber-200/80 p-2.5 text-[11px] text-amber-800 leading-relaxed">
                        Recording an <strong>Advance Payment</strong> deposits the money directly into this renter&apos;s advance credit account. You can apply it towards future bills anytime.
                      </div>
                    ) : (
                      <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-2.5 text-[11px] text-slate-600 leading-relaxed">
                        Recording a <strong>Bill Payment</strong> clears current/previous dues. Any amount exceeding total outstanding is automatically stored in the renter&apos;s Advance Balance.
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {payMode === 'advance' ? 'Advance Amount (BDT) *' : 'Amount Received (BDT) *'}
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
                          placeholder="Enter payment amount"
                          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-8 pr-3 text-sm font-bold text-slate-900 focus:border-slate-950 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
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
                        Reference / Note (optional)
                      </label>
                      <input
                        type="text"
                        value={payRef}
                        onChange={(e) => setPayRef(e.target.value)}
                        placeholder="e.g. TrxID / Advance deposit for next month"
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
                      disabled={savingPayment || !activeRoom.resident || (payMode === 'bill' && !activeRoom.bill)}
                      className={`w-full rounded-full py-3 text-sm font-semibold text-white shadow-xs transition disabled:opacity-50 ${
                        payMode === 'advance'
                          ? 'bg-emerald-700 hover:bg-emerald-800'
                          : 'bg-slate-950 hover:bg-slate-800'
                      }`}
                    >
                      {savingPayment
                        ? 'Recording...'
                        : payMode === 'advance'
                        ? 'Deposit Advance Payment Now'
                        : 'Record Bill Payment Now'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
