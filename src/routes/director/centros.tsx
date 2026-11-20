import { useState, useEffect } from 'react'
import { dateLocale } from '@/lib/i18n'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/edusafe/supabase'
import { useAuth } from '@/context/AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CentroStats {
  id:            string
  nombre:        string
  studentCount:  number
  reports:       number
  avgDays:       number
  incidenceRate: number   // (reports / students) * 100, 1 decimal
  score:         number   // termómetro
  status: {
    label:       string
    textColor:   string
    borderColor: string
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_WEIGHT: Record<string, number> = {
  baja: 0.15, media: 0.35, alta: 0.7, critica: 1.3,
}

function calcScore(reports: { severity_level: string | null }[]): number {
  const p = reports.reduce((s, r) => s + (SEVERITY_WEIGHT[r.severity_level ?? 'baja'] ?? 0.15), 0)
  return Math.min(10, Math.round(p * 10) / 10)
}

function calcAvgDays(reports: { status: string; created_at: string; closed_at: string | null }[]): number {
  const resolved = reports.filter(r => r.closed_at && r.status === 'resuelto')
  if (!resolved.length) return 0
  const ms = resolved.reduce((s, r) =>
    s + new Date(r.closed_at!).getTime() - new Date(r.created_at).getTime(), 0)
  return Math.round(ms / resolved.length / (1000 * 60 * 60 * 24) * 10) / 10
}

function getStatus(score: number): CentroStats['status'] {
  if (score >= 5) return {
    label: 'director_centros.status_attention', textColor: 'text-orange-600', borderColor: 'border-orange-400',
  }
  if (score >= 2) return {
    label: 'director_centros.status_normal', textColor: 'text-amber-600', borderColor: 'border-amber-400',
  }
  return {
    label: 'director_centros.status_calm', textColor: 'text-sage-dk', borderColor: 'border-sage',
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DirectorCentros() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [centros,  setCentros]  = useState<CentroStats[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      // ── Director → tenant_id ───────────────────────────────────────────────
      const { data: dir } = await supabase
        .from('directors')
        .select('tenant_id')
        .eq('user_id', user?.id ?? '')
        .single()
      if (!dir) return

      // ── Centros del tenant ─────────────────────────────────────────────────
      const { data: centrosList } = await supabase
        .from('centros')
        .select('id, nombre, num_alumnos')
        .eq('tenant_id', dir.tenant_id)
        .eq('active', true)
        .order('nombre')
      if (!centrosList?.length) { setCentros([]); return }

      // ── Reportes del mes (todos los centros del tenant en una sola query) ──
      const monthStart = new Date()
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)

      const { data: allReports } = await supabase
        .from('reports_director')
        .select('id, centro_id, severity_level, status, created_at, closed_at')
        .eq('tenant_id', dir.tenant_id)
        .gte('created_at', monthStart.toISOString())

      // ── Alumnos activos por centro (en paralelo) ───────────────────────────
      const centroIds = centrosList.map(c => c.id)
      const countResults = await Promise.all(
        centroIds.map(cid =>
          supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('centro_id', cid)
            .eq('active', true),
        ),
      )

      // ── Merge ──────────────────────────────────────────────────────────────
      const statsArr: CentroStats[] = centrosList.map((c, idx) => {
        const cReports = (allReports ?? []).filter(r => r.centro_id === c.id)
        const studentCount = countResults[idx]?.count ?? c.num_alumnos ?? 1
        const score         = calcScore(cReports)
        const avgDays       = calcAvgDays(cReports)
        const incidenceRate = studentCount > 0
          ? Math.round((cReports.length / studentCount) * 1000) / 10
          : 0

        return {
          id: c.id,
          nombre: c.nombre,
          studentCount,
          reports: cReports.length,
          avgDays,
          incidenceRate,
          score,
          status: getStatus(score),
        }
      })

      setCentros(statsArr)
    } finally {
      setLoading(false)
    }
  }

  const showComparativa = centros.length > 1

  return (
    <div className="flex flex-col min-h-svh">
      {/* ── Cabecera ──────────────────────────────────────────────────────────── */}
      <div className="bg-director px-5 pt-12 pb-5">
        <h1 className="font-display text-3xl font-bold text-white leading-tight">
          {t('director_centros.header')}
        </h1>
        <p className="text-sm text-white/55 mt-0.5">
          {loading ? t('director_centros.loading') : t('director_centros.header_sub', { count: centros.length })}
        </p>
      </div>

      <div className="flex-1 bg-cream px-5 pt-5 pb-4 flex flex-col gap-4">

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-director border-t-transparent rounded-full animate-spin" />
          </div>
        ) : centros.length === 0 ? (
          <div className="text-center py-12 text-muted">
            <p className="text-4xl mb-3">🏫</p>
            <p className="font-display text-lg text-ink">{t('director_centros.empty')}</p>
          </div>
        ) : (
          <>
            {/* ── Lista de centros ─────────────────────────────────────────────── */}
            <div className="flex flex-col gap-2">
              {centros.map(c => (
                <div
                  key={c.id}
                  className={`bg-white rounded-2xl px-4 py-3.5 shadow-sm border-l-4 ${c.status.borderColor}`}
                >
                  <p className="text-base font-semibold text-ink">{c.nombre}</p>
                  <p className="text-xs text-muted mt-0.5 leading-snug">
                    {t('director_centros.row_stats', { students: c.studentCount.toLocaleString(dateLocale()), reports: c.reports })} ·{' '}
                    <span className={`font-medium ${c.status.textColor}`}>{t(c.status.label)}</span>
                  </p>
                </div>
              ))}
            </div>

            {/* ── Comparativa rápida ───────────────────────────────────────────── */}
            {showComparativa && (
              <div>
                <p className="text-[11px] font-bold tracking-widest text-muted uppercase mb-3">
                  {t('director_centros.compare_title')}
                </p>
                <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <span className="text-sm text-ink">{t('director_centros.compare_reports')}</span>
                    <span className="text-sm font-semibold text-ink">
                      {centros.map(c => c.incidenceRate.toFixed(1)).join(' · ')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3.5 border-t border-hairline">
                    <span className="text-sm text-ink">{t('director_centros.compare_time')}</span>
                    <span className="text-sm font-semibold text-ink">
                      {centros.map(c => `${c.avgDays > 0 ? c.avgDays : '—'}${c.avgDays > 0 ? t('director_centros.days_suffix') : ''}`).join(' · ')}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
