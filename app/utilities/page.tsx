import { RentersShell } from '@/components/renters-shell'
import { UtilitiesPage } from '@/components/utilities-page'

export default function UtilitiesRoute() {
  return (
    <RentersShell currentPath="/utilities">
      <UtilitiesPage />
    </RentersShell>
  )
}

