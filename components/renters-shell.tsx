'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignOutButton } from './sign-out-button'
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Droplets,
  Home,
  LayoutDashboard,
  MoreHorizontal,
  ShieldCheck,
  Wifi,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

type NavItem = {
  label: string
  shortLabel?: string
  icon: LucideIcon
  href: string
  description?: string
}

const navigation: NavItem[] = [
  { label: 'Overview', shortLabel: 'Home', icon: LayoutDashboard, href: '/', description: 'All-in-one building desk & 26 room cards' },
  { label: 'Rooms', shortLabel: 'Rooms', icon: Home, href: '/rooms', description: 'Occupancy and floor assignments' },
  { label: 'Residents', shortLabel: 'Residents', icon: ClipboardList, href: '/residents', description: 'Renter profiles, contacts, and quick collections' },
  { label: 'Monthly records', shortLabel: 'Bills', icon: CalendarDays, href: '/monthly-records', description: 'Monthly billing cycles, dues, and payments' },
  { label: 'Utilities', shortLabel: 'Utilities', icon: Zap, href: '/utilities', description: 'Electricity sub-meters, readings, and rates' },
  { label: 'WiFi', shortLabel: 'WiFi', icon: Wifi, href: '/wifi', description: 'Resident WiFi charges and MAC registry' },
  { label: 'Reports', shortLabel: 'Reports', icon: BarChart3, href: '/reports', description: 'Financial analytics, collections, and exports' },
]

const pageTitles: Record<string, string> = {
  '/': 'Building overview',
  '/rooms': 'Rooms & floors',
  '/residents': 'Resident management',
  '/utilities': 'Electricity meters',
  '/wifi': 'WiFi & devices',
  '/monthly-records': 'Monthly billing & payments',
  '/reports': 'Financial reports & analytics',
}

const foundationCards: { label: string; value: string; detail: string; icon: LucideIcon }[] = [
  { label: 'Rental rooms', value: '26', detail: 'Across 5 floors', icon: Home },
  { label: 'Building structure', value: '5', detail: 'Floors configured', icon: Building2 },
  { label: 'Monthly records', value: 'Ready', detail: 'Historical-first design', icon: CalendarDays },
]

const moduleStatusCards = [
  { label: 'Rooms & floors', status: 'Configured', href: '/rooms' },
  { label: 'Resident details', status: 'Configured', href: '/residents' },
  { label: 'Utility meters', status: 'Configured', href: '/utilities' },
  { label: 'WiFi & devices', status: 'Configured', href: '/wifi' },
  { label: 'Reports & analytics', status: 'Ready', href: '/reports' },
]

export function RentersShell({
  children,
  currentPath = '/',
  title,
}: {
  children?: ReactNode
  currentPath?: string
  title?: string
}) {
  const pathname = usePathname() || currentPath
  const [showMoreSheet, setShowMoreSheet] = useState(false)
  const headerTitle = title ?? pageTitles[pathname] ?? 'Building overview'

  // Primary mobile tabs (4 core destinations + 1 dynamic/more tab)
  const isSecondaryActive =
    pathname === '/utilities' || pathname === '/wifi' || pathname === '/reports'

  const secondaryActiveItem = isSecondaryActive
    ? navigation.find((n) => n.href === pathname)
    : null

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-950">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex z-30">
        <div className="flex h-20 items-center gap-3 border-b border-slate-100 px-7">
          <div className="flex size-9 items-center justify-center rounded-xl bg-slate-950 text-white">
            <Building2 aria-hidden="true" className="size-5" />
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight">Renters</p>
            <p className="text-xs text-slate-500">Property desk</p>
          </div>
        </div>

        <nav aria-label="Main navigation" className="flex-1 px-4 py-7">
          <p className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
          <div className="flex flex-col gap-1">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = item.href === pathname
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-slate-950 text-white shadow-xs' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  <Icon aria-hidden="true" className="size-[17px]" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </nav>

        <div className="border-t border-slate-100 p-4">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="mb-3 flex size-8 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm">
              <ShieldCheck aria-hidden="true" className="size-4" />
            </div>
            <p className="text-sm font-medium">Private workspace</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Built for one building and one owner.</p>
          </div>
          <div className="mt-2">
            <SignOutButton className="w-full justify-center" />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="lg:pl-64 min-h-screen pb-24 lg:pb-10">
        {/* Top Header - App-like compact header on mobile */}
        <header className="sticky top-0 z-30 flex flex-col border-b border-slate-200/90 bg-white/95 backdrop-blur-md">
          <div className="flex h-14 sm:h-16 lg:h-20 items-center justify-between px-3.5 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-xl bg-slate-950 text-white lg:hidden shadow-xs">
                <Building2 aria-hidden="true" className="size-4" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider hidden sm:block">
                  Property desk
                </p>
                <h1 className="text-sm sm:text-base lg:text-lg font-bold tracking-tight text-slate-950 truncate max-w-[220px] sm:max-w-none">
                  {headerTitle}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <SignOutButton className="h-8 px-2.5 text-xs rounded-xl border border-slate-200 bg-white shadow-xs" />
            </div>
          </div>
        </header>

        {children ?? (
          <main className="mx-auto max-w-7xl px-3.5 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
            <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Foundation ready
                </div>
                <h2 className="max-w-xl text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-950">
                  A clearer way to run your building.
                </h2>
                <p className="mt-2 max-w-xl text-xs sm:text-sm leading-relaxed text-slate-500">
                  Renters is the private workspace for keeping rooms, residents, utilities, and monthly records organized in one place.
                </p>
              </div>
              <Link
                href="/residents"
                className="inline-flex h-8 w-fit items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              >
                Manage residents
                <ArrowUpRight aria-hidden="true" className="size-3.5" />
              </Link>
            </section>

            <section aria-label="Building foundation summary" className="mt-6 sm:mt-9 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              {foundationCards.map((card) => {
                const Icon = card.icon
                return (
                  <article
                    key={card.label}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                        <Icon aria-hidden="true" className="size-5" />
                      </div>
                      <span className="text-xs font-medium text-emerald-600">Configured</span>
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

            <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">The foundation is in place</p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      The application is intentionally starting small. Core modules are added one at a time without compromising historical records.
                    </p>
                  </div>
                  <div className="hidden size-10 items-center justify-center rounded-xl bg-slate-100 sm:flex">
                    <BarChart3 aria-hidden="true" className="size-5 text-slate-700" />
                  </div>
                </div>
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {moduleStatusCards.map((item, index) => {
                    const content = (
                      <>
                        <p className="text-xs font-semibold text-slate-800">0{index + 1}</p>
                        <p className="mt-7 text-sm font-medium text-slate-700">{item.label}</p>
                        <p className={`mt-1 text-xs ${item.href ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {item.status}
                        </p>
                      </>
                    )
                    return item.href ? (
                      <Link
                        key={item.label}
                        href={item.href}
                        className="rounded-xl border border-slate-200 p-4 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div key={item.label} className="rounded-xl border border-dashed border-slate-200 p-4">
                        {content}
                      </div>
                    )
                  })}
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)] sm:p-7">
                <div className="flex size-10 items-center justify-center rounded-xl bg-white/10">
                  <CircleDollarSign aria-hidden="true" className="size-5" />
                </div>
                <p className="mt-8 text-sm font-semibold">Monthly records, preserved</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Every future rent and utility entry will be stored as a permanent monthly record. Nothing will be overwritten.
                </p>
                <div className="mt-8 flex items-center gap-2 text-xs font-medium text-slate-300">
                  <Droplets aria-hidden="true" className="size-4" /> Server-side calculations planned
                </div>
              </article>
            </section>
          </main>
        )}
      </div>

      {/* ----------------- MOBILE APP BOTTOM NAVIGATION BAR ----------------- */}
      <nav
        aria-label="Mobile application navigation"
        className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] lg:hidden pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 px-1 sm:px-3"
      >
        {/* On Phone Screens (< sm): 5 Native App Tabs */}
        <div className="grid grid-cols-5 items-center sm:hidden">
          {/* 1. Overview */}
          <Link
            href="/"
            aria-current={pathname === '/' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition active:scale-95 ${
              pathname === '/'
                ? 'text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div
              className={`flex items-center justify-center size-8 rounded-full transition ${
                pathname === '/' ? 'bg-slate-950 text-white shadow-xs' : ''
              }`}
            >
              <LayoutDashboard className="size-4" />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">Overview</span>
          </Link>

          {/* 2. Rooms */}
          <Link
            href="/rooms"
            aria-current={pathname === '/rooms' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition active:scale-95 ${
              pathname === '/rooms'
                ? 'text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div
              className={`flex items-center justify-center size-8 rounded-full transition ${
                pathname === '/rooms' ? 'bg-slate-950 text-white shadow-xs' : ''
              }`}
            >
              <Home className="size-4" />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">Rooms</span>
          </Link>

          {/* 3. Residents */}
          <Link
            href="/residents"
            aria-current={pathname === '/residents' || pathname.startsWith('/residents/') ? 'page' : undefined}
            className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition active:scale-95 ${
              pathname === '/residents' || pathname.startsWith('/residents/')
                ? 'text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div
              className={`flex items-center justify-center size-8 rounded-full transition ${
                pathname === '/residents' || pathname.startsWith('/residents/') ? 'bg-slate-950 text-white shadow-xs' : ''
              }`}
            >
              <ClipboardList className="size-4" />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">Residents</span>
          </Link>

          {/* 4. Bills */}
          <Link
            href="/monthly-records"
            aria-current={pathname === '/monthly-records' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition active:scale-95 ${
              pathname === '/monthly-records'
                ? 'text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div
              className={`flex items-center justify-center size-8 rounded-full transition ${
                pathname === '/monthly-records' ? 'bg-slate-950 text-white shadow-xs' : ''
              }`}
            >
              <CalendarDays className="size-4" />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">Bills</span>
          </Link>

          {/* 5. More (or active secondary section) */}
          <button
            type="button"
            onClick={() => setShowMoreSheet(true)}
            aria-expanded={showMoreSheet}
            aria-label="More options"
            className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition active:scale-95 ${
              isSecondaryActive || showMoreSheet
                ? 'text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div
              className={`relative flex items-center justify-center size-8 rounded-full transition ${
                isSecondaryActive || showMoreSheet ? 'bg-slate-950 text-white shadow-xs' : ''
              }`}
            >
              {secondaryActiveItem ? (
                <secondaryActiveItem.icon className="size-4" />
              ) : (
                <MoreHorizontal className="size-4" />
              )}
              {isSecondaryActive && (
                <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-white" />
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">
              {secondaryActiveItem ? secondaryActiveItem.shortLabel : 'More'}
            </span>
          </button>
        </div>

        {/* On Tablet Screens (sm to lg): All 7 Apps Laid Out */}
        <div className="hidden sm:grid sm:grid-cols-7 items-center gap-1">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = item.href === pathname || (item.href === '/residents' && pathname.startsWith('/residents/'))
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition active:scale-95 ${
                  isActive
                    ? 'text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <div
                  className={`flex items-center justify-center size-8 rounded-full transition ${
                    isActive ? 'bg-slate-950 text-white shadow-xs' : ''
                  }`}
                >
                  <Icon className="size-4" />
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-full">
                  {item.shortLabel ?? item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* ----------------- NATIVE APP "MORE" BOTTOM SHEET ----------------- */}
      {showMoreSheet && (
        <div
          role="presentation"
          onClick={() => setShowMoreSheet(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 backdrop-blur-xs transition-opacity lg:hidden"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="more-sheet-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl border-t border-slate-200 max-h-[85vh] overflow-y-auto pb-[max(env(safe-area-inset-bottom),1.5rem)] animate-in slide-in-from-bottom duration-200"
          >
            {/* Grab Handle */}
            <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-3" />

            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 id="more-sheet-title" className="text-base font-bold text-slate-950">
                  Building Workspace
                </h3>
                <p className="text-xs text-slate-500">More management modules</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMoreSheet(false)}
                className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Menu options grid */}
            <div className="mt-3.5 space-y-2">
              {[
                {
                  label: 'Utilities & Meters',
                  href: '/utilities',
                  icon: Zap,
                  iconColor: 'bg-amber-100 text-amber-700',
                  desc: 'Sub-meters, monthly readings & rate calculations',
                },
                {
                  label: 'WiFi Management',
                  href: '/wifi',
                  icon: Wifi,
                  iconColor: 'bg-sky-100 text-sky-700',
                  desc: 'Resident network profiles, fees & MAC registry',
                },
                {
                  label: 'Financial Reports',
                  href: '/reports',
                  icon: BarChart3,
                  iconColor: 'bg-indigo-100 text-indigo-700',
                  desc: 'Income trends, collection rates & permanent ledger',
                },
              ].map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMoreSheet(false)}
                    className={`flex items-center gap-3.5 p-3 rounded-2xl transition border ${
                      isActive
                        ? 'border-slate-950 bg-slate-50'
                        : 'border-slate-200/80 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <div className={`flex size-10 items-center justify-center rounded-xl shrink-0 ${item.iconColor}`}>
                      <Icon className="size-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                        {isActive && (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{item.desc}</p>
                    </div>
                  </Link>
                )
              })}
            </div>

            {/* Quick summary & Sign out */}
            <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Building2 className="size-3.5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">26 Rooms · 5 Floors</p>
                  <p className="text-[10px] text-slate-400">Private property desk</p>
                </div>
              </div>
              <SignOutButton className="p-2 text-xs border border-slate-200 rounded-xl" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
