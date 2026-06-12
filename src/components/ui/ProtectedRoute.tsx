import { Navigate } from 'react-router'
import { useAuth } from '@/context/AuthContext'
import type { UserRole } from '@/lib/edusafe/types'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  role: Extract<UserRole, 'mediador' | 'director'>
}

export function ProtectedRoute({ children, role }: Props) {
  const { session, role: userRole, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/auth/login" replace />
  }

  if (userRole !== role) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
