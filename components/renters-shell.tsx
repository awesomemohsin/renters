import Link from 'next/link'
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
  ShieldCheck,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

type NavItem = {
  label: string
  icon: LucideIcon
  href: string | null
}

const navigation: NavItem[] = [
  { label: 'Overview', icon: LayoutDashboard, href: '/' },
  { label: 'Rooms', icon: Home, href: '/rooms' },
  { label: 'Residents', icon: ClipboardList, href: '/residents' },
  { label: 'Utilities', icon: Zap, href: '/utilities' },
  { label: 'WiFi', icon: Wifi, href: '/wifi' },
  { label: 'Monthly records', icon: CalendarDays, href: '/monthly-records' },
  { label: 'Reports', icon: BarChart3, href: '/reports' },
]

const foundationCards: { label: string; value: string; detail: string; icon: LucideIcon }[] = [
  { label: 'Rental rooms', value: '26', detail: 'Across 5 floors', icon: Home },
  { label: 'Building structure', value: '5', detail: 'Floors configured', icon: Building2 },
  { label: 'Monthly records', value: 'Ready', detail: 'Historical-first design', icon: CalendarDays },
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
  const headerTitle = title ?? pageTitles[currentPath] ?? 'Building overview'

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
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
              if (!item.href) {
                return (
                  <span
                    key={item.label}
                    aria-disabled="true"
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400"
                  >
                    <Icon aria-hidden="true" className="size-[17px]" />
                    {item.label}
                    <span className="ml-auto text-[10px] uppercase tracking-wide">Soon</span>
                  </span>
                )
              }

              const isActive = item.href === currentPath
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
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
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur sm:px-8">
          <div>
            <p className="text-xs font-medium text-slate-500">Property management</p>
            <h1 className="text-lg font-semibold tracking-tight">{headerTitle}</h1>
          </div>
          <nav aria-label="Mobile navigation" className="flex items-center gap-1 lg:hidden">
            {navigation
              .filter((item): item is NavItem & { href: string } => Boolean(item.href))
              .map((item) => {
                const isActive = item.href === currentPath
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
          </nav>
        </header>

        {children ?? (
          <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
            <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Foundation ready
                </div>
                <h2 className="max-w-xl text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
                  A clearer way to run your building.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
                  Renters is the private workspace for keeping rooms, residents, utilities, and monthly records organized in one place.
                </p>
              </div>
              <Link
                href="/residents"
                className="inline-flex h-8 w-fit items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-sm font-medium text-white transition-colors hover:bg-slate-800"
              >
                Manage residents
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </Link>
            </section>

            <section aria-label="Building foundation summary" className="mt-9 grid gap-4 md:grid-cols-3">
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
    </div>
  )
}
