import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '@/lib/edusafe/supabase'
import type { UserRole } from '@/lib/edusafe/types'

function decodeJwtClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload))
  } catch {
    return {}
  }
}

function roleToPath(role: string | undefined): string {
  if (role === 'director') return '/director'
  if (role === 'mediador') return '/mediador'
  return '/onboarding'
}

export default function AuthCallback() {
  const navigate = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    // onAuthStateChange captura el SIGNED_IN que dispara detectSessionInUrl
    // al procesar el fragment #access_token=... del magic link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (handled.current) return
      if (event === 'SIGNED_IN' && session) {
        handled.current = true
        const claims = decodeJwtClaims(session.access_token)
        navigate(roleToPath(claims.edusafe_role as UserRole), { replace: true })
      }
    })

    // Por si el evento ya ocurrió antes de montar el componente
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (handled.current || !session) return
      handled.current = true
      const claims = decodeJwtClaims(session.access_token)
      navigate(roleToPath(claims.edusafe_role as UserRole), { replace: true })
    })

    const timeout = setTimeout(() => {
      if (!handled.current) {
        navigate('/auth/login', { replace: true })
      }
    }, 8000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [navigate])

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-ink/60">Verificando acceso...</p>
      </div>
    </div>
  )
}
