import { useState, useEffect } from 'react'
import { ChevronRight, Check } from 'lucide-react'
import { supabase } from '@/lib/edusafe/supabase'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from 'react-i18next'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DirectorProfile {
  full_name:    string
  email:        string
  tenantType:   string
  centroCount:  number
  mediatorCount: number
  zoneCount:    number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
}

const TENANT_TYPE_LABEL: Record<string, string> = {
  centro_individual: 'Centro',
  grupo_escolar:     'Titularidad',
  ayuntamiento:      'Ayuntamiento',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DirectorPerfil() {
  const { user, signOut } = useAuth()
  const { t } = useTranslation()
  const [profile, setProfile] = useState<DirectorProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadProfile() }, [])

  async function loadProfile() {
    setLoading(true)
    try {
      // ── Director info ──────────────────────────────────────────────────────
      const { data: dir } = await supabase
        .from('directors')
        .select('full_name, email, tenant_id, centro_id')
        .eq('user_id', user?.id ?? '')
        .single()
      if (!dir) return

      // ── Consultas en paralelo ──────────────────────────────────────────────
      const [
        { data: tenant },
        { count: centroCount },
        { count: mediatorCount },
        { data: zonesRaw },
      ] = await Promise.all([
        supabase.from('tenants').select('type').eq('id', dir.tenant_id).maybeSingle(),
        supabase
          .from('centros')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', dir.tenant_id)
          .eq('active', true),
        supabase
          .from('mediators')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', dir.tenant_id)
          .eq('active', true),
        // Zonas distintas utilizadas en reportes del tenant
        supabase
          .from('reports')
          .select('zone')
          .eq('tenant_id', dir.tenant_id)
          .not('zone', 'is', null),
      ])

      const distinctZones = new Set(zonesRaw?.map(r => r.zone).filter(Boolean)).size

      setProfile({
        full_name:     dir.full_name,
        email:         dir.email,
        tenantType:    TENANT_TYPE_LABEL[tenant?.type ?? ''] ?? 'Centro',
        centroCount:   centroCount ?? 0,
        mediatorCount: mediatorCount ?? 0,
        zoneCount:     distinctZones,
      })
    } finally {
      setLoading(false)
    }
  }

  const initials = profile ? getInitials(profile.full_name) : '…'

  return (
    <div className="flex flex-col min-h-svh">
      {/* ── Cabecera ────────────────────────────────────────────────────────── */}
      <div className="bg-director px-5 pt-12 pb-5">
        <h1 className="font-display text-3xl font-bold text-white leading-tight">{t('director_perfil.title')}</h1>
      </div>

      <div className="flex-1 bg-cream px-5 pt-5 pb-4 flex flex-col gap-5">

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-director border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Tarjeta de perfil ───────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm">
              {/* Avatar dorado con iniciales */}
              <div className="w-14 h-14 rounded-full bg-mostaza flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-bold text-white tracking-wide">{initials}</span>
              </div>

              {/* Datos */}
              <div className="min-w-0">
                <p className="text-base font-bold text-ink">
                  {profile?.full_name ?? user?.email?.split('@')[0] ?? '…'}
                </p>
                <p className="text-sm text-muted font-medium">
                  {t('director_perfil.role')} · {profile?.tenantType}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {profile?.centroCount ?? 0} centros
                </p>
              </div>
            </div>

            {/* ── Centro y equipo ─────────────────────────────────────────────── */}
            <div>
              <p className="text-[11px] font-bold tracking-widest text-muted uppercase mb-3">
                Centro y equipo
              </p>
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">

                {/* Equipo de mediación */}
                <button className="w-full flex items-center justify-between px-4 py-4 text-left active:bg-cream transition-base">
                  <span className="text-sm font-medium text-ink">Equipo de mediación</span>
                  <span className="flex items-center gap-1">
                    <span className="text-sm font-semibold text-mostaza">
                      {profile?.mediatorCount ?? 0}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted" />
                  </span>
                </button>

                {/* Zonas del centro */}
                <button className="w-full flex items-center justify-between px-4 py-4 text-left border-t border-hairline active:bg-cream transition-base">
                  <span className="text-sm font-medium text-ink">Zonas del centro</span>
                  <span className="flex items-center gap-1">
                    <span className="text-sm font-semibold text-mostaza">
                      {profile?.zoneCount ?? 0}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted" />
                  </span>
                </button>

                {/* Cumplimiento legal — solo check, sin navegación */}
                <div className="flex items-center justify-between px-4 py-4 border-t border-hairline">
                  <span className="text-sm font-medium text-ink">Cumplimiento legal</span>
                  <Check className="w-4 h-4 text-green-500" strokeWidth={2.5} />
                </div>

                {/* Facturación y plan */}
                <button
                  className="w-full flex items-center justify-between px-4 py-4 text-left border-t border-hairline active:bg-cream transition-base"
                >
                  <span className="text-sm font-medium text-ink">Facturación y plan</span>
                  <ChevronRight className="w-4 h-4 text-muted" />
                </button>

              </div>
            </div>

            {/* ── Cerrar sesión ────────────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              <button
                onClick={signOut}
                className="w-full flex items-center px-4 py-4 text-left"
              >
                <span className="text-sm font-medium text-red-500">{t('director_perfil.logout')}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
