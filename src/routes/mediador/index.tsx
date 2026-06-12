import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Bell, Brain } from 'lucide-react'
import { supabase } from '@/lib/edusafe/supabase'
import { useAuth } from '@/context/AuthContext'

type SeverityLevel = 'critica' | 'alta' | 'media' | 'baja'
type ReportStatus = 'nuevo' | 'asignado' | 'en_investigacion' | 'resuelto' | 'derivado' | 'archivado'

interface Report {
  id: string
  case_code: string
  category: string | null
  zone: string | null
  severity_level: SeverityLevel | null
  severity_score: number | null
  status: ReportStatus
  description: string | null
  created_at: string
  last_activity_at: string
  unreadCount: number
}

interface AIAlert {
  studentName: string
  curso: string
  count: number
}

const SEV: Record<SeverityLevel, { label: string; dot: string; bg: string; text: string }> = {
  critica: { label: 'CRÍTICO', dot: 'bg-red-500',    bg: 'bg-red-50',    text: 'text-red-600'    },
  alta:    { label: 'ALTO',    dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-600' },
  media:   { label: 'MEDIO',   dot: 'bg-amber-400',  bg: 'bg-amber-50',  text: 'text-amber-600'  },
  baja:    { label: 'BAJO',    dot: 'bg-green-500',  bg: 'bg-green-50',  text: 'text-green-600'  },
}

const CAT_LABEL: Record<string, string> = {
  ciberacoso: 'Online',
  exclusion:  'Social',
  fisico:     'Físico',
  verbal:     'Verbal',
  sexual:     'Sexual',
  otros:      'Otros',
}

const STATUS_DISPLAY: Record<ReportStatus, { label: string; cls: string }> = {
  nuevo:            { label: 'Abierto',           cls: 'text-muted'       },
  asignado:         { label: 'Asignado',           cls: 'text-primary'     },
  en_investigacion: { label: 'En investigación',   cls: 'text-muted'       },
  resuelto:         { label: 'Resuelto',           cls: 'text-green-600'   },
  derivado:         { label: 'Derivado',           cls: 'text-orange-600'  },
  archivado:        { label: 'Archivado',          cls: 'text-muted'       },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins < 2)   return 'ahora mismo'
  if (mins < 60)  return `hace ${mins} min`
  if (hours < 24) return `hace ${hours}h`
  if (days === 1) return 'ayer'
  return `hace ${days} días`
}

export default function MediadorInbox() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [mediadorName, setMediadorName] = useState('')
  const [reports, setReports]           = useState<Report[]>([])
  const [aiAlert, setAiAlert]           = useState<AIAlert | null>(null)
  const [loading, setLoading]           = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      // Nombre del mediador
      const { data: med } = await supabase
        .from('mediators')
        .select('full_name')
        .eq('user_id', user?.id ?? '')
        .single()
      if (med) setMediadorName(med.full_name)

      // Casos activos (excluye archivados)
      const { data: raw } = await supabase
        .from('reports')
        .select('id, case_code, category, zone, severity_level, severity_score, status, description, created_at, last_activity_at')
        .neq('status', 'archivado')
        .order('severity_score', { ascending: false })
        .order('last_activity_at', { ascending: false })

      if (!raw || raw.length === 0) { setReports([]); return }

      // Mensajes no leídos del alumno
      const ids = raw.map(r => r.id)
      const { data: unread } = await supabase
        .from('messages')
        .select('report_id')
        .eq('sender_type', 'alumno')
        .is('read_at', null)
        .in('report_id', ids)

      const unreadMap: Record<string, number> = {}
      unread?.forEach(m => { unreadMap[m.report_id] = (unreadMap[m.report_id] ?? 0) + 1 })

      setReports(raw.map(r => ({ ...r, unreadCount: unreadMap[r.id] ?? 0 })))

      // Alerta de IA — alumno repetido como agresor ≥3 veces en 14 días
      const cutoff    = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const recentIds = raw.filter(r => r.created_at >= cutoff).map(r => r.id)

      if (recentIds.length >= 3) {
        const { data: inv } = await supabase
          .from('report_involved')
          .select('student_id, students(full_name, curso, grupo)')
          .eq('role', 'agresor')
          .in('report_id', recentIds)

        if (inv && inv.length > 0) {
          const grouped: Record<string, { count: number; name: string; curso: string }> = {}
          inv.forEach((row: { student_id: string; students: { full_name?: string; curso?: string; grupo?: string } | null }) => {
            if (!grouped[row.student_id]) {
              grouped[row.student_id] = {
                count: 0,
                name:  row.students?.full_name ?? 'Alumno desconocido',
                curso: `${row.students?.curso ?? ''}${row.students?.grupo ?? ''}`,
              }
            }
            grouped[row.student_id].count++
          })

          const top = Object.values(grouped)
            .filter(g => g.count >= 3)
            .sort((a, b) => b.count - a.count)[0]

          if (top) setAiAlert({ studentName: top.name, curso: top.curso, count: top.count })
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const activeCount   = reports.filter(r => r.status !== 'resuelto' && r.status !== 'archivado').length
  const criticalCount = reports.filter(r => r.severity_level === 'critica').length

  return (
    <div className="flex flex-col min-h-svh">
      {/* Cabecera */}
      <div className="bg-mediador px-5 pt-12 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-widest text-white/50 uppercase mb-1">
              Mediadora · {mediadorName || user?.email?.split('@')[0]}
            </p>
            <h1 className="font-display text-3xl font-bold text-white leading-tight">Bandeja</h1>
            <p className="text-sm text-white/60 mt-0.5">
              {activeCount} abierto{activeCount !== 1 ? 's' : ''} · {criticalCount} crítico{criticalCount !== 1 ? 's' : ''}
            </p>
          </div>
          <button className="w-11 h-11 rounded-2xl bg-amber-400 flex items-center justify-center shadow-md mt-1 active:scale-95 transition-base">
            <Bell className="w-5 h-5 text-amber-900" />
          </button>
        </div>

        {/* Alerta de IA */}
        {aiAlert && (
          <div className="mt-4 bg-white/10 rounded-2xl p-4 flex gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-snug">
                Alerta de IA · Reincidencia
              </p>
              <p className="text-xs text-white/75 mt-0.5 leading-snug">
                {aiAlert.count} reportes independientes mencionan a{' '}
                <span className="font-semibold">{aiAlert.studentName}</span>{' '}
                ({aiAlert.curso}) en los últimos 14 días. Recomendamos derivar a Dirección.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Lista de casos */}
      <div className="flex-1 bg-cream px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold tracking-widest text-muted uppercase">
            Casos activos
          </p>
          <button className="text-xs text-primary font-semibold">Filtrar</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-mediador border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 text-muted">
            <p className="text-4xl mb-2">✅</p>
            <p className="text-sm font-medium text-ink">Sin casos activos</p>
            <p className="text-xs mt-1">Todos los casos están resueltos</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {reports.map(report => {
              const sev  = report.severity_level ? SEV[report.severity_level] : null
              const st   = STATUS_DISPLAY[report.status]
              const tags = [
                report.zone,
                report.category ? CAT_LABEL[report.category] : null,
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
                  className="bg-white rounded-2xl p-4 text-left shadow-sm active:scale-[0.99] transition-base w-full"
                >
                  {/* Código + severidad */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-mono text-muted">#{report.case_code}</span>
                    {sev && (
                      <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${sev.bg} ${sev.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sev.dot}`} />
                        {sev.label}
                      </span>
                    )}
                  </div>

                  {/* Título */}
                  <p className="text-sm font-semibold text-ink leading-snug mb-2">{title}</p>

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

                  {/* Tiempo + estado / mensajes */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">{timeAgo(report.last_activity_at)}</span>
                    {report.unreadCount > 0 ? (
                      <span className="text-xs font-semibold text-primary">
                        {report.unreadCount} mensaje{report.unreadCount > 1 ? 's' : ''} nuevo{report.unreadCount > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className={`text-xs ${st.cls}`}>{st.label}</span>
                    )}
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
