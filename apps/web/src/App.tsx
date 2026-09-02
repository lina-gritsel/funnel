import { Navigate, Route, Routes } from 'react-router-dom'

import { HomePage } from './pages/HomePage'
import { UiKitPage } from './pages/UiKitPage'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/dev/ui" element={<UiKitPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
