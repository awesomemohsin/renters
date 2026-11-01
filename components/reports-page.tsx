'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  Filter,
  Layers,
  Phone,
  Printer,
  RefreshCw,
  Search,
  TrendingUp,
  User,
  Wifi,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatRoomNumber } from '@/lib/utils'

type SummaryData = {
  monthlyRentCollection: number
  monthlyElectricityCollection: number
  monthlyWifiCollection: number
  totalAmountBilled: number
  totalAmountCollected: number
  totalOutstandingDue: number
  previousMonthOutstanding: number
  collectionRate: number
  totalBillsCount: number
  paidBillsCount: number
  partiallyPaidBillsCount: number
  unpaidBillsCount: number
}

type MonthlyIncomeItem = {
  billingMonth: string
  totalBilled: number
  totalCollected: number
  totalDue: number
  rentBilled: number
  rentCollected: number
  elecBilled: number
  elecCollected: number
  wifiBilled: number
  wifiCollected: number
  billCount: number
  collectionRate: number
}

type ResidentOutstandingItem = {
  billId: string
  residentId: string
  residentName: string
  phone: string
  roomNumber: number
  floor: number
  billingMonth: string
  monthlyRent: number
  totalElectricity: number
  wifiCharge: number
  previousOutstanding: number
  totalPayable: number
  totalPaid: number
  remainingDue: number
  unpaidRent: number
  unpaidElectricity: number
  unpaidWifi: number
  status: 'paid' | 'partially_paid' | 'unpaid'
}

type RoomBillingItem = {
  roomId: string
  roomNumber: number
  floor: number
  status: 'occupied' | 'vacant'
  currentResident: string | null
  monthlyRent: number
  billsCount: number
  totalBilled: number
  totalPaid: number
  remainingDue: number
}

type ElectricityConsumptionItem = {
  readingId: string
  roomId: string
  roomNumber: number
  floor: number
  billingMonth: string
  residentName: string
  previousReading: number
  currentReading: number
  consumption: number
  readingDate: string
  mainMeterShare: number
  additionalCharge: number
  finalElectricityAmount: number
  status: string
}

type MainMeterDistributionItem = {
  meterId: string
  slotNumber: number
  name: string
  meterNumber: string
  location: string
  status: 'active' | 'inactive'
  assignedRooms: number[]
  assignedRoomsCount: number
  billingMonth: string
  billAmount: number
  totalUnits: number
  unitRate: number
  billReference: string
}

type WiFiBillingItem = {
  configId: string
  residentId: string
  residentName: string
  roomNumber: number | null
  floor: number | null
  wifiName: string
  monthlyCharge: number
  status: 'active' | 'inactive'
  totalDevicesCount: number
  activeDevicesCount: number
  totalWifiBilled: number
  totalWifiPaid: number
  unpaidWifi: number
  startDate: string
}

type PaymentHistoryItem = {
  paymentId: string
  billId: string
  residentId: string
  residentName: string
  roomNumber: number
  billingMonth: string
  paymentDate: string
  amountReceived: number
  paymentMethod: string
  transactionReference: string
  status: string
  notes: string
  allocations: { category: string; amount: number }[]
  createdAt: string
}

type ReportsResponse = {
  availableMonths: string[]
  selectedFilters: {
    month: string
    floor: number | null
    roomNumber: number | null
    residentId: string | null
  }
  summary: SummaryData
  monthlyIncomeSummary: MonthlyIncomeItem[]
  residentOutstandingReport: ResidentOutstandingItem[]
  roomBillingSummary: RoomBillingItem[]
  electricityConsumptionSummary: ElectricityConsumptionItem[]
  mainMeterBillDistribution: MainMeterDistributionItem[]
  wifiBillingSummary: WiFiBillingItem[]
  paymentHistory: PaymentHistoryItem[]
  partialAndUnpaidBills: ResidentOutstandingItem[]
}

type TabType =
  | 'income'
  | 'residents'
  | 'rooms'
  | 'electricity'
  | 'meters'
  | 'wifi'
  | 'payments'
  | 'unpaid'

export function ReportsPage() {
  const [data, setData] = useState<ReportsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [selectedFloor, setSelectedFloor] = useState<string>('all')
  const [selectedRoom, setSelectedRoom] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('income')

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (selectedMonth && selectedMonth !== 'all') {
        params.set('month', selectedMonth)
      }
      if (selectedFloor && selectedFloor !== 'all') {
        params.set('floor', selectedFloor)
      }
      if (selectedRoom && selectedRoom !== 'all') {
        params.set('roomNumber', selectedRoom)
      }

      const res = await fetch(`/api/reports?${params.toString()}`)
      if (!res.ok) {
        throw new Error('Failed to load financial reports data.')
      }
      const json: ReportsResponse = await res.json()
      setData(json)
      if (!selectedMonth && json.availableMonths?.length > 0) {
        // default to latest month
        setSelectedMonth(json.availableMonths[0])
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading reports')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, selectedFloor, selectedRoom])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  // Filtered resident report based on text search
  const filteredResidents = useMemo(() => {
    if (!data?.residentOutstandingReport) return []
    const q = searchQuery.toLowerCase().trim()
    if (!q) return data.residentOutstandingReport
    return data.residentOutstandingReport.filter(
      (r) =>
        r.residentName.toLowerCase().includes(q) ||
        String(r.roomNumber).includes(q) ||
        r.phone.includes(q),
    )
  }, [data?.residentOutstandingReport, searchQuery])

  // Filtered unpaid bills based on text search
  const filteredUnpaid = useMemo(() => {
    if (!data?.partialAndUnpaidBills) return []
    const q = searchQuery.toLowerCase().trim()
    if (!q) return data.partialAndUnpaidBills
    return data.partialAndUnpaidBills.filter(
      (r) =>
        r.residentName.toLowerCase().includes(q) ||
        String(r.roomNumber).includes(q) ||
        r.phone.includes(q),
    )
  }, [data?.partialAndUnpaidBills, searchQuery])

  // Filtered payments based on text search
  const filteredPayments = useMemo(() => {
    if (!data?.paymentHistory) return []
    const q = searchQuery.toLowerCase().trim()
    if (!q) return data.paymentHistory
    return data.paymentHistory.filter(
      (p) =>
        p.residentName.toLowerCase().includes(q) ||
        String(p.roomNumber).includes(q) ||
        p.transactionReference.toLowerCase().includes(q) ||
        p.paymentMethod.toLowerCase().includes(q),
    )
  }, [data?.paymentHistory, searchQuery])

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-6 print:m-0 print:p-0">
      {/* Top Header & Global Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Financial Reports & Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Complete financial visibility across rent, electricity, WiFi, collections, and dues.
          </p>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchReports}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="flex items-center gap-1.5"
          >
            <Printer className="h-4 w-4" />
            Print Report
          </Button>
        </div>
      </div>

      {/* Global Filter Bar */}
      <div className="bg-card border rounded-lg p-4 shadow-sm space-y-3 print:hidden">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          Filter Records
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Month Filter */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Billing Month
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Available Months</option>
              {data?.availableMonths?.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Floor Filter */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Floor</label>
            <select
              value={selectedFloor}
              onChange={(e) => setSelectedFloor(e.target.value)}
              className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Floors (1 - 5)</option>
              {[1, 2, 3, 4, 5].map((fl) => (
                <option key={fl} value={String(fl)}>
                  Floor {fl}
                </option>
              ))}
            </select>
          </div>

          {/* Room Filter */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Room</label>
            <select
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All 26 Rooms</option>
              {Array.from({ length: 26 }, (_, i) => i + 1).map((rn) => (
                <option key={rn} value={String(rn)}>
                  {formatRoomNumber(rn)}
                </option>
              ))}
            </select>
          </div>

          {/* Search Query */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Search by Resident / Phone
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Name, room, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-background border border-input rounded-md pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* PART B: 8 CORE KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* 1. Monthly Rent Collection */}
        <div className="bg-card border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Rent Collection</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-foreground">
            {formatCurrency(data?.summary.monthlyRentCollection ?? 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Paid on rent charges</div>
        </div>

        {/* 2. Monthly Electricity Collection */}
        <div className="bg-card border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Electricity Collection</span>
            <Zap className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-foreground">
            {formatCurrency(data?.summary.monthlyElectricityCollection ?? 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Meter share & surcharge</div>
        </div>

        {/* 3. Monthly WiFi Collection */}
        <div className="bg-card border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">WiFi Collection</span>
            <Wifi className="h-4 w-4 text-sky-500" />
          </div>
          <div className="text-xl font-bold text-foreground">
            {formatCurrency(data?.summary.monthlyWifiCollection ?? 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Paid on active WiFi</div>
        </div>

        {/* 4. Total Amount Billed */}
        <div className="bg-card border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Total Billed</span>
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <div className="text-xl font-bold text-foreground">
            {formatCurrency(data?.summary.totalAmountBilled ?? 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {data?.summary.totalBillsCount ?? 0} total invoices
          </div>
        </div>

        {/* 5. Total Amount Collected */}
        <div className="bg-card border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Total Collected</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-emerald-600">
            {formatCurrency(data?.summary.totalAmountCollected ?? 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {data?.summary.paidBillsCount ?? 0} fully paid bills
          </div>
        </div>

        {/* 6. Total Outstanding Due */}
        <div className="bg-card border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Total Outstanding</span>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold text-rose-600">
            {formatCurrency(data?.summary.totalOutstandingDue ?? 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {data?.summary.unpaidBillsCount ?? 0} unpaid /{' '}
            {data?.summary.partiallyPaidBillsCount ?? 0} partial
          </div>
        </div>

        {/* 7. Previous Month Outstanding */}
        <div className="bg-card border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Carried Dues</span>
            <Clock className="h-4 w-4 text-orange-500" />
          </div>
          <div className="text-xl font-bold text-orange-600">
            {formatCurrency(data?.summary.previousMonthOutstanding ?? 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Billed from prior months</div>
        </div>

        {/* 8. Current Collection Rate */}
        <div className="bg-card border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Collection Rate</span>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-xl font-bold text-foreground">
            {data?.summary.collectionRate ?? 0}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {data?.summary.collectionRate ?? 0 >= 80 ? 'Good pacing' : 'Action needed'}
          </div>
        </div>
      </div>

      {/* PART C: NAVIGATION TABS */}
      <div className="border-b border-border print:hidden">
        <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto pb-1 text-sm font-medium">
          {[
            { id: 'income', label: 'Income & Collections', icon: TrendingUp },
            { id: 'residents', label: 'Resident Balances', icon: User },
            { id: 'rooms', label: 'Room Billing (26 Rooms)', icon: Layers },
            { id: 'electricity', label: 'Electricity Consumption', icon: Zap },
            { id: 'meters', label: 'Main Meter Distribution', icon: BarChart3 },
            { id: 'wifi', label: 'WiFi Services', icon: Wifi },
            { id: 'payments', label: 'Payment Ledger', icon: CreditCard },
            { id: 'unpaid', label: 'Unpaid & Partial Bills', icon: AlertTriangle },
          ].map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-1.5 px-3 py-2 border-b-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* TAB CONTENT SECTIONS */}

      {/* 1. Monthly Income & Collection Summary */}
      {activeTab === 'income' && (
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-muted/40 flex items-center justify-between">
            <h2 className="font-semibold text-base text-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Monthly Income & Collection Trend
            </h2>
            <span className="text-xs text-muted-foreground">
              {data?.monthlyIncomeSummary?.length ?? 0} Billing Cycles Recorded
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-xs text-muted-foreground uppercase border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold">Month</th>
                  <th className="px-4 py-3 font-semibold">Bills</th>
                  <th className="px-4 py-3 font-semibold text-right">Rent Billed</th>
                  <th className="px-4 py-3 font-semibold text-right">Rent Collected</th>
                  <th className="px-4 py-3 font-semibold text-right">Elec Billed</th>
                  <th className="px-4 py-3 font-semibold text-right">WiFi Billed</th>
                  <th className="px-4 py-3 font-semibold text-right">Total Billed</th>
                  <th className="px-4 py-3 font-semibold text-right">Total Collected</th>
                  <th className="px-4 py-3 font-semibold text-right">Outstanding Due</th>
                  <th className="px-4 py-3 font-semibold text-right">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.monthlyIncomeSummary?.length ? (
                  data.monthlyIncomeSummary.map((m) => (
                    <tr key={m.billingMonth} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">{m.billingMonth}</td>
                      <td className="px-4 py-3 text-muted-foreground">{m.billCount}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(m.rentBilled)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">
                        {formatCurrency(m.rentCollected)}
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(m.elecBilled)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(m.wifiBilled)}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {formatCurrency(m.totalBilled)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                        {formatCurrency(m.totalCollected)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-rose-600">
                        {formatCurrency(m.totalDue)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                            m.collectionRate >= 90
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : m.collectionRate >= 70
                                ? 'bg-amber-500/10 text-amber-600'
                                : 'bg-rose-500/10 text-rose-600'
                          }`}
                        >
                          {m.collectionRate}%
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                      No monthly billing records found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Resident-wise Outstanding Balance */}
      {activeTab === 'residents' && (
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-muted/40 flex items-center justify-between">
            <h2 className="font-semibold text-base text-foreground flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Resident Balances & Statement Breakdown
            </h2>
            <span className="text-xs text-muted-foreground">
              {filteredResidents.length} Accounts Listed
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-xs text-muted-foreground uppercase border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold">Resident</th>
                  <th className="px-4 py-3 font-semibold">Room</th>
                  <th className="px-4 py-3 font-semibold">Month</th>
                  <th className="px-4 py-3 font-semibold text-right">Rent</th>
                  <th className="px-4 py-3 font-semibold text-right">Electricity</th>
                  <th className="px-4 py-3 font-semibold text-right">WiFi</th>
                  <th className="px-4 py-3 font-semibold text-right">Carried Due</th>
                  <th className="px-4 py-3 font-semibold text-right">Payable</th>
                  <th className="px-4 py-3 font-semibold text-right">Paid</th>
                  <th className="px-4 py-3 font-semibold text-right">Balance Due</th>
                  <th className="px-4 py-3 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredResidents.length ? (
                  filteredResidents.map((r) => (
                    <tr key={r.billId} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link
                          href={`/residents/${r.residentId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {r.residentName}
                        </Link>
                        <div className="text-xs text-muted-foreground">{r.phone}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{formatRoomNumber(r.roomNumber)}</span>
                        <div className="text-xs text-muted-foreground">Floor {r.floor}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.billingMonth}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(r.monthlyRent)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(r.totalElectricity)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(r.wifiCharge)}</td>
                      <td className="px-4 py-3 text-right text-orange-600">
                        {formatCurrency(r.previousOutstanding)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {formatCurrency(r.totalPayable)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-semibold">
                        {formatCurrency(r.totalPaid)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-rose-600">
                        {formatCurrency(r.remainingDue)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                            r.status === 'paid'
                              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                              : r.status === 'partially_paid'
                                ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                          }`}
                        >
                          {r.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                      No resident statements matching the criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Room-wise Billing Summary (26 Rooms) */}
      {activeTab === 'rooms' && (
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-muted/40 flex items-center justify-between">
            <h2 className="font-semibold text-base text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Building Room Billing Matrix (All 26 Rooms)
            </h2>
            <span className="text-xs text-muted-foreground">
              {data?.roomBillingSummary?.length ?? 0} Rooms Displayed
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-xs text-muted-foreground uppercase border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold">Room #</th>
                  <th className="px-4 py-3 font-semibold">Floor</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Current Resident</th>
                  <th className="px-4 py-3 font-semibold text-right">Monthly Rent</th>
                  <th className="px-4 py-3 font-semibold text-right">Bills Issued</th>
                  <th className="px-4 py-3 font-semibold text-right">Total Billed</th>
                  <th className="px-4 py-3 font-semibold text-right">Total Paid</th>
                  <th className="px-4 py-3 font-semibold text-right">Current Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.roomBillingSummary?.length ? (
                  data.roomBillingSummary.map((rm) => (
                    <tr key={rm.roomId} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-bold text-foreground">
                        {formatRoomNumber(rm.roomNumber)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">Floor {rm.floor}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${
                            rm.status === 'occupied'
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {rm.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {rm.currentResident ? (
                          <span className="font-medium text-foreground">{rm.currentResident}</span>
                        ) : (
                          <span className="text-muted-foreground italic">Vacant</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(rm.monthlyRent)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {rm.billsCount}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {formatCurrency(rm.totalBilled)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-semibold">
                        {formatCurrency(rm.totalPaid)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-rose-600">
                        {formatCurrency(rm.remainingDue)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      No rooms found for selected filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Electricity Consumption & Distribution */}
      {activeTab === 'electricity' && (
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-muted/40 flex items-center justify-between">
            <h2 className="font-semibold text-base text-foreground flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Room Sub-Meter Electricity Consumption & Charges
            </h2>
            <span className="text-xs text-muted-foreground">
              Month: {selectedMonth || 'All Months'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-xs text-muted-foreground uppercase border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold">Room</th>
                  <th className="px-4 py-3 font-semibold">Floor</th>
                  <th className="px-4 py-3 font-semibold">Resident</th>
                  <th className="px-4 py-3 font-semibold text-right">Previous kWh</th>
                  <th className="px-4 py-3 font-semibold text-right">Current kWh</th>
                  <th className="px-4 py-3 font-semibold text-right">Consumption</th>
                  <th className="px-4 py-3 font-semibold text-right">Main Meter Share</th>
                  <th className="px-4 py-3 font-semibold text-right">+৳1/Unit Surcharge</th>
                  <th className="px-4 py-3 font-semibold text-right">Total Electricity</th>
                  <th className="px-4 py-3 font-semibold text-center">Cycle Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.electricityConsumptionSummary?.length ? (
                  data.electricityConsumptionSummary.map((e) => (
                    <tr key={e.readingId} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {formatRoomNumber(e.roomNumber)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">Floor {e.floor}</td>
                      <td className="px-4 py-3 text-foreground">{e.residentName}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {e.previousReading}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {e.currentReading}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-amber-600">
                        {e.consumption} kWh
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(e.mainMeterShare)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {formatCurrency(e.additionalCharge)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">
                        {formatCurrency(e.finalElectricityAmount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                            e.status === 'finalized'
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : 'bg-amber-500/10 text-amber-600'
                          }`}
                        >
                          {e.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                      No electricity consumption records found for the selected filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Main Meter Distribution */}
      {activeTab === 'meters' && (
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-muted/40 flex items-center justify-between">
            <h2 className="font-semibold text-base text-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              10 Main Electricity Meters & Bill Distribution
            </h2>
            <span className="text-xs text-muted-foreground">
              Month: {selectedMonth || 'All Months'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-xs text-muted-foreground uppercase border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold">Slot #</th>
                  <th className="px-4 py-3 font-semibold">Meter Name</th>
                  <th className="px-4 py-3 font-semibold">Serial #</th>
                  <th className="px-4 py-3 font-semibold">Assigned Rooms</th>
                  <th className="px-4 py-3 font-semibold text-right">Total kWh</th>
                  <th className="px-4 py-3 font-semibold text-right">Main Bill (৳)</th>
                  <th className="px-4 py-3 font-semibold text-right">Derived Unit Rate</th>
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.mainMeterBillDistribution?.map((m) => (
                  <tr key={m.meterId} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-semibold text-muted-foreground">
                      #{String(m.slotNumber).padStart(2, '0')}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{m.name}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {m.meterNumber}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {m.assignedRooms.length ? (
                          m.assignedRooms.map((rn) => (
                            <span
                              key={rn}
                              className="px-1.5 py-0.5 rounded text-xs bg-muted font-medium"
                            >
                              R{rn}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-rose-500 italic">No rooms assigned</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{m.totalUnits}</td>
                    <td className="px-4 py-3 text-right font-bold text-foreground">
                      {formatCurrency(m.billAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-primary">
                      ৳{m.unitRate.toFixed(2)}/kWh
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{m.billReference}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                          m.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. WiFi Billing Summary */}
      {activeTab === 'wifi' && (
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-muted/40 flex items-center justify-between">
            <h2 className="font-semibold text-base text-foreground flex items-center gap-2">
              <Wifi className="h-4 w-4 text-sky-500" />
              Active WiFi Configurations & Collections
            </h2>
            <span className="text-xs text-muted-foreground">
              {data?.wifiBillingSummary?.length ?? 0} Subscriptions
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-xs text-muted-foreground uppercase border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold">Resident</th>
                  <th className="px-4 py-3 font-semibold">Room</th>
                  <th className="px-4 py-3 font-semibold">SSID / WiFi Name</th>
                  <th className="px-4 py-3 font-semibold text-center">Active Devices</th>
                  <th className="px-4 py-3 font-semibold text-right">Monthly Charge</th>
                  <th className="px-4 py-3 font-semibold text-right">Total WiFi Billed</th>
                  <th className="px-4 py-3 font-semibold text-right">Total WiFi Paid</th>
                  <th className="px-4 py-3 font-semibold text-right">Unpaid Balance</th>
                  <th className="px-4 py-3 font-semibold">Start Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.wifiBillingSummary?.length ? (
                  data.wifiBillingSummary.map((w) => (
                    <tr key={w.configId} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link
                          href={`/residents/${w.residentId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {w.residentName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {w.roomNumber ? formatRoomNumber(w.roomNumber) : '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{w.wifiName}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-sky-500/10 text-sky-600 font-semibold">
                          <Wifi className="h-3 w-3" />
                          {w.activeDevicesCount} / {w.totalDevicesCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {formatCurrency(w.monthlyCharge)}
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(w.totalWifiBilled)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                        {formatCurrency(w.totalWifiPaid)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-rose-600">
                        {formatCurrency(w.unpaidWifi)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{w.startDate}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      No active WiFi configurations found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. Payment History (Audit Trail) */}
      {activeTab === 'payments' && (
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-muted/40 flex items-center justify-between">
            <h2 className="font-semibold text-base text-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-600" />
              Payment Collection Ledger & Category Allocations
            </h2>
            <span className="text-xs text-muted-foreground">
              {filteredPayments.length} Payment Transactions
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-xs text-muted-foreground uppercase border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Resident</th>
                  <th className="px-4 py-3 font-semibold">Room</th>
                  <th className="px-4 py-3 font-semibold">Month</th>
                  <th className="px-4 py-3 font-semibold text-right">Amount Received</th>
                  <th className="px-4 py-3 font-semibold">Method</th>
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 font-semibold">Category Allocation Details</th>
                  <th className="px-4 py-3 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredPayments.length ? (
                  filteredPayments.map((p) => (
                    <tr key={p.paymentId} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">{p.paymentDate}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/residents/${p.residentId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {p.residentName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium">{formatRoomNumber(p.roomNumber)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.billingMonth}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">
                        {formatCurrency(p.amountReceived)}
                      </td>
                      <td className="px-4 py-3 font-medium">{p.paymentMethod}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {p.transactionReference}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 text-xs">
                          {p.allocations.map((a, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
                            >
                              {a.category}: ৳{a.amount}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                            p.status === 'valid'
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : 'bg-rose-500/10 text-rose-600'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      No payments found for the selected filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. Partial & Unpaid Accounts */}
      {activeTab === 'unpaid' && (
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-muted/40 flex items-center justify-between">
            <h2 className="font-semibold text-base text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              Accounts Requiring Action (Unpaid & Partially Paid)
            </h2>
            <span className="text-xs font-semibold text-rose-600">
              {filteredUnpaid.length} Pending Accounts
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-xs text-muted-foreground uppercase border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold">Resident</th>
                  <th className="px-4 py-3 font-semibold">Room</th>
                  <th className="px-4 py-3 font-semibold">Billing Month</th>
                  <th className="px-4 py-3 font-semibold text-right">Rent Due</th>
                  <th className="px-4 py-3 font-semibold text-right">Elec Due</th>
                  <th className="px-4 py-3 font-semibold text-right">WiFi Due</th>
                  <th className="px-4 py-3 font-semibold text-right">Carried Due</th>
                  <th className="px-4 py-3 font-semibold text-right">Total Payable</th>
                  <th className="px-4 py-3 font-semibold text-right">Paid</th>
                  <th className="px-4 py-3 font-semibold text-right">Remaining Balance</th>
                  <th className="px-4 py-3 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredUnpaid.length ? (
                  filteredUnpaid.map((item) => (
                    <tr key={item.billId} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link
                          href={`/residents/${item.residentId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {item.residentName}
                        </Link>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" />
                          <a href={`tel:${item.phone}`} className="hover:underline">
                            {item.phone}
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold">{formatRoomNumber(item.roomNumber)}</span>
                        <div className="text-xs text-muted-foreground">Floor {item.floor}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{item.billingMonth}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(item.unpaidRent)}</td>
                      <td className="px-4 py-3 text-right">
                        {formatCurrency(item.unpaidElectricity)}
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(item.unpaidWifi)}</td>
                      <td className="px-4 py-3 text-right text-orange-600">
                        {formatCurrency(item.previousOutstanding)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {formatCurrency(item.totalPayable)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                        {formatCurrency(item.totalPaid)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-rose-600 text-base">
                        {formatCurrency(item.remainingDue)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                            item.status === 'partially_paid'
                              ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                          }`}
                        >
                          {item.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-emerald-600 font-medium">
                      🎉 Outstanding balance is zero! All bills are fully settled for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
