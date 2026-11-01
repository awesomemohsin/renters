import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const bdtNumberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

export function formatCurrency(amount?: number | null, fallback = 'Not set'): string {
  if (amount == null || !Number.isFinite(amount)) return fallback
  return `৳${bdtNumberFormatter.format(amount)}`
}

export function formatRoomNumber(roomNumber: number): string {
  return String(roomNumber).padStart(2, '0')
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function formatBillingMonth(billingMonth: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(billingMonth.trim())
  if (!match) return billingMonth
  const year = match[1]
  const monthIndex = Number(match[2]) - 1
  return `${MONTH_NAMES[monthIndex]} ${year}`
}
