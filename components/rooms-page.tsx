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
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
            <DoorOpen aria-hidden="true" className="size-3.5" /> Rooms & floors
          </div>
          <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
            Your building at a glance.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
            Manage the 26 rooms across five floors. Resident details stay connected to each assigned room.
          </p>
        </div>
      </section>

      <section aria-label="Room summary" className="mt-9 grid gap-4 sm:grid-cols-3">
        {summaryCards.map((card) => {
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

      <div className="mt-8 flex flex-wrap gap-2" aria-label="Filter rooms by floor">
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
      {error && !selectedRoom && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <section aria-label="Rooms" className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filteredRooms.map((room) => (
          <button
            key={room.roomNumber}
            type="button"
            onClick={() => openRoom(room)}
            className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-semibold tracking-tight">Room {formatRoomNumber(room.roomNumber)}</p>
                <p className="mt-1 text-sm text-slate-500">
                  Floor {room.floor}
                  {room.currentResident ? ` · ${room.currentResident}` : ''}
                </p>
              </div>
              <ChevronRight aria-hidden="true" className="size-5 text-slate-300 transition group-hover:text-slate-700" />
            </div>
            <div className="mt-7 flex items-center justify-between border-t border-slate-100 pt-4">
              <span
                className={`inline-flex items-center gap-2 text-sm font-medium ${
                  room.status === 'occupied' ? 'text-emerald-600' : 'text-slate-500'
                }`}
              >
                <span
                  className={`size-2 rounded-full ${room.status === 'occupied' ? 'bg-emerald-500' : 'bg-slate-300'}`}
                />
                {room.status === 'occupied' ? 'Occupied' : 'Vacant'}
              </span>
              <span className="text-sm text-slate-500">{formatCurrency(room.monthlyRent, 'Not configured')}</span>
            </div>
          </button>
        ))}
      </section>

      {selectedRoom && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 p-4 sm:items-center"
          role="presentation"
          onClick={() => setSelectedRoom(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-details-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">Floor {selectedRoom.floor}</p>
                <h3 id="room-details-title" className="text-2xl font-semibold">
                  Room {formatRoomNumber(selectedRoom.roomNumber)}
                </h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedRoom(null)}>
                Close
              </Button>
            </div>
            <form onSubmit={saveRoom} className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm font-medium">
                Occupancy status
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as Room['status'])}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 font-normal"
                >
                  <option value="vacant">Vacant</option>
                  <option value="occupied">Occupied</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Monthly rent (BDT)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rent}
                  onChange={(event) => setRent(event.target.value)}
                  placeholder="Not configured"
                  className="h-10 rounded-md border border-slate-200 px-3 font-normal"
                />
              </label>
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                Current resident:{' '}
                <span className="font-medium text-slate-700">{selectedRoom.currentResident || 'Not assigned'}</span>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" disabled={isSaving}>
                <Pencil data-icon="inline-start" />
                {isSaving ? 'Saving...' : 'Save changes'}
              </Button>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
