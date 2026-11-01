import { RentersShell } from '@/components/renters-shell'
import { MonthlyRecordsPage } from '@/components/monthly-records-page'

export default function MonthlyRecordsRoute() {
  return (
    <RentersShell currentPath="/monthly-records" title="Monthly billing & payments">
      <MonthlyRecordsPage />
    </RentersShell>
  )
}

