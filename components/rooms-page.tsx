'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, CircleDollarSign, DoorOpen, Pencil, Users, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatRoomNumber } from '@/lib/utils'

type Room = {
  roomNumber: number
  floor: number
  status: 'occupied' | 'vacant'
  monthlyRent: number | null
  currentResident: string | null
}

const floors = [
  { value: 0, label: 'All floors' },
  { value: 1, label: '1st floor' },
  { value: 2, label: '2nd floor' },
  { value: 3, label: '3rd floor' },
  { value: 4, label: '4th floor' },
  { value: 5, label: '5th floor' },
]

export function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedFloor, setSelectedFloor] = useState(0)
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [rent, setRent] = useState('')
  const [status, setStatus] = useState<Room['status']>('vacant')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/rooms')
      .then((response) => response.json())
      .then((data) => setRooms(data.rooms ?? []))
      .catch(() => setError('Unable to load rooms.'))
  }, [])

  const filteredRooms = useMemo(
    () => (selectedFloor ? rooms.filter((room) => room.floor === selectedFloor) : rooms),
    [rooms, selectedFloor],
  )
  const occupied = rooms.filter((room) => room.status === 'occupied').length

  const summaryCards: { label: string; value: number; detail: string; icon: LucideIcon }[] = [
    { label: 'Total rooms', value: rooms.length, detail: 'Across 5 floors', icon: DoorOpen },
    { label: 'Occupied', value: occupied, detail: 'Current status', icon: Users },
    { label: 'Vacant', value: rooms.length - occupied, detail: 'Available rooms', icon: CircleDollarSign },
  ]

  const openRoom = (room: Room) => {
    setSelectedRoom(room)
    setRent(room.monthlyRent == null ? '' : String(room.monthlyRent))
    setStatus(room.status)
    setError('')
  }

  const saveRoom = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedRoom) return
    setIsSaving(true)
    setError('')
    const response = await fetch('/api/rooms', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomNumber: selectedRoom.roomNumber, monthlyRent: rent, status }),
    })
    const data = await response.json()
    if (!response.ok) {
      setError(data.error ?? 'Unable to save room.')
    } else {
      setRooms((current) => current.map((room) => (room.roomNumber === data.room.roomNumber ? data.room : room)))
      setSelectedRoom(data.room)
      setStatus(data.room.status)
      setRent(data.room.monthlyRent == null ? '' : String(data.room.monthlyRent))
    }
    setIsSaving(false)
  }

  return (
    <main className="mx-auto max-w-7xl px-3.5 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
            <DoorOpen aria-hidden="true" className="size-3 text-slate-700" /> Rooms & floors
          </div>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-950">
            Your building at a glance.
          </h2>
          <p className="mt-1 max-w-xl text-xs sm:text-sm leading-relaxed text-slate-500">
            Manage the 26 rooms across five floors. Resident details stay connected to each assigned room.
          </p>
        </div>
      </section>

      <section aria-label="Room summary" className="mt-5 sm:mt-7 grid grid-cols-3 gap-2 sm:gap-4">
        {summaryCards.map((card) => {
          const Icon = card.icon
          return (
            <article
              key={card.label}
              className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-5 shadow-xs"
            >
              <div className="flex size-7 sm:size-10 items-center justify-center rounded-lg sm:rounded-xl bg-slate-100 text-slate-700">
                <Icon aria-hidden="true" className="size-3.5 sm:size-5" />
              </div>
              <p className="mt-2.5 sm:mt-5 text-[11px] sm:text-sm text-slate-500 truncate">{card.label}</p>
              <div className="mt-0.5 sm:mt-1 flex items-baseline gap-1.5 sm:gap-2">
                <p className="text-lg sm:text-2xl font-bold tracking-tight text-slate-950">{card.value}</p>
                <p className="text-[10px] sm:text-xs text-slate-400 truncate">{card.detail}</p>
              </div>
            </article>
          )
        })}
      </section>

      <div className="mt-5 sm:mt-7 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none" aria-label="Filter rooms by floor">
        {floors.map((floor) => (
          <Button
            key={floor.value}
            variant={selectedFloor === floor.value ? 'default' : 'outline'}
            size="xs"
            className="sm:h-8 sm:px-3 text-xs shrink-0"
            onClick={() => setSelectedFloor(floor.value)}
          >
            {floor.label}
          </Button>
        ))}
      </div>
      {error && !selectedRoom && <p className="mt-3 text-xs sm:text-sm text-red-600">{error}</p>}
      <section aria-label="Rooms" className="mt-4 sm:mt-5 grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
        {filteredRooms.map((room) => (
          <button
            key={room.roomNumber}
            type="button"
            onClick={() => openRoom(room)}
            className="group rounded-2xl border border-slate-200 bg-white p-3 sm:p-5 text-left shadow-xs transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-base sm:text-2xl font-bold tracking-tight text-slate-950">Room {formatRoomNumber(room.roomNumber)}</p>
                <p className="mt-0.5 text-xs text-slate-500 truncate">
                  Floor {room.floor}
                  {room.currentResident ? ` · ${room.currentResident}` : ''}
                </p>
              </div>
              <ChevronRight aria-hidden="true" className="size-4 sm:size-5 text-slate-300 transition group-hover:text-slate-700 shrink-0" />
            </div>
            <div className="mt-4 sm:mt-7 flex items-center justify-between border-t border-slate-100 pt-2.5 sm:pt-4">
              <span
                className={`inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium ${
                  room.status === 'occupied' ? 'text-emerald-600' : 'text-slate-500'
                }`}
              >
                <span
                  className={`size-1.5 sm:size-2 rounded-full ${room.status === 'occupied' ? 'bg-emerald-500' : 'bg-slate-300'}`}
                />
                {room.status === 'occupied' ? 'Occupied' : 'Vacant'}
              </span>
              <span className="text-xs sm:text-sm font-semibold text-slate-900">{formatCurrency(room.monthlyRent, 'Not set')}</span>
            </div>
          </button>
        ))}
      </section>

      {selectedRoom && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 p-2 sm:p-4 sm:items-center"
          role="presentation"
          onClick={() => setSelectedRoom(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-details-title"
            className="my-auto w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500">Floor {selectedRoom.floor}</p>
                <h3 id="room-details-title" className="text-lg sm:text-2xl font-bold text-slate-950">
                  Room {formatRoomNumber(selectedRoom.roomNumber)}
                </h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedRoom(null)}>
                Close
              </Button>
            </div>
            <form onSubmit={saveRoom} className="mt-4 sm:mt-6 flex flex-col gap-3.5">
              <label className="flex flex-col gap-1.5 text-xs sm:text-sm font-medium text-slate-700">
                Occupancy status
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as Room['status'])}
                  className="h-9 sm:h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs sm:text-sm font-normal"
                >
                  <option value="vacant">Vacant</option>
                  <option value="occupied">Occupied</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs sm:text-sm font-medium text-slate-700">
                Monthly rent (BDT)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rent}
                  onChange={(event) => setRent(event.target.value)}
                  placeholder="Not configured"
                  className="h-9 sm:h-10 rounded-xl border border-slate-200 px-3 text-xs sm:text-sm font-normal"
                />
              </label>
              <div className="rounded-xl bg-slate-50 p-3 text-xs sm:text-sm text-slate-500">
                Current resident:{' '}
                <span className="font-semibold text-slate-800">{selectedRoom.currentResident || 'Not assigned'}</span>
              </div>
              {error && <p className="text-xs sm:text-sm text-red-600">{error}</p>}
              <Button type="submit" disabled={isSaving} className="mt-1">
                <Pencil data-icon="inline-start" className="size-3.5" />
                {isSaving ? 'Saving...' : 'Save changes'}
              </Button>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
