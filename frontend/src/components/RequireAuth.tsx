import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { ApiRole } from '@/api/types'
import { useAuth } from '@/hooks/useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function RequireRole({ role, children }: { role: ApiRole; children: ReactNode }) {
  const { user } = useAuth()
  if (!user || user.role !== role) return <Navigate to="/" replace />
  return <>{children}</>
}
