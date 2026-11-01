import { RentersShell } from '@/components/renters-shell'
import { WiFiManagementPage } from '@/components/wifi-management-page'

export default function WiFiRoute() {
  return (
    <RentersShell currentPath="/wifi" title="WiFi & devices">
      <WiFiManagementPage />
    </RentersShell>
  )
}

