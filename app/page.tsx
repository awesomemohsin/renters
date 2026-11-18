import { RentersShell } from '@/components/renters-shell'
import { DashboardPage } from '@/components/dashboard-page'

export default function Page() {
  return (
    <RentersShell currentPath="/" title="Building Overview & Rooms">
      <DashboardPage />
    </RentersShell>
  )
}
