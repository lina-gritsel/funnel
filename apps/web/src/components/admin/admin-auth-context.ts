import { createContext, useContext } from 'react'

export type AdminAuthContextValue = {
  logout: () => void
}

export const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

export function useAdminAuth() {
  const value = useContext(AdminAuthContext)
  if (!value) throw new Error('Admin auth context is unavailable')
  return value
}
