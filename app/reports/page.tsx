import { RentersShell } from '@/components/renters-shell'
import { ReportsPage } from '@/components/reports-page'

export default function ReportsPageRoute() {
  return (
    <RentersShell currentPath="/reports" title="Financial reports & analytics">
      <ReportsPage />
    </RentersShell>
  )
}
