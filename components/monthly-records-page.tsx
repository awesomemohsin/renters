'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileSpreadsheet,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Unlock,
  Wallet,
  X,
} from 'lucide-react'
import { CollectPaymentModal, type CollectibleBillTarget } from '@/components/collect-payment-modal'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatRoomNumber } from '@/lib/utils'

type AdditionalChargeItem = {
  _id: string
  description: string
  amount: number
  date: string
  notes?: string
}

type AdjustmentItem = {
  _id: string
  type: 'discount' | 'positive' | 'negative'
  description: string
  amount: number
  date: string
  notes?: string
}

type PreviousOutstandingItem = {
  billId: string
  billingMonth: string
  unpaidRent: number
  unpaidElectricity: number
  unpaidWifi: number
  unpaidOther: number
  unpaidTotal: number
}

type CategoryState = {
  totalAdditionalCharges: number
  totalPositiveAdjustments: number
  totalDiscounts: number
  totalNegativeAdjustments: number
  currentMonthTotal: number
  rentCap: number
  electricityCap: number
  wifiCap: number
  otherCap: number
  unpaidRent: number
  unpaidElectricity: number
  unpaidWifi: number
  unpaidOther: number
  currentMonthPaid: number
  currentMonthUnpaid: number
}

type MonthlyBillRecord = {
  _id: string
  billingMonth: string
  residentId: string
  roomId: string
  residentName: string
  residentPhone: string
  roomNumber: number
  floor: number
  residentAdvanceBalance: number
  monthlyRent: number
  electricityMainMeterShare: number
  electricityAdditionalCharge: number
  totalElectricity: number
  electricityUnits: number
  wifiCharge: number
  additionalCharges: AdditionalChargeItem[]
  adjustments: AdjustmentItem[]
  totalAdditionalCharges: number
  totalDiscounts: number
  totalPositiveAdjustments: number
  totalNegativeAdjustments: number
  currentMonthTotal: number
  previousOutstandingBreakdown: PreviousOutstandingItem[]
  previousOutstanding: number
  totalPayable: number
  rentPaid: number
  electricityPaid: number
  wifiPaid: number
  otherChargesPaid: number
  previousOutstandingPaid: number
  advanceApplied: number
  currentMonthPaid: number
  totalPaid: number
  currentMonthUnpaid: number
  remainingDue: number
  status: 'paid' | 'partially_paid' | 'unpaid'
  isLocked: boolean
  categoryState: CategoryState
  categoryDue: {
    rentDue: number
    electricityDue: number
    wifiDue: number
    otherDue: number
    previousDue: number
  }
}

type GenerationPreviewItem = {
  residentId: string
  fullName: string
  phone: string
  roomId: string
  roomNumber: number
  floor: number
  monthlyRent: number
  wifiCharge: number
  advanceBalance: number
  electricity: {
    hasAllocation: boolean
    hasFinalizedAllocation: boolean
    units: number
    mainMeterShare: number
    additionalCharge: number
    totalElectricity: number
  }
  previousOutstanding: number
  estimatedTotalPayable: number
  alreadyGenerated: boolean
  missingDataWarnings: string[]
}

type WorkspaceResponse = {
  billingMonth: string
  availableMonths: string[]
  summary: {
    totalMonthlyBills: number
    totalPayable: number
    totalCollected: number
    totalOutstanding: number
    fullyPaidResidents: number
    partiallyPaidResidents: number
    unpaidResidents: number
  }
  bills: MonthlyBillRecord[]
  generationPreview: {
    activeResidentsCount: number
    existingBillsCount: number
    toGenerateCount: number
    isElectricityFinalized: boolean
    warnings: string[]
    residents: GenerationPreviewItem[]
  }
}

type BillPaymentRecord = {
  _id: string
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
  status: 'completed' | 'reversed'
  reversedAt?: string | null
  reversalReason?: string
}

const PRESET_MONTHS = [
  { value: '2026-10', label: 'October 2026' },
  { value: '2026-11', label: 'November 2026' },
  { value: '2026-12', label: 'December 2026' },
]

function formatMonthLabel(yyyyMm: string): string {
  const [yearStr, monthStr] = yyyyMm.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  if (!year || !month) return yyyyMm
  const date = new Date(Date.UTC(year, month - 1, 1))
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
}

function getStatusBadgeClass(status: 'paid' | 'partially_paid' | 'unpaid'): string {
  if (status === 'paid') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }
  if (status === 'partially_paid') {
    return 'border-amber-200 bg-amber-50 text-amber-800'
  }
  return 'border-rose-200 bg-rose-50 text-rose-700'
}

function formatStatusLabel(status: 'paid' | 'partially_paid' | 'unpaid'): string {
  if (status === 'paid') return 'Paid'
  if (status === 'partially_paid') return 'Partially Paid'
  return 'Unpaid'
}

export function MonthlyRecordsPage() {
  const [selectedMonth, setSelectedMonth] = useState('2026-10')
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [floorFilter, setFloorFilter] = useState('0')
  const [statusFilter, setStatusFilter] = useState('all')

  // Generation modal state
  const [generateOpen, setGenerateOpen] = useState(false)
  const [wifiOverrides, setWifiOverrides] = useState<Record<string, string>>({})
  const [allowUnfinalizedElectricity, setAllowUnfinalizedElectricity] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')

  // Payment modal state
  const [collectTarget, setCollectTarget] = useState<CollectibleBillTarget | null>(null)

  // Detailed bill modal state
  const [activeBillId, setActiveBillId] = useState<string | null>(null)
  const [billPayments, setBillPayments] = useState<BillPaymentRecord[]>([])
  const [billDetailError, setBillDetailError] = useState('')
  const [billActionBusy, setBillActionBusy] = useState(false)

  // Detailed bill forms
  const [wifiEditValue, setWifiEditValue] = useState('')
  const [newChargeDesc, setNewChargeDesc] = useState('')
  const [newChargeAmount, setNewChargeAmount] = useState('')
  const [newChargeDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [newChargeNotes, setNewChargeNotes] = useState('')

  const [newAdjType, setNewAdjType] = useState<'discount' | 'positive' | 'negative'>('discount')
  const [newAdjDesc, setNewAdjDesc] = useState('')
  const [newAdjAmount, setNewAdjAmount] = useState('')
  const [newAdjDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [newAdjNotes, setNewAdjNotes] = useState('')

  const [advanceToApply, setAdvanceToApply] = useState('')
  const [reversingPaymentId, setReversingPaymentId] = useState<string | null>(null)
  const [reversalReason, setReversalReason] = useState('')

  const loadWorkspace = useCallback(async (month: string) => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/monthly-bills?month=${encodeURIComponent(month)}`)
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'Failed to load monthly billing workspace.')
      } else {
        setWorkspace(data)
        const initialOverrides: Record<string, string> = {}
        for (const item of data.generationPreview?.residents ?? []) {
          initialOverrides[item.residentId] = String(item.wifiCharge ?? 0)
        }
        setWifiOverrides(initialOverrides)
      }
    } catch {
      setError('Unable to load monthly billing workspace.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWorkspace(selectedMonth)
  }, [selectedMonth, loadWorkspace])

  const loadBillPayments = useCallback(async (billId: string) => {
    try {
      const res = await fetch(`/api/monthly-bills/payments?billId=${encodeURIComponent(billId)}`)
      const data = await res.json()
      if (res.ok) {
        setBillPayments(data.payments ?? [])
      }
    } catch {
      // ignore
    }
  }, [])

  const activeBill = useMemo(
    () => workspace?.bills.find((b) => b._id === activeBillId) ?? null,
    [workspace, activeBillId],
  )

  useEffect(() => {
    if (activeBill) {
      setWifiEditValue(String(activeBill.wifiCharge))
      setAdvanceToApply(
        String(Math.min(activeBill.residentAdvanceBalance || 0, activeBill.currentMonthUnpaid || 0)),
      )
      loadBillPayments(activeBill._id)
    }
  }, [activeBill, loadBillPayments])

  const monthOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const preset of PRESET_MONTHS) {
      map.set(preset.value, preset.label)
    }
    for (const m of workspace?.availableMonths ?? []) {
      if (!map.has(m)) {
        map.set(m, formatMonthLabel(m))
      }
    }
    if (!map.has(selectedMonth)) {
      map.set(selectedMonth, formatMonthLabel(selectedMonth))
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.value.localeCompare(b.value))
  }, [workspace?.availableMonths, selectedMonth])

  const filteredBills = useMemo(() => {
    const list = workspace?.bills ?? []
    const q = search.trim().toLowerCase()
    const floorNum = Number(floorFilter || 0)

    return list.filter((bill) => {
      if (floorNum && bill.floor !== floorNum) return false
      if (statusFilter !== 'all' && bill.status !== statusFilter) return false
      if (q) {
        const roomStr = formatRoomNumber(bill.roomNumber).toLowerCase()
        const matchName = bill.residentName.toLowerCase().includes(q)
        const matchPhone = bill.residentPhone.toLowerCase().includes(q)
        const matchRoom =
          roomStr.includes(q) || `room ${roomStr}`.includes(q) || String(bill.roomNumber).includes(q)
        if (!matchName && !matchPhone && !matchRoom) return false
      }
      return true
    })
  }, [workspace?.bills, search, floorFilter, statusFilter])

  const handleGenerateBills = async (event: React.FormEvent) => {
    event.preventDefault()
    setGenerating(true)
    setGenerateError('')
    setNotice('')
    try {
      const numericOverrides: Record<string, number> = {}
      for (const [resId, val] of Object.entries(wifiOverrides)) {
        const num = Number(val)
        if (Number.isFinite(num) && num >= 0) {
          numericOverrides[resId] = num
        }
      }
      const response = await fetch('/api/monthly-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingMonth: selectedMonth,
          allowUnfinalizedElectricity,
          wifiCharges: numericOverrides,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setGenerateError(data.error ?? 'Failed to generate monthly bills.')
      } else {
        setWorkspace(data)
        setGenerateOpen(false)
        setNotice(
          `Generated ${data.generatedCount} monthly bill(s) for ${formatMonthLabel(selectedMonth)}${
            data.skippedCount ? ` (${data.skippedCount} already existed)` : ''
          }.`,
        )
      }
    } catch {
      setGenerateError('Network error while generating monthly bills.')
    } finally {
      setGenerating(false)
    }
  }

  const openCollectModalForBill = (bill: MonthlyBillRecord) => {
    setCollectTarget({
      billId: bill._id,
      billingMonth: bill.billingMonth,
      residentId: bill.residentId,
      residentName: bill.residentName,
      roomNumber: bill.roomNumber,
      floor: bill.floor,
      rentDue: bill.categoryDue.rentDue,
      electricityDue: bill.categoryDue.electricityDue,
      wifiDue: bill.categoryDue.wifiDue,
      otherDue: bill.categoryDue.otherDue,
      previousDueRemaining: bill.categoryDue.previousDue,
      totalPayable: bill.totalPayable,
      totalPaid: bill.totalPaid,
      remainingDue: bill.remainingDue,
    })
  }

  const mutateBill = async (payload: Record<string, unknown>) => {
    if (!activeBill) return false
    setBillActionBusy(true)
    setBillDetailError('')
    try {
      const response = await fetch(`/api/monthly-bills/${activeBill._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) {
        setBillDetailError(data.error ?? 'Failed to update bill.')
        return false
      }
      await loadWorkspace(selectedMonth)
      await loadBillPayments(activeBill._id)
      return true
    } catch {
      setBillDetailError('Network error while updating bill.')
      return false
    } finally {
      setBillActionBusy(false)
    }
  }

  const handleReversePayment = async (paymentId: string) => {
    if (!reversalReason.trim()) {
      setBillDetailError('Please enter a reason for reversing the payment.')
      return
    }
    setBillActionBusy(true)
    setBillDetailError('')
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
        setBillDetailError(data.error ?? 'Failed to reverse payment.')
      } else {
        setReversingPaymentId(null)
        setReversalReason('')
        await loadWorkspace(selectedMonth)
        if (activeBill) {
          await loadBillPayments(activeBill._id)
        }
      }
    } catch {
      setBillDetailError('Network error while reversing payment.')
    } finally {
      setBillActionBusy(false)
    }
  }

  const summary = workspace?.summary ?? {
    totalMonthlyBills: 0,
    totalPayable: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    fullyPaidResidents: 0,
    partiallyPaidResidents: 0,
    unpaidResidents: 0,
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      {/* Header & Month Selector */}
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
            <CalendarDays aria-hidden="true" className="size-3.5 text-slate-700" />
            Monthly billing & due management
          </div>
          <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
            {formatMonthLabel(selectedMonth)} Billing
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Generate monthly bills from rent, finalized electricity shares, and WiFi charges. Collect partial or full
            payments with manual category allocation and automatic carry-forward of unpaid dues.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xs">
            <select
              aria-label="Select billing month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-8 rounded-lg bg-transparent px-2.5 text-sm font-medium text-slate-800 outline-none"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              aria-label="Custom billing month"
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                if (e.target.value) setSelectedMonth(e.target.value)
              }}
              className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600"
            />
          </div>

          <Button
            onClick={() => {
              setGenerateError('')
              setGenerateOpen(true)
            }}
          >
            <FileSpreadsheet data-icon="inline-start" />
            Generate Monthly Bills
          </Button>
        </div>
      </div>

      {/* Electricity cycle status banner */}
      {workspace && !workspace.generationPreview.isElectricityFinalized && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs text-amber-900">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="size-4 shrink-0 text-amber-600" />
            <span>
              <strong>Electricity for {formatMonthLabel(selectedMonth)} is not finalized yet.</strong> Finalize main
              meter bills on the Utilities page before generating final monthly bills, or review the preview carefully.
            </span>
          </div>
          <Link href="/utilities" className="font-semibold underline hover:text-amber-950">
            Open Utilities →
          </Link>
        </div>
      )}

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

      {/* 7 Summary Cards */}
      <section aria-label="Monthly billing summary" className="mt-7 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Monthly Bills</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{summary.totalMonthlyBills}</p>
          <p className="mt-1 text-[11px] text-slate-400">Generated for {selectedMonth}</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Payable</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {formatCurrency(summary.totalPayable)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Includes prior dues</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Collected</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-emerald-700">
            {formatCurrency(summary.totalCollected)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Payments & credits</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Outstanding</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-rose-600">
            {formatCurrency(summary.totalOutstanding)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Remaining unpaid</p>
        </article>

        <article className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4">
          <p className="text-xs font-medium text-emerald-800">Fully Paid Residents</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-emerald-700">{summary.fullyPaidResidents}</p>
          <p className="mt-1 text-[11px] text-emerald-600">Status: Paid</p>
        </article>

        <article className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4">
          <p className="text-xs font-medium text-amber-900">Partially Paid Residents</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-amber-700">{summary.partiallyPaidResidents}</p>
          <p className="mt-1 text-[11px] text-amber-700">Status: Partially Paid</p>
        </article>

        <article className="rounded-2xl border border-rose-200/80 bg-rose-50/40 p-4">
          <p className="text-xs font-medium text-rose-800">Unpaid Residents</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-rose-700">{summary.unpaidResidents}</p>
          <p className="mt-1 text-[11px] text-rose-600">Status: Unpaid</p>
        </article>
      </section>

      {/* Search and Filters */}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <Search aria-hidden="true" className="absolute left-3 top-2.5 size-4 text-slate-400" />
          <input
            aria-label="Search monthly bills"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by resident name, room number, or phone..."
            className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400"
          />
        </label>
        <select
          aria-label="Filter bills by floor"
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
          aria-label="Filter bills by payment status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="paid">Paid</option>
          <option value="partially_paid">Partially Paid</option>
          <option value="unpaid">Unpaid</option>
        </select>
      </div>

      {/* Monthly Bills Table */}
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3.5">Room</th>
                <th className="px-4 py-3.5">Resident</th>
                <th className="px-4 py-3.5">Rent</th>
                <th className="px-4 py-3.5">Electricity</th>
                <th className="px-4 py-3.5">WiFi</th>
                <th className="px-4 py-3.5">Other Charges</th>
                <th className="px-4 py-3.5">Prev. Due</th>
                <th className="px-4 py-3.5">Total Payable</th>
                <th className="px-4 py-3.5">Paid</th>
                <th className="px-4 py-3.5">Due</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBills.map((bill) => {
                const netOther =
                  bill.totalAdditionalCharges +
                  bill.totalPositiveAdjustments -
                  bill.totalDiscounts -
                  bill.totalNegativeAdjustments
                return (
                  <tr key={bill._id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3.5 font-medium text-slate-900">
                      Room {formatRoomNumber(bill.roomNumber)}
                      <p className="text-[11px] font-normal text-slate-400">Floor {bill.floor}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/residents/${bill.residentId}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {bill.residentName}
                      </Link>
                      <p className="text-xs text-slate-400">{bill.residentPhone}</p>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">{formatCurrency(bill.monthlyRent)}</td>
                    <td className="px-4 py-3.5 text-slate-700">
                      {formatCurrency(bill.totalElectricity)}
                      <p className="text-[11px] text-slate-400">
                        {formatCurrency(bill.electricityMainMeterShare)} + {formatCurrency(bill.electricityAdditionalCharge)}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">{formatCurrency(bill.wifiCharge)}</td>
                    <td className="px-4 py-3.5 text-slate-700">
                      {formatCurrency(netOther)}
                      {(bill.totalDiscounts > 0 || bill.totalNegativeAdjustments > 0) && (
                        <p className="text-[11px] text-emerald-600">
                          -{formatCurrency(bill.totalDiscounts + bill.totalNegativeAdjustments)} adj
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">
                      {bill.previousOutstanding > 0 ? (
                        <span className="font-medium text-amber-700">{formatCurrency(bill.previousOutstanding)}</span>
                      ) : (
                        <span className="text-slate-400">{formatCurrency(0)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-950">{formatCurrency(bill.totalPayable)}</td>
                    <td className="px-4 py-3.5 font-medium text-emerald-700">{formatCurrency(bill.totalPaid)}</td>
                    <td className="px-4 py-3.5 font-semibold text-rose-600">{formatCurrency(bill.remainingDue)}</td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeClass(
                          bill.status,
                        )}`}
                      >
                        {bill.isLocked && <Lock className="size-3" />}
                        {formatStatusLabel(bill.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {!bill.isLocked && (
                          <Button size="xs" onClick={() => openCollectModalForBill(bill)}>
                            <CreditCard className="size-3" /> Collect
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            setBillDetailError('')
                            setActiveBillId(bill._id)
                          }}
                        >
                          Details
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && filteredBills.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-5 py-14 text-center text-sm text-slate-500">
                    {workspace?.bills.length === 0
                      ? `No monthly bills generated for ${formatMonthLabel(selectedMonth)} yet. Click "Generate Monthly Bills" above to start.`
                      : 'No monthly bills match the current filters.'}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={12} className="px-5 py-14 text-center text-sm text-slate-400">
                    Loading monthly billing records...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate Monthly Bills Modal */}
      {generateOpen && workspace && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-bills-title"
            className="my-8 w-full max-w-4xl rounded-2xl bg-white p-6 shadow-xl sm:p-7"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Pre-generation Preview · {formatMonthLabel(selectedMonth)}
                </p>
                <h3 id="generate-bills-title" className="mt-1 text-xl font-semibold text-slate-950">
                  Generate Monthly Bills
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Active residents: <strong>{workspace.generationPreview.activeResidentsCount}</strong> · Already
                  generated: <strong>{workspace.generationPreview.existingBillsCount}</strong> · Ready to generate:{' '}
                  <strong>{workspace.generationPreview.toGenerateCount}</strong>
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setGenerateOpen(false)}>
                <X />
              </Button>
            </div>

            <form onSubmit={handleGenerateBills} className="mt-5 space-y-4">
              {!workspace.generationPreview.isElectricityFinalized && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
                  <p className="font-semibold">
                    Warning: Monthly electricity for {formatMonthLabel(selectedMonth)} is not finalized.
                  </p>
                  <p className="mt-1 text-amber-800">
                    Electricity charges are read directly from MonthlyElectricityAllocation records. Finalizing
                    electricity first ensures complete accuracy.
                  </p>
                  <label className="mt-2.5 flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={allowUnfinalizedElectricity}
                      onChange={(e) => setAllowUnfinalizedElectricity(e.target.checked)}
                      className="size-4 rounded border-amber-300"
                    />
                    Allow generating bills before electricity is finalized
                  </label>
                </div>
              )}

              <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5">Room</th>
                      <th className="px-3 py-2.5">Resident</th>
                      <th className="px-3 py-2.5">Rent</th>
                      <th className="px-3 py-2.5">Electricity</th>
                      <th className="px-3 py-2.5">WiFi Charge (৳)</th>
                      <th className="px-3 py-2.5">Prev. Due</th>
                      <th className="px-3 py-2.5">Est. Payable</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {workspace.generationPreview.residents.map((item) => {
                      const wifiVal = Number(wifiOverrides[item.residentId] ?? item.wifiCharge ?? 0)
                      const estPayable =
                        Math.round(
                          (item.monthlyRent +
                            item.electricity.totalElectricity +
                            (Number.isFinite(wifiVal) ? wifiVal : 0) +
                            item.previousOutstanding +
                            Number.EPSILON) *
                            100,
                        ) / 100
                      return (
                        <tr key={item.residentId}>
                          <td className="px-3 py-2.5 font-medium">Room {formatRoomNumber(item.roomNumber)}</td>
                          <td className="px-3 py-2.5">{item.fullName}</td>
                          <td className="px-3 py-2.5">{formatCurrency(item.monthlyRent)}</td>
                          <td className="px-3 py-2.5">
                            {formatCurrency(item.electricity.totalElectricity)}
                            {!item.electricity.hasFinalizedAllocation && (
                              <span className="ml-1 text-[10px] text-amber-600">(Unfinalized)</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              disabled={item.alreadyGenerated}
                              value={wifiOverrides[item.residentId] ?? String(item.wifiCharge ?? 0)}
                              onChange={(e) =>
                                setWifiOverrides((curr) => ({ ...curr, [item.residentId]: e.target.value }))
                              }
                              className="h-7 w-24 rounded border border-slate-200 px-2 text-xs disabled:bg-slate-100"
                            />
                          </td>
                          <td className="px-3 py-2.5">{formatCurrency(item.previousOutstanding)}</td>
                          <td className="px-3 py-2.5 font-semibold">{formatCurrency(estPayable)}</td>
                          <td className="px-3 py-2.5">
                            {item.alreadyGenerated ? (
                              <span className="text-emerald-600">Already generated</span>
                            ) : (
                              <span className="text-slate-600">Ready</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {workspace.generationPreview.residents.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                          No active residents found. Assign active residents to rooms first.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {generateError && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{generateError}</p>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <Button type="button" variant="outline" onClick={() => setGenerateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={generating || workspace.generationPreview.toGenerateCount === 0}
                >
                  {generating
                    ? 'Generating...'
                    : `Generate ${workspace.generationPreview.toGenerateCount} Bill(s)`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detailed Bill View Modal */}
      {activeBill && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bill-detail-title"
            className="my-8 max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl sm:p-7"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Monthly Bill · {formatMonthLabel(activeBill.billingMonth)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeClass(
                      activeBill.status,
                    )}`}
                  >
                    {formatStatusLabel(activeBill.status)}
                  </span>
                </div>
                <h3 id="bill-detail-title" className="mt-1 text-2xl font-semibold text-slate-950">
                  {activeBill.residentName} · Room {formatRoomNumber(activeBill.roomNumber)}
                </h3>
                <p className="text-xs text-slate-500">
                  Floor {activeBill.floor} · Phone: {activeBill.residentPhone}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {!activeBill.isLocked && (
                  <Button size="sm" onClick={() => openCollectModalForBill(activeBill)}>
                    <CreditCard data-icon="inline-start" /> Collect Payment
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={billActionBusy}
                  onClick={() =>
                    mutateBill({
                      action: activeBill.isLocked ? 'unlock' : 'lock',
                      reason: 'Owner manual toggle',
                    })
                  }
                >
                  {activeBill.isLocked ? (
                    <>
                      <Unlock data-icon="inline-start" /> Unlock Bill
                    </>
                  ) : (
                    <>
                      <Lock data-icon="inline-start" /> Lock Bill
                    </>
                  )}
                </Button>
                <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setActiveBillId(null)}>
                  <X />
                </Button>
              </div>
            </div>

            {billDetailError && (
              <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{billDetailError}</div>
            )}

            {/* Formula Summary Breakdown */}
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <p className="text-xs text-slate-500">Current Month Total</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {formatCurrency(activeBill.currentMonthTotal)}
                </p>
                <p className="text-[11px] text-slate-400">
                  Unpaid this month: {formatCurrency(activeBill.currentMonthUnpaid)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <p className="text-xs text-slate-500">Previous Outstanding</p>
                <p className="mt-1 text-lg font-semibold text-amber-700">
                  {formatCurrency(activeBill.previousOutstanding)}
                </p>
                <p className="text-[11px] text-slate-400">
                  Paid toward prior: {formatCurrency(activeBill.previousOutstandingPaid)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <p className="text-xs text-slate-500">Total Payable / Paid</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">
                  {formatCurrency(activeBill.totalPayable)}{' '}
                  <span className="text-xs font-normal text-emerald-700">
                    ({formatCurrency(activeBill.totalPaid)} paid)
                  </span>
                </p>
                {activeBill.advanceApplied > 0 && (
                  <p className="text-[11px] text-emerald-600">
                    Includes {formatCurrency(activeBill.advanceApplied)} advance credit
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5">
                <p className="text-xs text-rose-700">Remaining Due</p>
                <p className="mt-1 text-lg font-semibold text-rose-700">{formatCurrency(activeBill.remainingDue)}</p>
                <p className="text-[11px] text-rose-600">Carries forward if unpaid</p>
              </div>
            </div>

            {/* Category Breakdown & WiFi edit */}
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <h4 className="text-sm font-semibold text-slate-900">Core Charges & Category Balances</h4>
                <dl className="mt-3 divide-y divide-slate-100 text-xs">
                  <div className="flex items-center justify-between py-2.5">
                    <div>
                      <dt className="font-medium text-slate-800">A. Monthly Rent</dt>
                      <dd className="text-slate-400">Paid: {formatCurrency(activeBill.rentPaid)}</dd>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">{formatCurrency(activeBill.monthlyRent)}</p>
                      <p className="text-rose-600">Due: {formatCurrency(activeBill.categoryDue.rentDue)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2.5">
                    <div>
                      <dt className="font-medium text-slate-800">
                        B. Electricity ({activeBill.electricityUnits} units)
                      </dt>
                      <dd className="text-slate-400">
                        Main share {formatCurrency(activeBill.electricityMainMeterShare)} + Extra charge{' '}
                        {formatCurrency(activeBill.electricityAdditionalCharge)} · Paid:{' '}
                        {formatCurrency(activeBill.electricityPaid)}
                      </dd>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">{formatCurrency(activeBill.totalElectricity)}</p>
                      <p className="text-rose-600">Due: {formatCurrency(activeBill.categoryDue.electricityDue)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 py-2.5">
                    <div>
                      <dt className="font-medium text-slate-800">C. WiFi Charge</dt>
                      <dd className="text-slate-400">Paid: {formatCurrency(activeBill.wifiPaid)}</dd>
                    </div>
                    <div className="flex items-center gap-2">
                      {!activeBill.isLocked ? (
                        <>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={wifiEditValue}
                            onChange={(e) => setWifiEditValue(e.target.value)}
                            className="h-7 w-24 rounded border border-slate-200 px-2 text-xs"
                          />
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={billActionBusy}
                            onClick={() =>
                              mutateBill({
                                action: 'update_wifi',
                                wifiCharge: Number(wifiEditValue),
                                saveAsResidentDefault: true,
                              })
                            }
                          >
                            Save WiFi
                          </Button>
                        </>
                      ) : (
                        <span className="font-semibold text-slate-900">{formatCurrency(activeBill.wifiCharge)}</span>
                      )}
                      <span className="text-rose-600">Due: {formatCurrency(activeBill.categoryDue.wifiDue)}</span>
                    </div>
                  </div>
                </dl>

                {/* Advance Balance Application */}
                {activeBill.residentAdvanceBalance > 0 && !activeBill.isLocked && activeBill.currentMonthUnpaid > 0 && (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-900">
                        <Wallet className="size-3.5" /> Resident Advance Credit Available:{' '}
                        {formatCurrency(activeBill.residentAdvanceBalance)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={Math.min(activeBill.residentAdvanceBalance, activeBill.currentMonthUnpaid)}
                        value={advanceToApply}
                        onChange={(e) => setAdvanceToApply(e.target.value)}
                        className="h-7 w-28 rounded border border-emerald-300 bg-white px-2 text-xs"
                      />
                      <Button
                        size="xs"
                        disabled={billActionBusy}
                        onClick={() =>
                          mutateBill({
                            action: 'apply_advance',
                            amount: Number(advanceToApply),
                          })
                        }
                      >
                        Apply Advance Credit
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Previous Outstanding Breakdown */}
              <div className="rounded-xl border border-slate-200 p-4">
                <h4 className="text-sm font-semibold text-slate-900">
                  Carried-Forward Previous Outstanding ({formatCurrency(activeBill.previousOutstanding)})
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  Preserves original billing month and charge categories without overwriting prior bills.
                </p>
                {activeBill.previousOutstandingBreakdown.length === 0 ? (
                  <p className="mt-4 text-xs text-slate-400">No unpaid balances carried forward from previous months.</p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-100 text-[11px] uppercase text-slate-400">
                        <tr>
                          <th className="py-1.5">Origin Month</th>
                          <th className="py-1.5">Rent</th>
                          <th className="py-1.5">Elec.</th>
                          <th className="py-1.5">WiFi</th>
                          <th className="py-1.5">Other</th>
                          <th className="py-1.5 text-right">Unpaid Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeBill.previousOutstandingBreakdown.map((item) => (
                          <tr key={item.billId || item.billingMonth}>
                            <td className="py-2 font-medium">{item.billingMonth}</td>
                            <td className="py-2">{formatCurrency(item.unpaidRent)}</td>
                            <td className="py-2">{formatCurrency(item.unpaidElectricity)}</td>
                            <td className="py-2">{formatCurrency(item.unpaidWifi)}</td>
                            <td className="py-2">{formatCurrency(item.unpaidOther)}</td>
                            <td className="py-2 text-right font-semibold text-amber-700">
                              {formatCurrency(item.unpaidTotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Additional Charges & Discounts/Adjustments */}
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              {/* D. Additional Charges */}
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">
                    D. Additional Charges ({formatCurrency(activeBill.totalAdditionalCharges)})
                  </h4>
                </div>
                <div className="mt-3 space-y-2">
                  {activeBill.additionalCharges.map((charge) => (
                    <div
                      key={charge._id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                    >
                      <div>
                        <p className="font-medium text-slate-800">{charge.description}</p>
                        <p className="text-[11px] text-slate-400">
                          {charge.date}
                          {charge.notes ? ` · ${charge.notes}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{formatCurrency(charge.amount)}</span>
                        {!activeBill.isLocked && (
                          <button
                            type="button"
                            aria-label="Remove charge"
                            onClick={() => mutateBill({ action: 'remove_charge', chargeId: charge._id })}
                            className="text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {activeBill.additionalCharges.length === 0 && (
                    <p className="text-xs text-slate-400">No additional charges recorded.</p>
                  )}
                </div>

                {!activeBill.isLocked && (
                  <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3">
                    <input
                      type="text"
                      placeholder="Description (e.g. Repair)"
                      value={newChargeDesc}
                      onChange={(e) => setNewChargeDesc(e.target.value)}
                      className="h-8 rounded border border-slate-200 px-2.5 text-xs"
                    />
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Amount (৳)"
                      value={newChargeAmount}
                      onChange={(e) => setNewChargeAmount(e.target.value)}
                      className="h-8 rounded border border-slate-200 px-2.5 text-xs"
                    />
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={billActionBusy}
                      onClick={async () => {
                        const ok = await mutateBill({
                          action: 'add_charge',
                          description: newChargeDesc,
                          amount: Number(newChargeAmount),
                          date: newChargeDate,
                          notes: newChargeNotes,
                        })
                        if (ok) {
                          setNewChargeDesc('')
                          setNewChargeAmount('')
                          setNewChargeNotes('')
                        }
                      }}
                    >
                      <Plus className="size-3" /> Add Charge
                    </Button>
                  </div>
                )}
              </div>

              {/* E. Discounts & Adjustments */}
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">E. Discounts & Adjustments</h4>
                  <span className="text-xs text-slate-500">
                    +{formatCurrency(activeBill.totalPositiveAdjustments)} / -
                    {formatCurrency(activeBill.totalDiscounts + activeBill.totalNegativeAdjustments)}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {activeBill.adjustments.map((adj) => (
                    <div
                      key={adj._id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                    >
                      <div>
                        <p className="font-medium text-slate-800">
                          <span className="mr-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase">
                            {adj.type}
                          </span>
                          {adj.description}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {adj.date}
                          {adj.notes ? ` · ${adj.notes}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold ${
                            adj.type === 'positive' ? 'text-slate-900' : 'text-emerald-700'
                          }`}
                        >
                          {adj.type === 'positive' ? '+' : '-'}
                          {formatCurrency(adj.amount)}
                        </span>
                        {!activeBill.isLocked && (
                          <button
                            type="button"
                            aria-label="Remove adjustment"
                            onClick={() => mutateBill({ action: 'remove_adjustment', adjustmentId: adj._id })}
                            className="text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {activeBill.adjustments.length === 0 && (
                    <p className="text-xs text-slate-400">No discounts or adjustments applied.</p>
                  )}
                </div>

                {!activeBill.isLocked && (
                  <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-4">
                    <select
                      value={newAdjType}
                      onChange={(e) => setNewAdjType(e.target.value as typeof newAdjType)}
                      className="h-8 rounded border border-slate-200 bg-white px-2 text-xs"
                    >
                      <option value="discount">Discount (-)</option>
                      <option value="negative">Negative Adj (-)</option>
                      <option value="positive">Positive Adj (+)</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Reason / Description"
                      value={newAdjDesc}
                      onChange={(e) => setNewAdjDesc(e.target.value)}
                      className="h-8 rounded border border-slate-200 px-2.5 text-xs"
                    />
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Amount (৳)"
                      value={newAdjAmount}
                      onChange={(e) => setNewAdjAmount(e.target.value)}
                      className="h-8 rounded border border-slate-200 px-2.5 text-xs"
                    />
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={billActionBusy}
                      onClick={async () => {
                        const ok = await mutateBill({
                          action: 'add_adjustment',
                          type: newAdjType,
                          description: newAdjDesc,
                          amount: Number(newAdjAmount),
                          date: newAdjDate,
                          notes: newAdjNotes,
                        })
                        if (ok) {
                          setNewAdjDesc('')
                          setNewAdjAmount('')
                          setNewAdjNotes('')
                        }
                      }}
                    >
                      <Plus className="size-3" /> Apply
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Payments History for this Bill */}
            <div className="mt-5 rounded-xl border border-slate-200 p-4">
              <h4 className="text-sm font-semibold text-slate-900">Payments Recorded on This Bill</h4>
              {billPayments.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">No payments recorded for this bill yet.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-100 text-[11px] uppercase text-slate-400">
                      <tr>
                        <th className="py-2">Date</th>
                        <th className="py-2">Amount</th>
                        <th className="py-2">Method / Ref</th>
                        <th className="py-2">Rent</th>
                        <th className="py-2">Elec.</th>
                        <th className="py-2">WiFi</th>
                        <th className="py-2">Other</th>
                        <th className="py-2">Prev. Due</th>
                        <th className="py-2">Advance</th>
                        <th className="py-2">Status</th>
                        <th className="py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {billPayments.map((pmt) => (
                        <tr key={pmt._id} className={pmt.status === 'reversed' ? 'opacity-50' : ''}>
                          <td className="py-2">{pmt.paymentDate}</td>
                          <td className="py-2 font-semibold">{formatCurrency(pmt.amountReceived)}</td>
                          <td className="py-2">
                            {pmt.paymentMethod}
                            {pmt.transactionReference ? ` · ${pmt.transactionReference}` : ''}
                          </td>
                          <td className="py-2">{formatCurrency(pmt.rentAllocation)}</td>
                          <td className="py-2">{formatCurrency(pmt.electricityAllocation)}</td>
                          <td className="py-2">{formatCurrency(pmt.wifiAllocation)}</td>
                          <td className="py-2">{formatCurrency(pmt.otherAllocation)}</td>
                          <td className="py-2">{formatCurrency(pmt.previousDueAllocation)}</td>
                          <td className="py-2">{formatCurrency(pmt.advanceAllocation)}</td>
                          <td className="py-2">
                            {pmt.status === 'reversed' ? (
                              <span className="text-rose-600" title={pmt.reversalReason}>
                                Reversed
                              </span>
                            ) : (
                              <span className="text-emerald-700">Completed</span>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            {pmt.status === 'completed' && !activeBill.isLocked && (
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => {
                                  setReversingPaymentId(pmt._id)
                                  setReversalReason('')
                                }}
                              >
                                <RotateCcw className="size-3" /> Reverse
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {reversingPaymentId && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs">
                  <span className="font-semibold text-rose-800">Reverse payment (preserves audit record):</span>
                  <input
                    type="text"
                    placeholder="Reason for reversal *"
                    value={reversalReason}
                    onChange={(e) => setReversalReason(e.target.value)}
                    className="h-7 flex-1 rounded border border-rose-300 bg-white px-2.5 text-xs"
                  />
                  <Button
                    size="xs"
                    variant="destructive"
                    disabled={billActionBusy}
                    onClick={() => handleReversePayment(reversingPaymentId)}
                  >
                    Confirm Reversal
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => setReversingPaymentId(null)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Shared Collect Payment Modal */}
      <CollectPaymentModal
        target={collectTarget}
        onClose={() => setCollectTarget(null)}
        onSuccess={() => {
          loadWorkspace(selectedMonth)
          if (activeBillId) {
            loadBillPayments(activeBillId)
          }
          setNotice('Payment recorded and bill balances updated.')
        }}
      />
    </main>
  )
}
