import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

/**
 * role="admin" → requires isAdmin flag (super admin)
 */
export function RequireRole({ role, children }: { role: 'admin' | 'user'; children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/" replace />
  if (role === 'admin' && !user.isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

export function RequireCompanyAccount({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/" replace />
  if (user.accountType === 'PERSONAL') return <Navigate to="/" replace />
  return <>{children}</>
}
