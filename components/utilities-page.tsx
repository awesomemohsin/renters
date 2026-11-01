'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  CircleDollarSign,
  FileCheck2,
  Gauge,
  Lock,
  MapPin,
  Pencil,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Unlock,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatBillingMonth, formatCurrency, formatRoomNumber } from '@/lib/utils'

type RoomRef = {
  _id: string
  roomNumber: number
  floor: number
  status: 'occupied' | 'vacant'
  currentResident: string | null
}

type MainMeter = {
  _id: string
  slotNumber: number
  name: string
  meterNumber: string | null
  location: string
  description: string
  assignedRooms: RoomRef[]
  status: 'active' | 'inactive'
  createdAt?: string
}

type SubMeter = {
  _id: string
  roomId: RoomRef
  roomNumber: number
  meterNumber: string | null
  location: string
  installationDate: string
  status: 'active' | 'inactive'
  description: string
}

type ConfigSummary = {
  totalMainMeters: number
  activeMainMeters: number
  totalSubMeters: number
  activeSubMeters: number
  assignedRooms: number
  unassignedRooms: number
}

type MainMeterForm = {
  name: string
  meterNumber: string
  location: string
  description: string
  status: 'active' | 'inactive'
  assignedRooms: string[]
}

type SubMeterForm = {
  meterNumber: string
  location: string
  installationDate: string
  status: 'active' | 'inactive'
  description: string
}

type SavedReading = {
  _id: string
  billingMonth: string
  roomId: string
  roomNumber: number
  previousReading: number
  currentReading: number
  consumption: number
  isOpeningReading: boolean
  readingDate: string
  status: 'draft' | 'finalized'
}

type SavedAllocation = {
  _id: string
  billingMonth: string
  roomId: string
  roomNumber: number
  floor: number
  residentName: string | null
  isVacant: boolean
  mainMeterName: string
  consumption: number
  mainMeterTotalConsumption: number
  mainMeterBillAmount: number
  mainMeterShare: number
  additionalChargeRate: number
  additionalCharge: number
  finalElectricityAmount: number
  status: 'draft' | 'finalized'
}

type MonthlyRoomRow = {
  roomId: string
  roomNumber: number
  floor: number
  roomStatus: 'occupied' | 'vacant'
  residentId: string | null
  residentName: string | null
  isVacant: boolean
  subMeterId: string | null
  subMeterNumber: string | null
  mainMeterId: string | null
  mainMeterName: string | null
  hasPriorReading: boolean
  priorReadingMonth: string | null
  autoPreviousReading: number | null
  reading: SavedReading | null
  allocation: SavedAllocation | null
}

type SavedBill = {
  _id: string
  billingMonth: string
  mainMeterId: string
  slotNumber: number
  mainMeterName: string
  totalConsumption: number
  billAmount: number
  billDate: string
  billReference: string
  status: 'draft' | 'finalized'
}

type MonthlyMainMeterRow = {
  mainMeterId: string
  slotNumber: number
  name: string
  meterNumber: string | null
  location: string
  status: 'active' | 'inactive'
  assignedRooms: {
    roomId: string
    roomNumber: number
    floor: number
    hasReading: boolean
    consumption: number | null
  }[]
  missingReadingRooms: number[]
  allReadingsComplete: boolean
  totalConsumption: number
  bill: SavedBill | null
  distributionStatus:
    | 'distributed'
    | 'missing_rooms'
    | 'missing_readings'
    | 'missing_bill'
    | 'zero_consumption'
    | 'inactive'
  distributionWarning: string
}

type AuditLogEntry = {
  action: 'finalized' | 'reopened_for_correction' | 'rate_updated'
  timestamp: string
  reason: string
  totalMainMeterBills: number
  totalConsumption: number
  totalAdditionalCharges: number
  totalFinalAmount: number
}

type MonthlyWorkspace = {
  billingMonth: string
  availableMonths: string[]
  cycle: {
    billingMonth: string
    additionalChargeRate: number
    status: 'draft' | 'finalized'
    finalizedAt: string | null
    lastCorrectionReason: string
    auditLog: AuditLogEntry[]
  }
  roomRows: MonthlyRoomRow[]
  mainMeterRows: MonthlyMainMeterRow[]
  allocations: SavedAllocation[]
  warnings: string[]
  canFinalize: boolean
  summary: {
    totalMainMeterBills: number
    totalSubMeterConsumption: number
    totalAdditionalCharges: number
    totalMainMeterShareDistributed: number
    totalElectricityAmountDistributed: number
    roomsWithCompletedReadings: number
    roomsWithMissingReadings: number
    mainMetersWithCompletedBills: number
    mainMetersPendingBills: number
    activeMainMetersWithRooms: number
    additionalChargeRate: number
  }
}

type ReadingInputState = {
  previousReading: string
  currentReading: string
  readingDate: string
}

type BillInputState = {
  billAmount: string
  billDate: string
  billReference: string
}

const floors = [
  { value: 0, label: 'All floors' },
  { value: 1, label: '1st floor' },
  { value: 2, label: '2nd floor' },
  { value: 3, label: '3rd floor' },
  { value: 4, label: '4th floor' },
  { value: 5, label: '5th floor' },
]

const formatDate = (iso?: string | null) => (iso ? iso.slice(0, 10) : '—')

export function UtilitiesPage() {
  // Section 1: Meter Configuration state
  const [mainMeters, setMainMeters] = useState<MainMeter[]>([])
  const [subMeters, setSubMeters] = useState<SubMeter[]>([])
  const [rooms, setRooms] = useState<RoomRef[]>([])
  const [configSummary, setConfigSummary] = useState<ConfigSummary>({
    totalMainMeters: 10,
    activeMainMeters: 10,
    totalSubMeters: 26,
    activeSubMeters: 26,
    assignedRooms: 0,
    unassignedRooms: 26,
  })
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [pageError, setPageError] = useState('')

  // Sub-meter filters
  const [search, setSearch] = useState('')
  const [selectedFloor, setSelectedFloor] = useState(0)

  // Main meter modal state
  const [editingMainMeter, setEditingMainMeter] = useState<MainMeter | null>(null)
  const [mainMeterForm, setMainMeterForm] = useState<MainMeterForm | null>(null)
  const [mainMeterError, setMainMeterError] = useState('')
  const [savingMainMeter, setSavingMainMeter] = useState(false)
  const [busyMeterId, setBusyMeterId] = useState<string | null>(null)

  // Sub-meter modal state
  const [editingSubMeter, setEditingSubMeter] = useState<SubMeter | null>(null)
  const [subMeterForm, setSubMeterForm] = useState<SubMeterForm | null>(null)
  const [subMeterError, setSubMeterError] = useState('')
  const [savingSubMeter, setSavingSubMeter] = useState(false)

  // Monthly Electricity Workspace state (Sections 2 & 3)
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [monthlyData, setMonthlyData] = useState<MonthlyWorkspace | null>(null)
  const [loadingMonthly, setLoadingMonthly] = useState(true)
  const [monthlyError, setMonthlyError] = useState('')
  const [monthlyNotice, setMonthlyNotice] = useState('')

  const [readingInputs, setReadingInputs] = useState<Record<string, ReadingInputState>>({})
  const [savingReadingRoomId, setSavingReadingRoomId] = useState<string | null>(null)
  const [savingAllReadings, setSavingAllReadings] = useState(false)
  const [showMissingReadingsOnly, setShowMissingReadingsOnly] = useState(false)
  const [readingFloorFilter, setReadingFloorFilter] = useState(0)

  const [billInputs, setBillInputs] = useState<Record<string, BillInputState>>({})
  const [savingBillMeterId, setSavingBillMeterId] = useState<string | null>(null)
  const [savingAllBills, setSavingAllBills] = useState(false)

  const [rateInput, setRateInput] = useState('1')
  const [savingRate, setSavingRate] = useState(false)

  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false)
  const [finalizing, setFinalizing] = useState(false)

  const [reopenModalOpen, setReopenModalOpen] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [reopening, setReopening] = useState(false)

  const syncMonthlyInputs = (workspace: MonthlyWorkspace) => {
    const today = new Date().toISOString().slice(0, 10)
    const nextReadings: Record<string, ReadingInputState> = {}
    for (const row of workspace.roomRows) {
      const prevVal = row.hasPriorReading
        ? String(row.autoPreviousReading ?? 0)
        : row.reading
          ? String(row.reading.previousReading)
          : ''
      const currVal = row.reading ? String(row.reading.currentReading) : ''
      const dateVal = row.reading?.readingDate || today
      nextReadings[row.roomId] = {
        previousReading: prevVal,
        currentReading: currVal,
        readingDate: dateVal,
      }
    }
    setReadingInputs(nextReadings)

    const nextBills: Record<string, BillInputState> = {}
    for (const mRow of workspace.mainMeterRows) {
      nextBills[mRow.mainMeterId] = {
        billAmount: mRow.bill ? String(mRow.bill.billAmount) : '',
        billDate: mRow.bill?.billDate || today,
        billReference: mRow.bill?.billReference ?? '',
      }
    }
    setBillInputs(nextBills)
    setRateInput(String(workspace.cycle.additionalChargeRate ?? 1))
  }

  const loadMonthlyWorkspace = async (month = selectedMonth) => {
    setLoadingMonthly(true)
    try {
      const response = await fetch(`/api/utilities/monthly?month=${encodeURIComponent(month)}`)
      const data = await response.json()
      if (!response.ok) {
        setMonthlyError(data.error ?? 'Unable to load monthly electricity workspace.')
      } else {
        setMonthlyData(data)
        syncMonthlyInputs(data)
        setMonthlyError('')
      }
    } catch {
      setMonthlyError('Unable to load monthly electricity workspace.')
    } finally {
      setLoadingMonthly(false)
    }
  }

  const loadUtilities = async () => {
    try {
      const response = await fetch('/api/utilities')
      const data = await response.json()
      if (!response.ok) {
        setPageError(data.error ?? 'Unable to load electricity meters.')
      } else {
        setMainMeters(data.mainMeters ?? [])
        setSubMeters(data.subMeters ?? [])
        setRooms(data.rooms ?? [])
        if (data.summary) setConfigSummary(data.summary)
        setPageError('')
      }
    } catch {
      setPageError('Unable to load electricity meters.')
    } finally {
      setLoadingConfig(false)
    }
  }

  useEffect(() => {
    loadUtilities()
  }, [])

  useEffect(() => {
    loadMonthlyWorkspace(selectedMonth)
  }, [selectedMonth])

  // Map room._id -> active MainMeter that owns it
  const roomToMainMeterMap = useMemo(() => {
    const map = new Map<string, MainMeter>()
    for (const meter of mainMeters) {
      if (meter.status === 'active') {
        for (const room of meter.assignedRooms) {
          map.set(room._id, meter)
        }
      }
    }
    return map
  }, [mainMeters])

  const unassignedRoomsList = useMemo(
    () => rooms.filter((room) => !roomToMainMeterMap.has(room._id)),
    [rooms, roomToMainMeterMap],
  )

  const filteredSubMeters = useMemo(() => {
    const q = search.trim().toLowerCase()
    return subMeters.filter((sub) => {
      const floor = sub.roomId?.floor ?? 0
      if (selectedFloor && floor !== selectedFloor) return false
      if (!q) return true

      const paddedRoom = formatRoomNumber(sub.roomNumber)
      const roomLabel = `room ${paddedRoom}`
      const meterNum = (sub.meterNumber ?? '').toLowerCase()
      const loc = (sub.location ?? '').toLowerCase()
      const assignedMain = (roomToMainMeterMap.get(sub.roomId?._id)?.name ?? 'unassigned').toLowerCase()

      return (
        paddedRoom.includes(q) ||
        String(sub.roomNumber) === q ||
        roomLabel.includes(q) ||
        meterNum.includes(q) ||
        loc.includes(q) ||
        assignedMain.includes(q)
      )
    })
  }, [subMeters, selectedFloor, search, roomToMainMeterMap])

  const filteredReadingRows = useMemo(() => {
    if (!monthlyData) return []
    return monthlyData.roomRows.filter((row) => {
      if (readingFloorFilter && row.floor !== readingFloorFilter) return false
      if (showMissingReadingsOnly && row.reading) return false
      return true
    })
  }, [monthlyData, readingFloorFilter, showMissingReadingsOnly])

  const openMainMeterModal = (meter: MainMeter) => {
    setEditingMainMeter(meter)
    setMainMeterForm({
      name: meter.name,
      meterNumber: meter.meterNumber ?? '',
      location: meter.location ?? '',
      description: meter.description ?? '',
      status: meter.status,
      assignedRooms: meter.assignedRooms.map((room) => room._id),
    })
    setMainMeterError('')
  }

  const toggleRoomInModal = (roomId: string) => {
    if (!mainMeterForm || mainMeterForm.status === 'inactive') return
    setMainMeterForm((current) => {
      if (!current) return current
      const exists = current.assignedRooms.includes(roomId)
      return {
        ...current,
        assignedRooms: exists
          ? current.assignedRooms.filter((id) => id !== roomId)
          : [...current.assignedRooms, roomId],
      }
    })
  }

  const saveMainMeter = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editingMainMeter || !mainMeterForm) return
    setSavingMainMeter(true)
    setMainMeterError('')

    const response = await fetch(`/api/utilities/main-meters/${editingMainMeter._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: mainMeterForm.name,
        meterNumber: mainMeterForm.meterNumber,
        location: mainMeterForm.location,
        description: mainMeterForm.description,
        status: mainMeterForm.status,
        assignedRooms: mainMeterForm.status === 'inactive' ? [] : mainMeterForm.assignedRooms,
      }),
    })
    const data = await response.json()
    if (!response.ok) {
      setMainMeterError(data.error ?? 'Unable to update main meter.')
    } else {
      setEditingMainMeter(null)
      setMainMeterForm(null)
      await Promise.all([loadUtilities(), loadMonthlyWorkspace(selectedMonth)])
    }
    setSavingMainMeter(false)
  }

  const quickUnassignRoom = async (meter: MainMeter, roomIdToRemove: string) => {
    setBusyMeterId(meter._id)
    setPageError('')
    const nextRoomIds = meter.assignedRooms.filter((r) => r._id !== roomIdToRemove).map((r) => r._id)
    const response = await fetch(`/api/utilities/main-meters/${meter._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedRooms: nextRoomIds }),
    })
    const data = await response.json()
    if (!response.ok) {
      setPageError(data.error ?? 'Unable to remove room assignment.')
    } else {
      await Promise.all([loadUtilities(), loadMonthlyWorkspace(selectedMonth)])
    }
    setBusyMeterId(null)
  }

  const openSubMeterModal = (subMeter: SubMeter) => {
    setEditingSubMeter(subMeter)
    setSubMeterForm({
      meterNumber: subMeter.meterNumber ?? '',
      location: subMeter.location ?? '',
      installationDate: subMeter.installationDate ?? '',
      status: subMeter.status,
      description: subMeter.description ?? '',
    })
    setSubMeterError('')
  }

  const saveSubMeter = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editingSubMeter || !subMeterForm) return
    setSavingSubMeter(true)
    setSubMeterError('')

    const response = await fetch(`/api/utilities/sub-meters/${editingSubMeter._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subMeterForm),
    })
    const data = await response.json()
    if (!response.ok) {
      setSubMeterError(data.error ?? 'Unable to update sub-meter.')
    } else {
      setEditingSubMeter(null)
      setSubMeterForm(null)
      await Promise.all([loadUtilities(), loadMonthlyWorkspace(selectedMonth)])
    }
    setSavingSubMeter(false)
  }

  // Monthly Reading Handlers
  const updateReadingInput = (roomId: string, field: keyof ReadingInputState, value: string) => {
    setReadingInputs((current) => ({
      ...current,
      [roomId]: {
        ...(current[roomId] ?? { previousReading: '', currentReading: '', readingDate: '' }),
        [field]: value,
      },
    }))
  }

  const saveSingleReading = async (row: MonthlyRoomRow) => {
    const input = readingInputs[row.roomId]
    if (!input) return
    setSavingReadingRoomId(row.roomId)
    setMonthlyError('')
    setMonthlyNotice('')

    const response = await fetch('/api/utilities/readings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billingMonth: selectedMonth,
        roomId: row.roomId,
        previousReading: row.hasPriorReading ? undefined : input.previousReading,
        currentReading: input.currentReading,
        readingDate: input.readingDate,
      }),
    })
    const data = await response.json()
    if (!response.ok) {
      setMonthlyError(data.error ?? 'Unable to save reading.')
    } else {
      setMonthlyData(data)
      syncMonthlyInputs(data)
      setMonthlyNotice(`Saved reading for Room ${formatRoomNumber(row.roomNumber)}.`)
    }
    setSavingReadingRoomId(null)
  }

  const saveBatchReadings = async () => {
    if (!monthlyData) return
    const entries = monthlyData.roomRows
      .filter((row) => {
        const input = readingInputs[row.roomId]
        if (!input || input.currentReading === '') return false
        if (!row.hasPriorReading && input.previousReading === '') return false
        return true
      })
      .map((row) => {
        const input = readingInputs[row.roomId]!
        return {
          roomId: row.roomId,
          previousReading: row.hasPriorReading ? undefined : input.previousReading,
          currentReading: input.currentReading,
          readingDate: input.readingDate,
        }
      })

    if (entries.length === 0) {
      setMonthlyError('Enter at least one room reading before saving.')
      return
    }

    setSavingAllReadings(true)
    setMonthlyError('')
    setMonthlyNotice('')

    const response = await fetch('/api/utilities/readings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billingMonth: selectedMonth,
        entries,
      }),
    })
    const data = await response.json()
    if (!response.ok) {
      setMonthlyError(data.error ?? 'Unable to save readings.')
    } else {
      setMonthlyData(data)
      syncMonthlyInputs(data)
      setMonthlyNotice(`Saved ${entries.length} room sub-meter reading(s) for ${formatBillingMonth(selectedMonth)}.`)
    }
    setSavingAllReadings(false)
  }

  // Main Meter Bill Handlers
  const updateBillInput = (mainMeterId: string, field: keyof BillInputState, value: string) => {
    setBillInputs((current) => ({
      ...current,
      [mainMeterId]: {
        ...(current[mainMeterId] ?? { billAmount: '', billDate: '', billReference: '' }),
        [field]: value,
      },
    }))
  }

  const saveSingleBill = async (mRow: MonthlyMainMeterRow) => {
    const input = billInputs[mRow.mainMeterId]
    if (!input) return
    setSavingBillMeterId(mRow.mainMeterId)
    setMonthlyError('')
    setMonthlyNotice('')

    const response = await fetch('/api/utilities/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billingMonth: selectedMonth,
        mainMeterId: mRow.mainMeterId,
        billAmount: input.billAmount,
        billDate: input.billDate,
        billReference: input.billReference,
      }),
    })
    const data = await response.json()
    if (!response.ok) {
      setMonthlyError(data.error ?? 'Unable to save main meter bill.')
    } else {
      setMonthlyData(data)
      syncMonthlyInputs(data)
      setMonthlyNotice(`Saved bill and distributed shares for ${mRow.name}.`)
    }
    setSavingBillMeterId(null)
  }

  const saveBatchBills = async () => {
    if (!monthlyData) return
    const entries = monthlyData.mainMeterRows
      .filter((mRow) => {
        const input = billInputs[mRow.mainMeterId]
        return (
          mRow.status === 'active' &&
          mRow.assignedRooms.length > 0 &&
          mRow.allReadingsComplete &&
          mRow.totalConsumption > 0 &&
          input &&
          input.billAmount !== ''
        )
      })
      .map((mRow) => {
        const input = billInputs[mRow.mainMeterId]!
        return {
          mainMeterId: mRow.mainMeterId,
          billAmount: input.billAmount,
          billDate: input.billDate,
          billReference: input.billReference,
        }
      })

    if (entries.length === 0) {
      setMonthlyError('Enter at least one eligible main meter bill before saving.')
      return
    }

    setSavingAllBills(true)
    setMonthlyError('')
    setMonthlyNotice('')

    const response = await fetch('/api/utilities/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billingMonth: selectedMonth,
        entries,
      }),
    })
    const data = await response.json()
    if (!response.ok) {
      setMonthlyError(data.error ?? 'Unable to save main meter bills.')
    } else {
      setMonthlyData(data)
      syncMonthlyInputs(data)
      setMonthlyNotice(`Saved ${entries.length} main meter bill(s) and updated room allocations.`)
    }
    setSavingAllBills(false)
  }

  const saveAdditionalRate = async (event: React.FormEvent) => {
    event.preventDefault()
    setSavingRate(true)
    setMonthlyError('')
    setMonthlyNotice('')

    const response = await fetch('/api/utilities/monthly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set_rate',
        billingMonth: selectedMonth,
        additionalChargeRate: Number(rateInput),
      }),
    })
    const data = await response.json()
    if (!response.ok) {
      setMonthlyError(data.error ?? 'Unable to update additional per-unit charge rate.')
    } else {
      setMonthlyData(data)
      syncMonthlyInputs(data)
      setMonthlyNotice(`Updated additional per-unit charge rate to ৳${data.cycle.additionalChargeRate}/unit.`)
    }
    setSavingRate(false)
  }

  const confirmFinalizeMonth = async () => {
    setFinalizing(true)
    setMonthlyError('')
    setMonthlyNotice('')

    const response = await fetch('/api/utilities/monthly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'finalize',
        billingMonth: selectedMonth,
      }),
    })
    const data = await response.json()
    if (!response.ok) {
      setMonthlyError(data.error ?? 'Unable to finalize billing month.')
      setFinalizeConfirmOpen(false)
    } else {
      setMonthlyData(data)
      syncMonthlyInputs(data)
      setFinalizeConfirmOpen(false)
      setMonthlyNotice(`${formatBillingMonth(selectedMonth)} electricity calculations have been finalized and locked.`)
    }
    setFinalizing(false)
  }

  const confirmReopenMonth = async (event: React.FormEvent) => {
    event.preventDefault()
    setReopening(true)
    setMonthlyError('')
    setMonthlyNotice('')

    const response = await fetch('/api/utilities/monthly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reopen',
        billingMonth: selectedMonth,
        reason: reopenReason,
      }),
    })
    const data = await response.json()
    if (!response.ok) {
      setMonthlyError(data.error ?? 'Unable to reopen billing month.')
    } else {
      setMonthlyData(data)
      syncMonthlyInputs(data)
      setReopenModalOpen(false)
      setReopenReason('')
      setMonthlyNotice(`${formatBillingMonth(selectedMonth)} reopened for controlled correction. Audit log recorded.`)
    }
    setReopening(false)
  }

  const configCards: { label: string; value: number; detail: string; icon: LucideIcon }[] = [
    {
      label: 'Total Main Meters',
      value: configSummary.totalMainMeters,
      detail: `${configSummary.activeMainMeters} active meters`,
      icon: Zap,
    },
    {
      label: 'Total Sub-Meters',
      value: configSummary.totalSubMeters,
      detail: `${configSummary.activeSubMeters} active across 5 floors`,
      icon: Gauge,
    },
    {
      label: 'Assigned Rooms',
      value: configSummary.assignedRooms,
      detail: 'Linked to active main meters',
      icon: CheckCircle2,
    },
    {
      label: 'Unassigned Rooms',
      value: configSummary.unassignedRooms,
      detail: 'Awaiting main meter assignment',
      icon: CircleAlert,
    },
  ]

  const isFinalized = monthlyData?.cycle.status === 'finalized'
  const appliedRate = monthlyData?.cycle.additionalChargeRate ?? 1

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
            <Zap aria-hidden="true" className="size-3.5" /> Electricity workspace
          </div>
          <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
            Main meters &amp; room sub-meters.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
            Configure building meters and room assignments, record monthly sub-meter readings, and automatically distribute main meter electricity bills.
          </p>
        </div>

        <nav aria-label="Utilities sections" className="flex flex-wrap gap-2">
          <a
            href="#section-meter-config"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            1. Meter Configuration
          </a>
          <a
            href="#section-monthly-readings"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            2. Monthly Readings
          </a>
          <a
            href="#section-bills-distribution"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            3. Bills &amp; Distribution
          </a>
        </nav>
      </section>

      <section aria-label="Electricity meter summary" className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {configCards.map((card) => {
          const Icon = card.icon
          return (
            <article
              key={card.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <Icon aria-hidden="true" className="size-5" />
              </div>
              <p className="mt-7 text-sm text-slate-500">{card.label}</p>
              <div className="mt-1 flex items-baseline gap-2">
                <p className="text-2xl font-semibold tracking-tight">{card.value}</p>
                <p className="text-xs text-slate-400">{card.detail}</p>
              </div>
            </article>
          )
        })}
      </section>

      {pageError && <p className="mt-4 text-sm text-red-600">{pageError}</p>}

      {/* ===================================================================== */}
      {/* SECTION 1: METER CONFIGURATION                                        */}
      {/* ===================================================================== */}
      <div id="section-meter-config" className="scroll-mt-24">
        {/* Unassigned Rooms Overview */}
        <section
          aria-label="Unassigned rooms"
          className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
        >
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Unassigned rooms ({unassignedRoomsList.length} of {rooms.length})
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Every room can belong to only one active main meter. Click &ldquo;Manage meter&rdquo; on any active main meter below to assign rooms.
              </p>
            </div>
            <span
              className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                unassignedRoomsList.length === 0
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-800'
              }`}
            >
              {unassignedRoomsList.length === 0
                ? 'All 26 rooms assigned'
                : `${unassignedRoomsList.length} unassigned`}
            </span>
          </div>

          {unassignedRoomsList.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {unassignedRoomsList.map((room) => (
                <span
                  key={room._id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1 text-xs font-medium text-amber-900"
                >
                  Room {formatRoomNumber(room.roomNumber)}
                  <span className="text-amber-700/80">· F{room.floor}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-emerald-600">
              All 26 rooms are currently assigned to active main meters.
            </p>
          )}
        </section>

        {/* Main Meters */}
        <section aria-labelledby="main-meters-heading" className="mt-10">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <h3 id="main-meters-heading" className="text-xl font-semibold tracking-tight text-slate-950">
                1A. Main Meters (10)
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                10 building main meters. Edit serial numbers, locations, status, and room assignments.
              </p>
            </div>
          </div>

          {loadingConfig ? (
            <p className="mt-6 text-sm text-slate-500">Loading main meters...</p>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {mainMeters.map((meter) => {
                const assignedCount = meter.assignedRooms.length
                return (
                  <article
                    key={meter._id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <h4 className="text-lg font-semibold tracking-tight text-slate-950">{meter.name}</h4>
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                meter.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              <span
                                className={`size-1.5 rounded-full ${
                                  meter.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'
                                }`}
                              />
                              {meter.status === 'active' ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            Meter No:{' '}
                            <span className="font-medium text-slate-700">
                              {meter.meterNumber || 'Not configured'}
                            </span>
                            {' · '}
                            Created {formatDate(meter.createdAt)}
                          </p>
                        </div>

                        <Button variant="outline" size="sm" onClick={() => openMainMeterModal(meter)}>
                          <SlidersHorizontal data-icon="inline-start" />
                          Manage meter
                        </Button>
                      </div>

                      <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                        <div className="flex items-center gap-1.5">
                          <MapPin aria-hidden="true" className="size-3.5 text-slate-400" />
                          <span>Location: {meter.location || 'Not set'}</span>
                        </div>
                        <div>
                          Assigned rooms:{' '}
                          <span className="font-semibold text-slate-800">
                            {assignedCount} {assignedCount === 1 ? 'room' : 'rooms'}
                          </span>
                        </div>
                      </div>

                      {meter.description && (
                        <p className="mt-2 text-xs text-slate-500">{meter.description}</p>
                      )}

                      <div className="mt-4 border-t border-slate-100 pt-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Assigned Room Numbers
                        </p>
                        {assignedCount > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {meter.assignedRooms.map((room) => (
                              <span
                                key={room._id}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-1 text-xs font-medium text-emerald-900"
                              >
                                Room {formatRoomNumber(room.roomNumber)}
                                <span className="text-emerald-700/80">· F{room.floor}</span>
                                <button
                                  type="button"
                                  disabled={busyMeterId === meter._id}
                                  onClick={() => quickUnassignRoom(meter, room._id)}
                                  aria-label={`Unassign Room ${formatRoomNumber(room.roomNumber)} from ${meter.name}`}
                                  className="ml-0.5 rounded p-0.5 text-emerald-700 hover:bg-emerald-200/60 hover:text-emerald-950 disabled:opacity-50"
                                >
                                  <X className="size-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-slate-400">No rooms assigned to this main meter.</p>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {/* Room Sub-Meters */}
        <section aria-labelledby="sub-meters-heading" className="mt-12">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h3 id="sub-meters-heading" className="text-xl font-semibold tracking-tight text-slate-950">
                1B. Room Sub-Meters (26)
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Individual sub-meter configurations for all 26 rooms across 5 floors.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2" aria-label="Filter sub-meters by floor">
              {floors.map((floor) => (
                <Button
                  key={floor.value}
                  variant={selectedFloor === floor.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedFloor(floor.value)}
                >
                  {floor.label}
                </Button>
              ))}
            </div>

            <label className="relative w-full lg:w-72">
              <Search aria-hidden="true" className="absolute left-3 top-2.5 size-4 text-slate-400" />
              <input
                aria-label="Search sub-meters by room, number, or location"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search room or sub-meter..."
                className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400"
              />
            </label>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-5 py-4">Room</th>
                    <th className="px-5 py-4">Floor</th>
                    <th className="px-5 py-4">Sub-Meter Number</th>
                    <th className="px-5 py-4">Location</th>
                    <th className="px-5 py-4">Main Meter</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSubMeters.map((sub) => {
                    const assignedMain = roomToMainMeterMap.get(sub.roomId?._id)
                    return (
                      <tr key={sub._id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 font-medium text-slate-900">
                          Room {formatRoomNumber(sub.roomNumber)}
                          {sub.installationDate && (
                            <p className="mt-0.5 text-xs font-normal text-slate-400">
                              Installed {sub.installationDate}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4 text-slate-600">Floor {sub.roomId?.floor ?? '—'}</td>
                        <td className="px-5 py-4 text-slate-700">
                          {sub.meterNumber || <span className="text-slate-400">Not set</span>}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {sub.location || <span className="text-slate-400">Not set</span>}
                          {sub.description && (
                            <p className="mt-0.5 text-xs text-slate-400">{sub.description}</p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {assignedMain ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                              <span className="size-1.5 rounded-full bg-emerald-500" />
                              {assignedMain.name}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                              <span className="size-1.5 rounded-full bg-amber-500" />
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={
                              sub.status === 'active'
                                ? 'font-medium text-emerald-600'
                                : 'text-slate-400'
                            }
                          >
                            {sub.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openSubMeterModal(sub)}
                            aria-label={`Edit sub-meter for Room ${formatRoomNumber(sub.roomNumber)}`}
                          >
                            <Pencil data-icon="inline-start" />
                            Edit
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                  {!loadingConfig && filteredSubMeters.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">
                        No sub-meters match the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {/* ===================================================================== */}
      {/* MONTHLY ELECTRICITY WORKSPACE HEADER & MONTH SELECTOR                 */}
      {/* ===================================================================== */}
      <section
        id="section-monthly-readings"
        aria-labelledby="monthly-workspace-heading"
        className="mt-14 scroll-mt-24 border-t border-slate-200 pt-12"
      >
        <div className="flex flex-col justify-between gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)] lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                <CalendarDays aria-hidden="true" className="size-3.5" />
                Monthly Electricity Workspace
              </span>
              {monthlyData && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                    isFinalized
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {isFinalized ? (
                    <>
                      <Lock className="size-3" /> Finalized ({formatDate(monthlyData.cycle.finalizedAt)})
                    </>
                  ) : (
                    <>
                      <Unlock className="size-3" /> Draft · Open for entry
                    </>
                  )}
                </span>
              )}
            </div>
            <h3 id="monthly-workspace-heading" className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
              {formatBillingMonth(selectedMonth)} Electricity Readings &amp; Billing
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Each month maintains independent sub-meter readings, main meter bills, and room-wise allocations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Select billing month
              <select
                aria-label="Select billing month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900"
              >
                {(monthlyData?.availableMonths ?? ['2026-10', '2026-11', '2026-12']).map((m) => (
                  <option key={m} value={m}>
                    {formatBillingMonth(m)} ({m})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Custom month
              <input
                aria-label="Custom billing month"
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  if (e.target.value) setSelectedMonth(e.target.value)
                }}
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
              />
            </label>
          </div>
        </div>

        {/* 5-Step Workflow Progress */}
        {monthlyData && (
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            {[
              {
                step: 'STEP 1',
                title: 'Sub-meter readings',
                detail: `${monthlyData.summary.roomsWithCompletedReadings}/26 rooms entered`,
                done: monthlyData.summary.roomsWithMissingReadings === 0,
              },
              {
                step: 'STEP 2',
                title: 'Verify consumption',
                detail: `${monthlyData.summary.totalSubMeterConsumption} total units`,
                done:
                  monthlyData.summary.roomsWithMissingReadings === 0 &&
                  monthlyData.summary.totalSubMeterConsumption > 0,
              },
              {
                step: 'STEP 3',
                title: 'Main meter bills',
                detail: `${monthlyData.summary.mainMetersWithCompletedBills}/${monthlyData.summary.activeMainMetersWithRooms} bills entered`,
                done:
                  monthlyData.summary.activeMainMetersWithRooms > 0 &&
                  monthlyData.summary.mainMetersPendingBills === 0,
              },
              {
                step: 'STEP 4',
                title: 'Room distribution',
                detail: `${monthlyData.allocations.length}/26 rooms allocated`,
                done: monthlyData.allocations.length === 26,
              },
              {
                step: 'STEP 5',
                title: 'Finalize month',
                detail: isFinalized ? 'Finalized & locked' : monthlyData.canFinalize ? 'Ready to finalize' : 'Pending steps 1–4',
                done: Boolean(isFinalized),
              },
            ].map((item) => (
              <div
                key={item.step}
                className={`rounded-xl border p-3.5 ${
                  item.done
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {item.step}
                  </span>
                  {item.done && <CheckCircle2 className="size-4 text-emerald-600" />}
                </div>
                <p className="mt-1.5 text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>
              </div>
            ))}
          </div>
        )}

        {monthlyError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {monthlyError}
          </div>
        )}

        {monthlyNotice && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {monthlyNotice}
          </div>
        )}

        {monthlyData && monthlyData.warnings.length > 0 && !isFinalized && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-900">
              <AlertTriangle className="size-4 text-amber-600" />
              Attention required before finalization
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">
              {monthlyData.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* =================================================================== */}
        {/* SECTION 2: MONTHLY SUB-METER READINGS                               */}
        {/* =================================================================== */}
        <div className="mt-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h4 className="text-xl font-semibold tracking-tight text-slate-950">
                2. Monthly Sub-Meter Readings ({formatBillingMonth(selectedMonth)})
              </h4>
              <p className="mt-1 text-sm text-slate-500">
                Previous readings are retrieved automatically from the last recorded month. For a room&apos;s first month, enter its opening reading.
              </p>
            </div>

            {!isFinalized && (
              <Button onClick={saveBatchReadings} disabled={savingAllReadings || loadingMonthly}>
                <Save data-icon="inline-start" />
                {savingAllReadings ? 'Saving all readings...' : 'Save all entered readings'}
              </Button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {floors.map((f) => (
                <Button
                  key={f.value}
                  variant={readingFloorFilter === f.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setReadingFloorFilter(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-3 text-xs">
              <label className="inline-flex cursor-pointer items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={showMissingReadingsOnly}
                  onChange={(e) => setShowMissingReadingsOnly(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Show rooms with missing readings only ({monthlyData?.summary.roomsWithMissingReadings ?? 0})
              </label>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3.5">Room</th>
                    <th className="px-4 py-3.5">Floor</th>
                    <th className="px-4 py-3.5">Resident</th>
                    <th className="px-4 py-3.5">Previous Reading</th>
                    <th className="px-4 py-3.5">Current Reading</th>
                    <th className="px-4 py-3.5">Consumption</th>
                    <th className="px-4 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReadingRows.map((row) => {
                    const input = readingInputs[row.roomId] ?? {
                      previousReading: '',
                      currentReading: '',
                      readingDate: '',
                    }
                    const prevNum = row.hasPriorReading
                      ? (row.autoPreviousReading ?? 0)
                      : input.previousReading === ''
                        ? NaN
                        : Number(input.previousReading)
                    const currNum = input.currentReading === '' ? NaN : Number(input.currentReading)
                    const hasBoth = Number.isFinite(prevNum) && Number.isFinite(currNum)
                    const isLowerInvalid = hasBoth && currNum < prevNum
                    const previewConsumption =
                      hasBoth && currNum >= prevNum
                        ? Math.round((currNum - prevNum + Number.EPSILON) * 10000) / 10000
                        : null

                    return (
                      <tr key={row.roomId} className="hover:bg-slate-50">
                        <td className="px-4 py-3.5 font-medium text-slate-900">
                          Room {formatRoomNumber(row.roomNumber)}
                          <p className="mt-0.5 text-xs font-normal text-slate-400">
                            {row.mainMeterName || 'Unassigned meter'}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">Floor {row.floor}</td>
                        <td className="px-4 py-3.5">
                          {row.residentName ? (
                            <span className="font-medium text-slate-800">{row.residentName}</span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                              Vacant room
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {row.hasPriorReading ? (
                            <div>
                              <span className="font-medium text-slate-900">{row.autoPreviousReading}</span>
                              <span className="ml-1.5 text-xs text-slate-400">
                                ({row.priorReadingMonth})
                              </span>
                            </div>
                          ) : (
                            <div>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                disabled={isFinalized}
                                aria-label={`Opening reading for Room ${formatRoomNumber(row.roomNumber)}`}
                                placeholder="Opening reading"
                                value={input.previousReading}
                                onChange={(e) =>
                                  updateReadingInput(row.roomId, 'previousReading', e.target.value)
                                }
                                className="h-9 w-36 rounded-md border border-slate-200 px-2.5 text-sm disabled:bg-slate-50"
                              />
                              <p className="mt-0.5 text-[11px] text-slate-400">First-month opening</p>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled={isFinalized}
                            aria-label={`Current reading for Room ${formatRoomNumber(row.roomNumber)}`}
                            placeholder="Enter current"
                            value={input.currentReading}
                            onChange={(e) =>
                              updateReadingInput(row.roomId, 'currentReading', e.target.value)
                            }
                            className={`h-9 w-36 rounded-md border px-2.5 text-sm disabled:bg-slate-50 ${
                              isLowerInvalid ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                            }`}
                          />
                          {isLowerInvalid && (
                            <p className="mt-0.5 text-[11px] text-red-600">
                              Cannot be less than {prevNum}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {previewConsumption !== null ? (
                            <span className="font-semibold text-slate-900">
                              {previewConsumption} units
                            </span>
                          ) : row.reading ? (
                            <span className="font-semibold text-slate-900">
                              {row.reading.consumption} units
                            </span>
                          ) : (
                            <span className="text-xs text-amber-700">Missing reading</span>
                          )}
                          {row.reading && (
                            <p className="mt-0.5 text-[11px] text-emerald-600">
                              Saved ({row.reading.consumption} u)
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {isFinalized ? (
                            <span className="text-xs font-medium text-emerald-600">Finalized</span>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={
                                savingReadingRoomId === row.roomId ||
                                input.currentReading === '' ||
                                (!row.hasPriorReading && input.previousReading === '') ||
                                isLowerInvalid
                              }
                              onClick={() => saveSingleReading(row)}
                            >
                              {savingReadingRoomId === row.roomId ? 'Saving...' : 'Save'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                  <tr>
                    <td colSpan={5} className="px-4 py-3">
                      Completed readings: {monthlyData?.summary.roomsWithCompletedReadings ?? 0} of 26 rooms
                      {' · '}
                      Missing readings: {monthlyData?.summary.roomsWithMissingReadings ?? 26}
                    </td>
                    <td colSpan={2} className="px-4 py-3 text-right text-sm text-slate-900">
                      Total saved consumption: {monthlyData?.summary.totalSubMeterConsumption ?? 0} units
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* SECTION 3: MAIN METER BILLS, DISTRIBUTION & FINALIZATION            */}
        {/* =================================================================== */}
        <div id="section-bills-distribution" className="mt-12 scroll-mt-24">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h4 className="text-xl font-semibold tracking-tight text-slate-950">
                3. Main Meter Electricity Bills &amp; Proportional Distribution ({formatBillingMonth(selectedMonth)})
              </h4>
              <p className="mt-1 text-sm text-slate-500">
                Total units per main meter are summed automatically from its assigned rooms&apos; saved sub-meter readings.
              </p>
            </div>

            {!isFinalized && (
              <div className="flex flex-wrap items-center gap-3">
                <form onSubmit={saveAdditionalRate} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5">
                  <label className="text-xs font-medium text-slate-600">
                    Extra charge rate (BDT/unit):
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rateInput}
                      onChange={(e) => setRateInput(e.target.value)}
                      className="ml-2 h-7 w-16 rounded border border-slate-200 px-2 text-xs font-semibold text-slate-900"
                    />
                  </label>
                  <Button type="submit" variant="outline" size="xs" disabled={savingRate}>
                    {savingRate ? '...' : 'Apply rate'}
                  </Button>
                </form>

                <Button onClick={saveBatchBills} disabled={savingAllBills || loadingMonthly}>
                  <Save data-icon="inline-start" />
                  {savingAllBills ? 'Saving bills...' : 'Save all entered bills'}
                </Button>
              </div>
            )}
          </div>

          {/* Main Meter Bill Entry Table */}
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3.5">Main Meter</th>
                    <th className="px-4 py-3.5">Assigned Rooms</th>
                    <th className="px-4 py-3.5">Total Units</th>
                    <th className="px-4 py-3.5">Electricity Bill (BDT)</th>
                    <th className="px-4 py-3.5">Bill Date</th>
                    <th className="px-4 py-3.5">Reference / Notes</th>
                    <th className="px-4 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(monthlyData?.mainMeterRows ?? []).map((mRow) => {
                    const input = billInputs[mRow.mainMeterId] ?? {
                      billAmount: '',
                      billDate: '',
                      billReference: '',
                    }
                    const canEnterBill =
                      !isFinalized &&
                      mRow.status === 'active' &&
                      mRow.assignedRooms.length > 0 &&
                      mRow.allReadingsComplete &&
                      mRow.totalConsumption > 0

                    return (
                      <tr key={mRow.mainMeterId} className="hover:bg-slate-50">
                        <td className="px-4 py-3.5 font-medium text-slate-900">
                          {mRow.name}
                          <p className="mt-0.5 text-xs font-normal text-slate-400">
                            {mRow.meterNumber || 'No serial'} · {mRow.status === 'active' ? 'Active' : 'Inactive'}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          {mRow.assignedRooms.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {mRow.assignedRooms.map((r) => (
                                <span
                                  key={r.roomId}
                                  className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                                    r.hasReading
                                      ? 'bg-emerald-50 text-emerald-800'
                                      : 'bg-amber-50 text-amber-800'
                                  }`}
                                >
                                  {formatRoomNumber(r.roomNumber)}
                                  {r.hasReading ? ` (${r.consumption}u)` : ' (missing)'}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">No rooms assigned</span>
                          )}
                          {mRow.distributionWarning && mRow.distributionStatus !== 'missing_bill' && (
                            <p className="mt-1 text-xs text-amber-700">{mRow.distributionWarning}</p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-slate-900">
                          {mRow.totalConsumption} units
                        </td>
                        <td className="px-4 py-3.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={!canEnterBill}
                            aria-label={`Electricity bill amount for ${mRow.name}`}
                            placeholder="৳ Bill amount"
                            value={input.billAmount}
                            onChange={(e) =>
                              updateBillInput(mRow.mainMeterId, 'billAmount', e.target.value)
                            }
                            className="h-9 w-36 rounded-md border border-slate-200 px-2.5 text-sm disabled:bg-slate-50"
                          />
                          {mRow.bill && (
                            <p className="mt-0.5 text-[11px] text-emerald-600">
                              Saved: {formatCurrency(mRow.bill.billAmount)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <input
                            type="date"
                            disabled={!canEnterBill}
                            aria-label={`Bill date for ${mRow.name}`}
                            value={input.billDate}
                            onChange={(e) =>
                              updateBillInput(mRow.mainMeterId, 'billDate', e.target.value)
                            }
                            className="h-9 rounded-md border border-slate-200 px-2.5 text-sm disabled:bg-slate-50"
                          />
                        </td>
                        <td className="px-4 py-3.5">
                          <input
                            type="text"
                            disabled={!canEnterBill}
                            aria-label={`Bill reference for ${mRow.name}`}
                            placeholder="Optional note/ref"
                            value={input.billReference}
                            onChange={(e) =>
                              updateBillInput(mRow.mainMeterId, 'billReference', e.target.value)
                            }
                            className="h-9 w-40 rounded-md border border-slate-200 px-2.5 text-sm disabled:bg-slate-50"
                          />
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {isFinalized ? (
                            <span className="text-xs font-medium text-emerald-600">Finalized</span>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={
                                !canEnterBill ||
                                savingBillMeterId === mRow.mainMeterId ||
                                input.billAmount === ''
                              }
                              onClick={() => saveSingleBill(mRow)}
                            >
                              {savingBillMeterId === mRow.mainMeterId ? 'Saving...' : 'Save bill'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Monthly Electricity Summary (Requirement 6) */}
          {monthlyData && (
            <section aria-label="Monthly electricity summary" className="mt-8">
              <h5 className="text-base font-semibold text-slate-900">
                Monthly Electricity Summary ({formatBillingMonth(selectedMonth)})
              </h5>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <article className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Total Main Meter Bills</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    {formatCurrency(monthlyData.summary.totalMainMeterBills)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {monthlyData.summary.mainMetersWithCompletedBills} completed ·{' '}
                    {monthlyData.summary.mainMetersPendingBills} pending
                  </p>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Total Sub-Meter Consumption</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    {monthlyData.summary.totalSubMeterConsumption} units
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {monthlyData.summary.roomsWithCompletedReadings} completed ·{' '}
                    {monthlyData.summary.roomsWithMissingReadings} missing
                  </p>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Total Additional Charges (৳{appliedRate}/u)
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    {formatCurrency(monthlyData.summary.totalAdditionalCharges)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Calculated separately from main meter bills
                  </p>
                </article>

                <article className="rounded-2xl border border-slate-900 bg-slate-950 p-5 text-white">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Total Electricity Distributed
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {formatCurrency(monthlyData.summary.totalElectricityAmountDistributed)}
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    Main shares ({formatCurrency(monthlyData.summary.totalMainMeterShareDistributed)}) + Extra charges
                  </p>
                </article>
              </div>
            </section>
          )}

          {/* Room-Wise Electricity Breakdown Table (Requirement 6 & 9) */}
          <section aria-labelledby="room-breakdown-heading" className="mt-8">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <h5 id="room-breakdown-heading" className="text-base font-semibold text-slate-900">
                  Room-Wise Electricity Breakdown ({formatBillingMonth(selectedMonth)})
                </h5>
                <p className="mt-0.5 text-xs text-slate-500">
                  Formula: Room Main Meter Share = (Main Meter Bill × Room Consumption) ÷ Main Meter Total Consumption. Final Amount = Main Meter Share + (Consumption × ৳{appliedRate}).
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3.5">Room</th>
                      <th className="px-4 py-3.5">Resident / Occupancy</th>
                      <th className="px-4 py-3.5">Main Meter</th>
                      <th className="px-4 py-3.5 text-right">Units</th>
                      <th className="px-4 py-3.5 text-right">Main Meter Share</th>
                      <th className="px-4 py-3.5 text-right">Extra Charge (৳{appliedRate}/u)</th>
                      <th className="px-4 py-3.5 text-right">Final Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(monthlyData?.roomRows ?? []).map((row) => {
                      const alloc = row.allocation
                      return (
                        <tr key={row.roomId} className="hover:bg-slate-50">
                          <td className="px-4 py-3.5 font-medium text-slate-900">
                            Room {formatRoomNumber(row.roomNumber)}
                            <span className="ml-1.5 text-xs font-normal text-slate-400">
                              F{row.floor}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            {alloc ? (
                              alloc.isVacant ? (
                                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                  Vacant room allocation
                                </span>
                              ) : (
                                <span className="font-medium text-slate-800">
                                  {alloc.residentName || row.residentName}
                                </span>
                              )
                            ) : row.isVacant ? (
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">
                                Vacant room
                              </span>
                            ) : (
                              <span className="text-slate-700">{row.residentName}</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-slate-600">
                            {alloc?.mainMeterName || row.mainMeterName || (
                              <span className="text-amber-700">Unassigned</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right font-medium text-slate-800">
                            {alloc ? alloc.consumption : row.reading ? row.reading.consumption : '—'}
                          </td>
                          <td className="px-4 py-3.5 text-right text-slate-800">
                            {alloc ? formatCurrency(alloc.mainMeterShare) : 'Pending'}
                          </td>
                          <td className="px-4 py-3.5 text-right text-slate-800">
                            {alloc ? formatCurrency(alloc.additionalCharge) : 'Pending'}
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold text-slate-950">
                            {alloc ? formatCurrency(alloc.finalElectricityAmount) : 'Pending'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {monthlyData && monthlyData.allocations.length > 0 && (
                    <tfoot className="border-t border-slate-200 bg-slate-50 text-sm font-semibold text-slate-900">
                      <tr>
                        <td colSpan={3} className="px-4 py-3.5">
                          Total ({monthlyData.allocations.length} rooms distributed)
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {monthlyData.summary.totalSubMeterConsumption}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {formatCurrency(monthlyData.summary.totalMainMeterShareDistributed)}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {formatCurrency(monthlyData.summary.totalAdditionalCharges)}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {formatCurrency(monthlyData.summary.totalElectricityAmountDistributed)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </section>

          {/* Step 5: Finalization & Controlled Correction Panel */}
          {monthlyData && (
            <section
              aria-label="Monthly finalization controls"
              className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
            >
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <h5 className="text-base font-semibold text-slate-950">
                    Step 5 — Confirm &amp; Finalize {formatBillingMonth(selectedMonth)} Calculations
                  </h5>
                  <p className="mt-1 text-sm text-slate-500">
                    {isFinalized
                      ? `This month was finalized on ${formatDate(monthlyData.cycle.finalizedAt)}. Records are locked against accidental modification.`
                      : 'Finalizing locks all 26 room readings, main meter bills, resident snapshots, and room-wise electricity allocations for this month.'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {isFinalized ? (
                    <Button variant="outline" onClick={() => setReopenModalOpen(true)}>
                      <RotateCcw data-icon="inline-start" />
                      Controlled Correction / Reopen
                    </Button>
                  ) : (
                    <Button
                      disabled={!monthlyData.canFinalize}
                      onClick={() => setFinalizeConfirmOpen(true)}
                    >
                      <FileCheck2 data-icon="inline-start" />
                      Review &amp; Finalize Month
                    </Button>
                  )}
                </div>
              </div>

              {monthlyData.cycle.auditLog && monthlyData.cycle.auditLog.length > 0 && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Audit Trail ({monthlyData.cycle.auditLog.length})
                  </p>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                    {monthlyData.cycle.auditLog.map((entry, idx) => (
                      <li key={idx} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-800">
                          {formatDate(entry.timestamp)}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                          {entry.action}
                        </span>
                        <span>{entry.reason}</span>
                        {entry.totalFinalAmount > 0 && (
                          <span className="text-slate-400">
                            (Total distributed: {formatCurrency(entry.totalFinalAmount)})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>
      </section>

      {/* Finalize Confirmation Modal */}
      {finalizeConfirmOpen && monthlyData && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 p-4 sm:items-center"
          role="presentation"
          onClick={() => setFinalizeConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="finalize-month-title"
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">Step 5 confirmation</p>
                <h3 id="finalize-month-title" className="text-2xl font-semibold">
                  Finalize {formatBillingMonth(selectedMonth)}
                </h3>
              </div>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setFinalizeConfirmOpen(false)}>
                <X />
              </Button>
            </div>

            <p className="mt-3 text-sm text-slate-600">
              Please verify the monthly summary below. Once finalized, readings, bills, and allocations for{' '}
              <span className="font-medium text-slate-900">{formatBillingMonth(selectedMonth)}</span> will be locked as permanent historical records.
            </p>

            <dl className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Rooms with completed readings</dt>
                <dd className="font-semibold text-slate-900">
                  {monthlyData.summary.roomsWithCompletedReadings} / 26
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Total consumption</dt>
                <dd className="font-semibold text-slate-900">
                  {monthlyData.summary.totalSubMeterConsumption} units
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Total main meter bills</dt>
                <dd className="font-semibold text-slate-900">
                  {formatCurrency(monthlyData.summary.totalMainMeterBills)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Total additional charges (৳{appliedRate}/u)</dt>
                <dd className="font-semibold text-slate-900">
                  {formatCurrency(monthlyData.summary.totalAdditionalCharges)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2.5 text-base">
                <dt className="font-semibold text-slate-900">Final electricity distributed</dt>
                <dd className="font-semibold text-emerald-700">
                  {formatCurrency(monthlyData.summary.totalElectricityAmountDistributed)}
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFinalizeConfirmOpen(false)}>
                Cancel
              </Button>
              <Button onClick={confirmFinalizeMonth} disabled={finalizing}>
                {finalizing ? 'Finalizing...' : 'Confirm & Finalize'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Controlled Correction / Reopen Modal */}
      {reopenModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 p-4 sm:items-center"
          role="presentation"
          onClick={() => setReopenModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reopen-month-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">Controlled correction</p>
                <h3 id="reopen-month-title" className="text-xl font-semibold">
                  Reopen {formatBillingMonth(selectedMonth)}
                </h3>
              </div>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setReopenModalOpen(false)}>
                <X />
              </Button>
            </div>

            <form onSubmit={confirmReopenMonth} className="mt-4 flex flex-col gap-4">
              <p className="text-xs leading-5 text-slate-600">
                Reopening a finalized month records an audit trail entry with the current financial snapshot and your reason for correction.
              </p>

              <label className="flex flex-col gap-2 text-sm font-medium">
                Reason for correction *
                <input
                  required
                  minLength={3}
                  type="text"
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="e.g. Corrected meter reading on Room 04"
                  className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setReopenModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={reopening || reopenReason.trim().length < 3}>
                  {reopening ? 'Reopening...' : 'Confirm & Unlock'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Meter Edit & Room Assignment Modal */}
      {editingMainMeter && mainMeterForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/30 p-4 sm:items-center"
          role="presentation"
          onClick={() => setEditingMainMeter(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-main-meter-title"
            className="my-8 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">Main meter #{String(editingMainMeter.slotNumber).padStart(2, '0')}</p>
                <h3 id="edit-main-meter-title" className="text-2xl font-semibold">
                  {editingMainMeter.name}
                </h3>
              </div>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setEditingMainMeter(null)}>
                <X />
              </Button>
            </div>

            <form onSubmit={saveMainMeter} className="mt-6 flex flex-col gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Meter name *
                  <input
                    required
                    type="text"
                    value={mainMeterForm.name}
                    onChange={(e) => setMainMeterForm({ ...mainMeterForm, name: e.target.value })}
                    className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium">
                  Meter / serial number
                  <input
                    type="text"
                    value={mainMeterForm.meterNumber}
                    onChange={(e) => setMainMeterForm({ ...mainMeterForm, meterNumber: e.target.value })}
                    placeholder="Unique serial number"
                    className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium">
                  Meter location
                  <input
                    type="text"
                    value={mainMeterForm.location}
                    onChange={(e) => setMainMeterForm({ ...mainMeterForm, location: e.target.value })}
                    placeholder="e.g. Ground floor main board"
                    className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium">
                  Status
                  <select
                    value={mainMeterForm.status}
                    onChange={(e) =>
                      setMainMeterForm({
                        ...mainMeterForm,
                        status: e.target.value as 'active' | 'inactive',
                      })
                    }
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 font-normal"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>

                <label className="sm:col-span-2 flex flex-col gap-2 text-sm font-medium">
                  Description (optional)
                  <input
                    type="text"
                    value={mainMeterForm.description}
                    onChange={(e) => setMainMeterForm({ ...mainMeterForm, description: e.target.value })}
                    placeholder="Notes about this main meter"
                    className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                  />
                </label>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Assign rooms ({mainMeterForm.status === 'inactive' ? 0 : mainMeterForm.assignedRooms.length} selected)
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Click rooms to assign or unassign them. Rooms assigned to another active main meter are locked.
                    </p>
                  </div>
                </div>

                {mainMeterForm.status === 'inactive' && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Inactive main meters cannot have assigned rooms. Set status to Active to assign rooms.
                  </p>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {rooms.map((room) => {
                    const ownerMeter = roomToMainMeterMap.get(room._id)
                    const ownedByOther = Boolean(ownerMeter && ownerMeter._id !== editingMainMeter._id)
                    const isSelected =
                      mainMeterForm.status === 'active' && mainMeterForm.assignedRooms.includes(room._id)
                    const isDisabled = ownedByOther || mainMeterForm.status === 'inactive'

                    return (
                      <button
                        key={room._id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => toggleRoomInModal(room._id)}
                        className={`flex flex-col items-start rounded-xl border p-2.5 text-left text-xs transition ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-50/80 text-emerald-950 ring-1 ring-emerald-600'
                            : ownedByOther
                              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span className="font-semibold">Room {formatRoomNumber(room.roomNumber)}</span>
                        <span className="mt-0.5 text-[11px] text-slate-500">
                          {ownedByOther
                            ? ownerMeter?.name
                            : isSelected
                              ? 'Assigned here'
                              : `Floor ${room.floor} · Available`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {mainMeterError && <p className="text-sm text-red-600">{mainMeterError}</p>}

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <Button type="button" variant="outline" onClick={() => setEditingMainMeter(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={savingMainMeter}>
                  {savingMainMeter ? 'Saving...' : 'Save changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-Meter Edit Modal */}
      {editingSubMeter && subMeterForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 p-4 sm:items-center"
          role="presentation"
          onClick={() => setEditingSubMeter(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-sub-meter-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">Floor {editingSubMeter.roomId?.floor ?? '—'}</p>
                <h3 id="edit-sub-meter-title" className="text-2xl font-semibold">
                  Room {formatRoomNumber(editingSubMeter.roomNumber)} Sub-Meter
                </h3>
              </div>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setEditingSubMeter(null)}>
                <X />
              </Button>
            </div>

            <form onSubmit={saveSubMeter} className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm font-medium">
                Sub-meter / serial number
                <input
                  type="text"
                  value={subMeterForm.meterNumber}
                  onChange={(e) => setSubMeterForm({ ...subMeterForm, meterNumber: e.target.value })}
                  placeholder="Unique sub-meter serial number"
                  className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium">
                Meter location
                <input
                  type="text"
                  value={subMeterForm.location}
                  onChange={(e) => setSubMeterForm({ ...subMeterForm, location: e.target.value })}
                  placeholder={`e.g. Floor ${editingSubMeter.roomId?.floor ?? ''} corridor`}
                  className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium">
                Installation date (optional)
                <input
                  type="date"
                  value={subMeterForm.installationDate}
                  onChange={(e) => setSubMeterForm({ ...subMeterForm, installationDate: e.target.value })}
                  className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium">
                Status
                <select
                  value={subMeterForm.status}
                  onChange={(e) =>
                    setSubMeterForm({
                      ...subMeterForm,
                      status: e.target.value as 'active' | 'inactive',
                    })
                  }
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 font-normal"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium">
                Description (optional)
                <input
                  type="text"
                  value={subMeterForm.description}
                  onChange={(e) => setSubMeterForm({ ...subMeterForm, description: e.target.value })}
                  placeholder="Optional notes"
                  className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                />
              </label>

              {subMeterError && <p className="text-sm text-red-600">{subMeterError}</p>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditingSubMeter(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={savingSubMeter}>
                  {savingSubMeter ? 'Saving...' : 'Save sub-meter'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
