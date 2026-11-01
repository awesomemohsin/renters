'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, DollarSign, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatRoomNumber } from '@/lib/utils'

export type CollectibleBillTarget = {
  billId: string
  billingMonth: string
  residentId: string
  residentName: string
  roomNumber: number
  floor: number
  rentDue: number
  electricityDue: number
  wifiDue: number
  otherDue: number
  previousDueRemaining: number
  totalPayable: number
  totalPaid: number
  remainingDue: number
}

function roundTwo(val: number): number {
  return Math.round((Number(val || 0) + Number.EPSILON) * 100) / 100
}

export function CollectPaymentModal({
  target,
  onClose,
  onSuccess,
}: {
  target: CollectibleBillTarget | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [amountReceived, setAmountReceived] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Bank' | 'Mobile Banking' | 'Other'>('Cash')
  const [transactionReference, setTransactionReference] = useState('')
  const [notes, setNotes] = useState('')

  const [rentAllocation, setRentAllocation] = useState('0')
  const [electricityAllocation, setElectricityAllocation] = useState('0')
  const [wifiAllocation, setWifiAllocation] = useState('0')
  const [otherAllocation, setOtherAllocation] = useState('0')
  const [previousDueAllocation, setPreviousDueAllocation] = useState('0')
  const [advanceAllocation, setAdvanceAllocation] = useState('0')
  const [confirmAdvance, setConfirmAdvance] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!target) return
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setAmountReceived(String(target.remainingDue > 0 ? target.remainingDue : 0))
    setPaymentMethod('Cash')
    setTransactionReference('')
    setNotes('')
    setRentAllocation(String(target.rentDue))
    setElectricityAllocation(String(target.electricityDue))
    setWifiAllocation(String(target.wifiDue))
    setOtherAllocation(String(target.otherDue))
    setPreviousDueAllocation(String(target.previousDueRemaining))
    setAdvanceAllocation('0')
    setConfirmAdvance(false)
    setError('')
  }, [target])

  if (!target) return null

  const numAmount = roundTwo(Number(amountReceived || 0))
  const numRent = roundTwo(Number(rentAllocation || 0))
  const numElec = roundTwo(Number(electricityAllocation || 0))
  const numWifi = roundTwo(Number(wifiAllocation || 0))
  const numOther = roundTwo(Number(otherAllocation || 0))
  const numPrev = roundTwo(Number(previousDueAllocation || 0))
  const numAdv = roundTwo(Number(advanceAllocation || 0))

  const sumAllocated = roundTwo(numRent + numElec + numWifi + numOther + numPrev + numAdv)
  const difference = roundTwo(numAmount - sumAllocated)

  const fillFullDue = () => {
    setAmountReceived(String(target.remainingDue))
    setRentAllocation(String(target.rentDue))
    setElectricityAllocation(String(target.electricityDue))
    setWifiAllocation(String(target.wifiDue))
    setOtherAllocation(String(target.otherDue))
    setPreviousDueAllocation(String(target.previousDueRemaining))
    setAdvanceAllocation('0')
    setConfirmAdvance(false)
    setError('')
  }

  const distributeAmountReceived = () => {
    let remaining = roundTwo(Math.max(0, Number(amountReceived || 0)))
    const prev = roundTwo(Math.min(target.previousDueRemaining, remaining))
    remaining = roundTwo(remaining - prev)
    const rent = roundTwo(Math.min(target.rentDue, remaining))
    remaining = roundTwo(remaining - rent)
    const elec = roundTwo(Math.min(target.electricityDue, remaining))
    remaining = roundTwo(remaining - elec)
    const wifi = roundTwo(Math.min(target.wifiDue, remaining))
    remaining = roundTwo(remaining - wifi)
    const other = roundTwo(Math.min(target.otherDue, remaining))
    remaining = roundTwo(remaining - other)
    const adv = roundTwo(Math.max(0, remaining))

    setPreviousDueAllocation(String(prev))
    setRentAllocation(String(rent))
    setElectricityAllocation(String(elec))
    setWifiAllocation(String(wifi))
    setOtherAllocation(String(other))
    setAdvanceAllocation(String(adv))
    if (adv <= 0) setConfirmAdvance(false)
    setError('')
  }

  const clearAllocations = () => {
    setRentAllocation('0')
    setElectricityAllocation('0')
    setWifiAllocation('0')
    setOtherAllocation('0')
    setPreviousDueAllocation('0')
    setAdvanceAllocation('0')
    setConfirmAdvance(false)
    setError('')
  }

  const submitPayment = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setError('Amount received must be greater than 0.')
      return
    }
    if (numRent < 0 || numElec < 0 || numWifi < 0 || numOther < 0 || numPrev < 0 || numAdv < 0) {
      setError('Payment allocations cannot be negative.')
      return
    }
    if (Math.abs(difference) > 0.001) {
      setError(
        `Sum of manual allocations (${formatCurrency(sumAllocated)}) must equal Amount Received (${formatCurrency(numAmount)}).`,
      )
      return
    }
    if (numAdv > 0 && !confirmAdvance) {
      setError('Please confirm recording the excess allocation as Advance Credit.')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/monthly-bills/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billId: target.billId,
          paymentDate,
          amountReceived: numAmount,
          paymentMethod,
          transactionReference,
          notes,
          rentAllocation: numRent,
          electricityAllocation: numElec,
          wifiAllocation: numWifi,
          otherAllocation: numOther,
          previousDueAllocation: numPrev,
          advanceAllocation: numAdv,
          confirmAdvance,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'Failed to record payment.')
      } else {
        onSuccess()
        onClose()
      }
    } catch {
      setError('Network error while recording payment.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="collect-payment-title"
        className="my-8 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Payment collection · {target.billingMonth}
            </p>
            <h3 id="collect-payment-title" className="mt-1 text-xl font-semibold text-slate-950">
              {target.residentName} · Room {formatRoomNumber(target.roomNumber)}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Total Payable: <span className="font-semibold text-slate-800">{formatCurrency(target.totalPayable)}</span>
              {' · '}Paid: <span className="font-semibold text-emerald-700">{formatCurrency(target.totalPaid)}</span>
              {' · '}Remaining Due:{' '}
              <span className="font-semibold text-rose-600">{formatCurrency(target.remainingDue)}</span>
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </div>

        <form onSubmit={submitPayment} className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
              Payment Date *
              <input
                required
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="h-9 rounded-md border border-slate-200 px-3 text-sm font-normal"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
              Amount Received (৳) *
              <input
                required
                min="0.01"
                step="0.01"
                type="number"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                className="h-9 rounded-md border border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-950"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
              Payment Method *
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-normal"
              >
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
                <option value="Mobile Banking">Mobile Banking</option>
                <option value="Other">Other</option>
              </select>
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Manual Category Allocation
                </p>
                <p className="text-xs text-slate-500">
                  Specify exactly how much of {formatCurrency(numAmount)} applies to each bill category.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" variant="outline" size="xs" onClick={distributeAmountReceived}>
                  <Sparkles className="size-3" /> Match Amount Received
                </Button>
                <Button type="button" variant="outline" size="xs" onClick={fillFullDue}>
                  Full Remaining Due
                </Button>
                <Button type="button" variant="ghost" size="xs" onClick={clearAllocations}>
                  Clear
                </Button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Rent Allocation</span>
                  <span className="text-slate-500">Due: {formatCurrency(target.rentDue)}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rentAllocation}
                  onChange={(e) => setRentAllocation(e.target.value)}
                  className="mt-1 h-8 rounded border border-slate-200 px-2.5 text-sm"
                />
              </label>

              <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Electricity Allocation</span>
                  <span className="text-slate-500">Due: {formatCurrency(target.electricityDue)}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={electricityAllocation}
                  onChange={(e) => setElectricityAllocation(e.target.value)}
                  className="mt-1 h-8 rounded border border-slate-200 px-2.5 text-sm"
                />
              </label>

              <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">WiFi Allocation</span>
                  <span className="text-slate-500">Due: {formatCurrency(target.wifiDue)}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={wifiAllocation}
                  onChange={(e) => setWifiAllocation(e.target.value)}
                  className="mt-1 h-8 rounded border border-slate-200 px-2.5 text-sm"
                />
              </label>

              <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Other Charges Allocation</span>
                  <span className="text-slate-500">Due: {formatCurrency(target.otherDue)}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={otherAllocation}
                  onChange={(e) => setOtherAllocation(e.target.value)}
                  className="mt-1 h-8 rounded border border-slate-200 px-2.5 text-sm"
                />
              </label>

              <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Previous Due Allocation</span>
                  <span className="text-slate-500">Due: {formatCurrency(target.previousDueRemaining)}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={previousDueAllocation}
                  onChange={(e) => setPreviousDueAllocation(e.target.value)}
                  className="mt-1 h-8 rounded border border-slate-200 px-2.5 text-sm"
                />
              </label>

              <label className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Advance Credit (Overpayment)</span>
                  <span className="text-slate-500">Future credit</span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={advanceAllocation}
                  onChange={(e) => setAdvanceAllocation(e.target.value)}
                  className="mt-1 h-8 rounded border border-slate-200 px-2.5 text-sm"
                />
              </label>
            </div>

            {numAdv > 0 && (
              <label className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <input
                  type="checkbox"
                  checked={confirmAdvance}
                  onChange={(e) => setConfirmAdvance(e.target.checked)}
                  className="size-4 rounded border-amber-300"
                />
                <span>
                  Confirm recording <strong>{formatCurrency(numAdv)}</strong> as Advance Credit on {target.residentName}
                  &apos;s balance.
                </span>
              </label>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs">
              <div className="flex items-center gap-4">
                <span>
                  Amount Received: <strong className="text-slate-900">{formatCurrency(numAmount)}</strong>
                </span>
                <span>
                  Total Allocated: <strong className="text-slate-900">{formatCurrency(sumAllocated)}</strong>
                </span>
              </div>
              <span
                className={`font-semibold ${
                  Math.abs(difference) < 0.001 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {Math.abs(difference) < 0.001 ? (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="size-3.5" /> Balanced
                  </span>
                ) : (
                  `Unallocated difference: ${formatCurrency(difference)}`
                )}
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
              Transaction Reference (optional)
              <input
                type="text"
                placeholder="Receipt #, bKash TrxID, Bank ref..."
                value={transactionReference}
                onChange={(e) => setTransactionReference(e.target.value)}
                className="h-9 rounded-md border border-slate-200 px-3 text-sm font-normal"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
              Notes (optional)
              <input
                type="text"
                placeholder="Optional payment note"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9 rounded-md border border-slate-200 px-3 text-sm font-normal"
              />
            </label>
          </div>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              <DollarSign data-icon="inline-start" />
              {submitting ? 'Recording...' : `Record Payment (${formatCurrency(numAmount)})`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

