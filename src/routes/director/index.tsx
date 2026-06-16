import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { User } from 'lucide-react'
import { supabase } from '@/lib/edusafe/supabase'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from 'react-i18next'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DirData {
  id:          string
  full_name:   string
  centro_id:   string
  centroNombre: string
}

interface KPIs {
  reportes:     number
  reportesPct:  number | null
  resueltos:    number
  resueltosPct: number
  avgDays:      number
  avgDaysPct:   number | null
  reincidentes: number
  reinciDelta:  number
  termometro:   number
  totalMsg:     number
}

interface CriticalAlert {
  case_code: string
  message:   string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_WEIGHT: Record<string, number> = {
  baja: 0.15, media: 0.35, alta: 0.7, critica: 1.3,
}

function countReincidentes(involved: { student_id: string }[]): number {
  const map: Record<string, number> = {}
  involved.forEach(i => { map[i.student_id] = (map[i.student_id] ?? 0) + 1 })
  return Object.values(map).filter(c => c >= 2).length
}

function avgResolutionDays(reports: { status: string; created_at: string; closed_at: string | null }[]): number {
  const resolved = reports.filter(r => r.closed_at && r.status === 'resuelto')
  if (!resolved.length) return 0
  const ms = resolved.reduce((s, r) =>
    s + new Date(r.closed_at!).getTime() - new Date(r.created_at).getTime(), 0)
  return Math.round(ms / resolved.length / (1000 * 60 * 60 * 24) * 10) / 10
}

function monthLabel(date: Date): string {
  return date.toLocaleString('es-ES', { month: 'short' }).replace('.', '')
}

// ─── Heatmap cell ─────────────────────────────────────────────────────────────

function ZoneCell({
  zone, label, zoneCounts, className = '',
}: { zone: string; label: string; zoneCounts: Record<string, number>; className?: string }) {
  const count = zoneCounts[zone] ?? 0
  const bg = count >= 6 ? 'bg-red-100'
    : count >= 3 ? 'bg-[#FFD0C0]'
    : count >= 1 ? 'bg-[#FFE8DF]'
    : 'bg-white/80'
  const dotBg = count >= 6 ? 'bg-red-500'
    : count >= 3 ? 'bg-[#D45A3A]'
    : 'bg-[#E88A70]'

  return (
    <div className={`relative rounded-xl ${bg} flex flex-col items-center justify-center transition-base ${className}`}>
      {count > 0 ? (
        <>
          <div className={`w-8 h-8 rounded-full ${dotBg} flex items-center justify-center shadow-sm mb-0.5`}>
            <span className="text-[11px] font-bold text-white leading-none">{count}</span>
          </div>
          <span className="text-[9px] text-ink-soft/70 text-center leading-tight px-1">{label}</span>
        </>
      ) : (
        <span className="text-[10px] font-medium text-ink-soft/50 text-center px-1">{label}</span>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DirectorDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [dirData,       setDirData]       = useState<DirData | null>(null)
  const [kpis,          setKpis]          = useState<KPIs | null>(null)
  const [zoneCounts,    setZoneCounts]    = useState<Record<string, number>>({})
  const [criticalAlert, setCriticalAlert] = useState<CriticalAlert | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [prevMonth,     setPrevMonth]     = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const uid = user?.id
      if (!uid) return

      // ── Director info ──────────────────────────────────────────────────────
      const { data: dir } = await supabase
        .from('directors')
        .select('id, full_name, centro_id, tenant_id')
        .eq('user_id', uid)
        .single()
      if (!dir) return

      // ── Rango de fechas ────────────────────────────────────────────────────
      const now           = new Date()
      const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const prevStart     = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
      setPrevMonth(monthLabel(new Date(now.getFullYear(), now.getMonth() - 1, 1)))

      // ── Consultas en paralelo ──────────────────────────────────────────────
      const [
        { data: centro },
        { data: curr },
        { data: prev },
      ] = await Promise.all([
        supabase.from('centros').select('nombre').eq('id', dir.centro_id).single(),
        supabase.from('reports')
          .select('id, severity_level, status, zone, created_at, closed_at, case_code')
          .eq('centro_id', dir.centro_id)
          .gte('created_at', monthStart),
        supabase.from('reports')
          .select('id, status, closed_at, created_at')
          .eq('centro_id', dir.centro_id)
          .gte('created_at', prevStart)
          .lt('created_at', monthStart),
      ])

      setDirData({ ...dir, centroNombre: centro?.nombre ?? '' })

      const currList = curr ?? []
      const prevList = prev ?? []

      // ── Reincidentes (agresor en 2+ reportes del mes) ──────────────────────
      const currIds = currList.map(r => r.id)
      const prevIds = prevList.map(r => r.id)

      const [{ data: currInv }, { data: prevInv }] = await Promise.all([
        currIds.length > 0
          ? supabase.from('report_involved').select('student_id').in('report_id', currIds).eq('role', 'agresor')
          : Promise.resolve({ data: [] }),
        prevIds.length > 0
          ? supabase.from('report_involved').select('student_id').in('report_id', prevIds).eq('role', 'agresor')
          : Promise.resolve({ data: [] }),
      ])

      // ── KPIs ───────────────────────────────────────────────────────────────
      const totalCurr  = currList.length
      const totalPrev  = prevList.length
      const reportesPct = totalPrev > 0
        ? Math.round(((totalCurr - totalPrev) / totalPrev) * 100)
        : null

      const resueltos    = currList.filter(r => ['resuelto', 'archivado'].includes(r.status)).length
      const resueltosPct = totalCurr > 0 ? Math.round((resueltos / totalCurr) * 100) : 0

      const avgDays     = avgResolutionDays(currList)
      const avgDaysPrev = avgResolutionDays(prevList)
      const avgDaysPct  = avgDaysPrev > 0
        ? Math.round(((avgDays - avgDaysPrev) / avgDaysPrev) * 100)
        : null

      const reincidentes = countReincidentes(currInv ?? [])
      const reinciPrev   = countReincidentes(prevInv ?? [])
      const reinciDelta  = reincidentes - reinciPrev

      const penalty    = currList.reduce((s, r) => s + (SEVERITY_WEIGHT[r.severity_level ?? 'baja'] ?? 0.15), 0)
      const termometro = Math.min(10, Math.round(penalty * 10) / 10)

      setKpis({
        reportes: totalCurr, reportesPct,
        resueltos, resueltosPct,
        avgDays, avgDaysPct,
        reincidentes, reinciDelta,
        termometro, totalMsg: totalCurr,
      })

      // ── Zonas ─────────────────────────────────────────────────────────────
      const zc: Record<string, number> = {}
      currList.forEach(r => { if (r.zone) zc[r.zone] = (zc[r.zone] ?? 0) + 1 })
      setZoneCounts(zc)

      // ── Alerta crítica (caso crítico > 2h sin atender) ─────────────────────
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const alert = currList.find(r =>
        r.severity_level === 'critica' &&
        r.status === 'nuevo' &&
        r.created_at < twoHoursAgo,
      )
      if (alert) {
        setCriticalAlert({
          case_code: alert.case_code,
          message:   'La mediadora aún no ha respondido al denunciante',
        })
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Month label ─────────────────────────────────────────────────────────────
  const now         = new Date()
  const currentMonthLabel = now.toLocaleString('es-ES', { month: 'long', year: 'numeric' })
  const monthTitle  = currentMonthLabel.charAt(0).toUpperCase() + currentMonthLabel.slice(1)

  // ── Termómetro bar ──────────────────────────────────────────────────────────
  const score     = kpis?.termometro ?? 0
  const barFill   = Math.min(100, (score / 10) * 100)
  const barColor  = score >= 7 ? 'bg-red-500' : score >= 4 ? 'bg-amber-400' : 'bg-sage'
  const scoreText = score >= 7 ? 'text-red-600' : score >= 4 ? 'text-amber-600' : 'text-sage-dk'

  return (
    <div className="flex flex-col min-h-svh">
      {/* ── Cabecera ────────────────────────────────────────────────────────── */}
      <div className="bg-director px-5 pt-12 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold tracking-widest text-white/55 uppercase">
              Dirección · {dirData?.full_name ?? '…'}
            </p>
            <h1 className="font-display text-3xl font-bold text-white leading-tight mt-0.5">
              Centro
            </h1>
            <p className="text-sm text-white/55 mt-0.5">
              {dirData?.centroNombre ?? '…'} · {monthTitle}
            </p>
          </div>
          <button
            onClick={() => navigate('/director/perfil')}
            className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center mt-1 flex-shrink-0 active:bg-white/25 transition-base"
          >
            <User className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      <div className="flex-1 bg-cream px-5 pt-4 pb-4 flex flex-col gap-4">

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-director border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Alerta crítica ─────────────────────────────────────────────── */}
            {criticalAlert && (
              <div className="rounded-2xl overflow-hidden">
                <div className="bg-gradient-to-r from-red-600 to-orange-500 p-4 flex gap-3">
                  <span className="text-2xl flex-shrink-0 leading-none mt-0.5">🚨</span>
                  <div>
                    <p className="text-sm font-bold text-white leading-snug">
                      1 caso crítico sin atender en 2h
                    </p>
                    <p className="text-xs text-white/80 mt-0.5 leading-snug">
                      #{criticalAlert.case_code} · {criticalAlert.message}.{' '}
                      Riesgo de incumplimiento del SLA.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Termómetro de convivencia ───────────────────────────────────── */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-ink">{t('director_dashboard.termometro_title')}</p>
                  <p className="text-xs text-muted mt-0.5">
                    Índice basado en {kpis?.totalMsg ?? 0} reportes este mes
                  </p>
                </div>
                <span className={`text-3xl font-bold font-display leading-none ml-3 ${scoreText}`}>
                  {score.toFixed(1)}
                </span>
              </div>
              <div className="h-2 bg-cream rounded-full overflow-hidden mt-1">
                <div
                  className={`h-full ${barColor} rounded-full transition-all duration-700`}
                  style={{ width: `${barFill}%` }}
                />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px] text-muted">Calma</span>
                <span className="text-[10px] text-muted">Atención</span>
                <span className="text-[10px] text-muted">Crítico</span>
              </div>
            </div>

            {/* ── KPIs 2×2 ───────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">

              {/* Reportes */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-bold tracking-widest text-muted uppercase mb-2">
                  {t('director_dashboard.kpi_reports')}
                </p>
                <p className="text-3xl font-bold font-display text-ink leading-none">
                  {kpis?.reportes ?? 0}
                </p>
                {kpis?.reportesPct != null && (
                  <p className={`text-xs font-semibold mt-1.5 ${
                    kpis.reportesPct > 0 ? 'text-orange-500' : 'text-sage-dk'
                  }`}>
                    {kpis.reportesPct > 0 ? '↑' : '↓'} {Math.abs(kpis.reportesPct)}% {t('director_dashboard.vs_last_month')}
                  </p>
                )}
              </div>

              {/* Resueltos */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-bold tracking-widest text-muted uppercase mb-2">
                  {t('director_dashboard.kpi_resolved')}
                </p>
                <p className="text-3xl font-bold font-display text-ink leading-none">
                  {kpis?.resueltos ?? 0}
                </p>
                <p className="text-xs text-muted mt-1.5">{kpis?.resueltosPct ?? 0}%</p>
              </div>

              {/* Tiempo medio */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-bold tracking-widest text-muted uppercase mb-2">
                  {t('director_dashboard.kpi_avg_days')}
                </p>
                <p className="text-3xl font-bold font-display text-ink leading-none">
                  {kpis?.avgDays ?? 0}d
                </p>
                {kpis?.avgDaysPct != null && (
                  <p className={`text-xs font-semibold mt-1.5 ${
                    kpis.avgDaysPct < 0 ? 'text-sage-dk' : 'text-orange-500'
                  }`}>
                    {kpis.avgDaysPct < 0 ? '↓' : '↑'} {Math.abs(kpis.avgDaysPct)}%
                  </p>
                )}
              </div>

              {/* Reincidentes */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-bold tracking-widest text-muted uppercase mb-2">
                  {t('director_dashboard.kpi_recurrence')}
                </p>
                <p className="text-3xl font-bold font-display text-ink leading-none">
                  {kpis?.reincidentes ?? 0}
                </p>
                {(kpis?.reinciDelta ?? 0) !== 0 && (
                  <p className={`text-xs font-semibold mt-1.5 ${
                    (kpis?.reinciDelta ?? 0) > 0 ? 'text-orange-500' : 'text-sage-dk'
                  }`}>
                    {(kpis?.reinciDelta ?? 0) > 0 ? '+' : ''}{kpis?.reinciDelta}
                  </p>
                )}
              </div>
            </div>

            {/* ── Mapa de calor ──────────────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-bold tracking-widest text-muted uppercase">
                  Mapa de calor del centro
                </p>
                <span className="text-xs text-muted">Este mes</span>
              </div>

              <div className="bg-[#F2EAE5] rounded-2xl p-3 flex flex-col gap-2">

                {/* Fila 1-2: Patio (alto) + 2×2 aulas */}
                <div className="flex gap-2">
                  <ZoneCell
                    zone="patio" label="Patio"
                    zoneCounts={zoneCounts}
                    className="w-[42%] min-h-[176px]"
                  />
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <ZoneCell zone="aula_2b"   label="Aula 2ºB"   zoneCounts={zoneCounts} className="h-20" />
                    <ZoneCell zone="aula_3a"   label="Aula 3ºA"   zoneCounts={zoneCounts} className="h-20" />
                    <ZoneCell zone="aula_1eso" label="Aula 1ºESO" zoneCounts={zoneCounts} className="h-20" />
                    <ZoneCell zone="aula_4eso" label="Aula 4ºESO" zoneCounts={zoneCounts} className="h-20" />
                  </div>
                </div>

                {/* Fila 3: Baños · Pasillo · Clase 4 */}
                <div className="grid grid-cols-3 gap-2">
                  <ZoneCell zone="banos"   label="Baños"   zoneCounts={zoneCounts} className="h-12" />
                  <ZoneCell zone="pasillo" label="Pasillo" zoneCounts={zoneCounts} className="h-12" />
                  <ZoneCell zone="clase_4" label="Clase 4" zoneCounts={zoneCounts} className="h-12" />
                </div>

                {/* Fila 4: Gimnasio · Comedor */}
                <div className="grid grid-cols-2 gap-2">
                  <ZoneCell zone="gimnasio" label="Gimnasio" zoneCounts={zoneCounts} className="h-12" />
                  <ZoneCell zone="comedor"  label="Comedor"  zoneCounts={zoneCounts} className="h-12" />
                </div>
              </div>

              <p className="text-[10px] text-muted mt-2 text-center">
                * El ciberacoso fuera del centro también se registra
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
