import { Navigate, Route, Routes } from 'react-router-dom'

import { HomePage } from './pages/HomePage'
import { AdminFunnelPage } from './pages/AdminFunnelPage'
import { AdminAnalyticsPage } from './pages/AdminAnalyticsPage'
import { FunnelPage } from './pages/FunnelPage'
import { UiKitPage } from './pages/UiKitPage'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<FunnelPage />} />
      <Route path="/admin" element={<AdminFunnelPage />} />
      <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
      <Route path="/dev" element={<HomePage />} />
      <Route path="/dev/ui" element={<UiKitPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
