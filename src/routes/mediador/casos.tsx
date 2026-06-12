import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '@/lib/edusafe/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type SeverityLevel = 'critica' | 'alta' | 'media' | 'baja'
type ReportStatus  = 'nuevo' | 'asignado' | 'en_investigacion' | 'resuelto' | 'derivado' | 'archivado'
type FilterKey     = 'todos' | 'activos' | 'cerrados'

interface Report {
  id:               string
  case_code:        string
  category:         string | null
  zone:             string | null
  severity_level:   SeverityLevel | null
  status:           ReportStatus
  description:      string | null
  created_at:       string
  last_activity_at: string
  closed_at:        string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEV: Record<SeverityLevel, { label: string; dot: string; bg: string; text: string }> = {
  critica: { label: 'CRÍTICO', dot: 'bg-red-500',    bg: 'bg-red-50',    text: 'text-red-600'    },
  alta:    { label: 'ALTO',    dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-600' },
  media:   { label: 'MEDIO',   dot: 'bg-amber-400',  bg: 'bg-amber-50',  text: 'text-amber-600'  },
  baja:    { label: 'BAJO',    dot: 'bg-green-500',  bg: 'bg-green-50',  text: 'text-green-600'  },
}

const CAT_LABEL: Record<string, string> = {
  ciberacoso: 'Online', exclusion: 'Social', fisico: 'Físico',
  verbal: 'Verbal', sexual: 'Sexual', otros: 'Otros',
}

const STATUS_DISPLAY: Record<ReportStatus, { label: string; cls: string }> = {
  nuevo:            { label: 'Abierto',           cls: 'text-muted'      },
  asignado:         { label: 'Asignado',           cls: 'text-primary'    },
  en_investigacion: { label: 'En investigación',   cls: 'text-primary'    },
  resuelto:         { label: 'Resuelto',           cls: 'text-green-600'  },
  derivado:         { label: 'Derivado',           cls: 'text-orange-600' },
  archivado:        { label: 'Archivado',          cls: 'text-muted'      },
}

const ACTIVE_STATUSES:  ReportStatus[] = ['nuevo', 'asignado', 'en_investigacion']
const CLOSED_STATUSES:  ReportStatus[] = ['resuelto', 'derivado', 'archivado']

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function timeAgo(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  <  2) return 'ahora mismo'
  if (mins  < 60) return `hace ${mins} min`
  if (hours < 24) return `hace ${hours}h`
  if (days  ===1) return 'ayer'
  return `hace ${days} días`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MediadorCasos() {
  const navigate = useNavigate()

  const [all,     setAll]     = useState<Report[]>([])
  const [filter,  setFilter]  = useState<FilterKey>('todos')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('reports')
        .select('id, case_code, category, zone, severity_level, status, description, created_at, last_activity_at, closed_at')
        .order('last_activity_at', { ascending: false })
      setAll((data ?? []) as Report[])
    } finally {
      setLoading(false)
    }
  }

  const visible = all.filter(r => {
    if (filter === 'activos')  return ACTIVE_STATUSES.includes(r.status)
    if (filter === 'cerrados') return CLOSED_STATUSES.includes(r.status)
    return true
  })

  const totalActivos  = all.filter(r => ACTIVE_STATUSES.includes(r.status)).length
  const totalCerrados = all.filter(r => CLOSED_STATUSES.includes(r.status)).length

  const FILTERS: { key: FilterKey; label: string; count: number }[] = [
    { key: 'todos',    label: 'Todos',    count: all.length      },
    { key: 'activos',  label: 'Activos',  count: totalActivos    },
    { key: 'cerrados', label: 'Cerrados', count: totalCerrados   },
  ]

  return (
    <div className="flex flex-col min-h-svh">

      {/* ── Cabecera ────────────────────────────────────────────────────────── */}
      <div className="bg-mediador px-5 pt-12 pb-5">
        <h1 className="font-display text-3xl font-bold text-white leading-tight">Todos los casos</h1>
        <p className="text-sm text-white/60 mt-0.5">
          {all.length} caso{all.length !== 1 ? 's' : ''} · {totalActivos} activo{totalActivos !== 1 ? 's' : ''} · {totalCerrados} cerrado{totalCerrados !== 1 ? 's' : ''}
        </p>
      </div>

      {/* ── Filtros ──────────────────────────────────────────────────────────── */}
      <div className="bg-mediador px-5 pb-4 flex gap-2">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-base ${
              filter === f.key
                ? 'bg-white text-mediador'
                : 'bg-white/15 text-white/80 active:bg-white/25'
            }`}
          >
            {f.label}
            <span className={`text-xs rounded-full px-1.5 py-0.5 font-bold ${
              filter === f.key ? 'bg-mediador/10 text-mediador' : 'bg-white/20 text-white'
            }`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Lista ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 bg-cream px-5 pt-5 pb-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-mediador border-t-transparent rounded-full animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 text-muted">
            <p className="text-4xl mb-2">
              {filter === 'cerrados' ? '✅' : filter === 'activos' ? '📭' : '📋'}
            </p>
            <p className="text-sm font-medium text-ink">
              {filter === 'cerrados'
                ? 'No hay casos cerrados'
                : filter === 'activos'
                ? 'No hay casos activos'
                : 'No hay casos registrados'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map(report => {
              const sev    = report.severity_level ? SEV[report.severity_level] : null
              const st     = STATUS_DISPLAY[report.status]
              const isClosed = CLOSED_STATUSES.includes(report.status)
              const tags   = [
                report.category ? CAT_LABEL[report.category] : null,
                report.zone     ? report.zone.split(',')[0].trim() : null,
              ].filter((t): t is string => Boolean(t))

              const title = report.description
                ? report.description.length > 70
                  ? report.description.slice(0, 68) + '…'
                  : report.description
                : 'Sin descripción'

              return (
                <button
                  key={report.id}
                  onClick={() => navigate(`/mediador/casos/${report.id}`)}
                  className={`bg-white rounded-2xl p-4 text-left shadow-sm active:scale-[0.99] transition-base w-full ${
                    isClosed ? 'opacity-70' : ''
                  }`}
                >
                  {/* Código + severidad */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-mono text-muted">#{report.case_code}</span>
                    {sev ? (
                      <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${sev.bg} ${sev.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sev.dot}`} />
                        {sev.label}
                      </span>
                    ) : (
                      <span className={`text-xs font-semibold ${st.cls}`}>{st.label}</span>
                    )}
                  </div>

                  {/* Descripción */}
                  <p className={`text-sm font-semibold leading-snug mb-2 ${isClosed ? 'text-ink/60' : 'text-ink'}`}>
                    {title}
                  </p>

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-cream text-muted text-[11px] font-medium rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer: fecha + estado */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">
                      {isClosed && report.closed_at
                        ? `Cerrado ${fmtDate(report.closed_at)}`
                        : timeAgo(report.last_activity_at)}
                    </span>
                    {sev && <span className={`text-xs font-semibold ${st.cls}`}>{st.label}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
