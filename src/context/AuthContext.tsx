import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/edusafe/supabase'
import type { UserRole } from '@/lib/edusafe/types'

interface AuthContextValue {
  session:  Session | null
  user:     User | null
  role:     UserRole | null
  staffId:  string | null
  tenantId: string | null
  centroId: string | null
  loading:  boolean
  signOut:  () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function decodeJwtClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload))
  } catch {
    return {}
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session,     setSession]     = useState<Session | null>(null)
  const [sessLoading, setSessLoading] = useState(true)

  // Fallback cuando el JWT hook no inyecta edusafe_role
  const [dbRole,     setDbRole]     = useState<UserRole | null>(null)
  const [dbStaffId,  setDbStaffId]  = useState<string | null>(null)
  const [dbTenantId, setDbTenantId] = useState<string | null>(null)
  const [dbCentroId, setDbCentroId] = useState<string | null>(null)
  const [dbDone,     setDbDone]     = useState(false)

  // ── Sesión ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setSessLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (!session) {
        setDbRole(null); setDbStaffId(null); setDbTenantId(null); setDbCentroId(null)
        setDbDone(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Claims del JWT ───────────────────────────────────────────────────────
  const claims     = session ? decodeJwtClaims(session.access_token) : {}
  const jwtRole    = (claims.edusafe_role as UserRole) ?? null
  const jwtStaffId = (claims.staff_id    as string)   ?? null
  const jwtTenantId= (claims.app_tenant_id as string) ?? null
  const jwtCentroId= (claims.centro_id   as string)   ?? null

  // ── Fallback BD (si el hook no inyectó claims) ───────────────────────────
  useEffect(() => {
    // Si el JWT ya trae el rol, marcamos como resuelto y salimos
    if (jwtRole) { setDbDone(true); return }
    // Sin sesión, no hay nada que resolver
    if (!session) { setDbDone(true); return }

    const uid = session.user.id

    ;(async () => {
      try {
        // ¿Es mediador?
        const { data: med } = await supabase
          .from('mediators')
          .select('id, tenant_id, centro_id')
          .eq('user_id', uid)
          .eq('active', true)
          .maybeSingle()

        if (med) {
          setDbRole('mediador')
          setDbStaffId(med.id)
          setDbTenantId(med.tenant_id)
          setDbCentroId(med.centro_id)
          return
        }

        // ¿Es director?
        const { data: dir } = await supabase
          .from('directors')
          .select('id, tenant_id, centro_id')
          .eq('user_id', uid)
          .eq('active', true)
          .maybeSingle()

        if (dir) {
          setDbRole('director')
          setDbStaffId(dir.id)
          setDbTenantId(dir.tenant_id)
          setDbCentroId(null)
        }
      } finally {
        setDbDone(true)
      }
    })()
  }, [session?.user.id, jwtRole])

  // ── Valores efectivos (JWT > BD) ─────────────────────────────────────────
  const role     = jwtRole     ?? dbRole
  const staffId  = jwtStaffId  ?? dbStaffId
  const tenantId = jwtTenantId ?? dbTenantId
  const centroId = jwtCentroId ?? dbCentroId

  // Cargando hasta que tengamos sesión Y rol resuelto (si hay sesión)
  const loading = sessLoading || (!!session && !jwtRole && !dbDone)

  return (
    <AuthContext.Provider value={{
      session,
      user:    session?.user ?? null,
      role,
      staffId,
      tenantId,
      centroId,
      loading,
      signOut: () => supabase.auth.signOut(),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
