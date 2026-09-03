import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { startEventDelivery } from './analytics/event-queue'
import { AdminAccessGate } from './components/admin/AdminAccessGate'
import { HomePage } from './pages/HomePage'
import { AdminFunnelPage } from './pages/AdminFunnelPage'
import { AdminAnalyticsPage } from './pages/AdminAnalyticsPage'
import { FunnelPage } from './pages/FunnelPage'
import { UiKitPage } from './pages/UiKitPage'

export function App() {
  useEffect(() => startEventDelivery(), [])

  return (
    <Routes>
      <Route path="/" element={<FunnelPage />} />
      <Route
        path="/admin"
        element={
          <AdminAccessGate>
            <AdminFunnelPage />
          </AdminAccessGate>
        }
      />
      <Route
        path="/admin/analytics"
        element={
          <AdminAccessGate>
            <AdminAnalyticsPage />
          </AdminAccessGate>
        }
      />
      <Route path="/dev" element={<HomePage />} />
      <Route path="/dev/ui" element={<UiKitPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
