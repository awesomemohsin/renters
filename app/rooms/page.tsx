import { RentersShell } from '@/components/renters-shell'
import { RoomsPage } from '@/components/rooms-page'

export default function RoomsRoute() {
  return <RentersShell currentPath="/rooms"><RoomsPage /></RentersShell>
}
