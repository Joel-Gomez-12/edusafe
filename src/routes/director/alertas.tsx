import { useState, useEffect } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { supabase } from '@/lib/edusafe/supabase'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from 'react-i18next'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Reincidente {
  studentId:   string
  displayName: string   // "M. S. (3ºA)"
  count:       number
}

interface SLAItem {
  label: string
  pct:   number
  met:   boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function anonymize(fullName: string, grupo: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0]?.toUpperCase() ?? '?'
  const last  = parts.length > 1 ? parts[parts.length - 1][0].toUpperCase() : '?'
  return `${first}. ${last}. (${grupo})`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DirectorAlertas() {
  const { user } = useAuth()
  const { t } = useTranslation()

  const [reincidentes, setReincidentes] = useState<Reincidente[]>([])
  const [slaItems,     setSlaItems]     = useState<SLAItem[]>([])
  const [hasThreePlus, setHasThreePlus] = useState(false)
  const [loading,      setLoading]      = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      // ── Director info ────────────────────────────────────────────────────
      const { data: dir } = await supabase
        .from('directors')
        .select('tenant_id')
        .eq('user_id', user?.id ?? '')
        .single()
      if (!dir) return

      const now        = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const thirtyAgo  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

      // ── Consultas en paralelo ────────────────────────────────────────────
      const [{ data: slaReports }, { data: monthIds }] = await Promise.all([
        // SLA: últimos 30 días (cubre ventanas de 2h, 24h y 15 días)
        supabase
          .from('reports')
          .select('id, severity_level, status, created_at, closed_at')
          .eq('tenant_id', dir.tenant_id)
          .gte('created_at', thirtyAgo),
        // Reincidencia: solo mes actual → solo necesito los IDs
        supabase
          .from('reports')
          .select('id')
          .eq('tenant_id', dir.tenant_id)
          .gte('created_at', monthStart),
      ])

      // ── Reincidentes ─────────────────────────────────────────────────────
      const currIds = monthIds?.map(r => r.id) ?? []

      let involvedRows: { student_id: string }[] = []
      if (currIds.length > 0) {
        const { data } = await supabase
          .from('report_involved')
          .select('student_id')
          .in('report_id', currIds)
          .eq('role', 'agresor')
        involvedRows = data ?? []
      }

      // Agrupar por estudiante
      const aggMap: Record<string, number> = {}
      involvedRows.forEach(i => { aggMap[i.student_id] = (aggMap[i.student_id] ?? 0) + 1 })

      const hasTresMas = Object.values(aggMap).some(c => c >= 3)
      setHasThreePlus(hasTresMas)

      // Ranking: 2+ apariciones, ordenado desc, top 5
      const ranked = Object.entries(aggMap)
        .filter(([, c]) => c >= 2)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)

      // Nombre anonimizado
      if (ranked.length > 0) {
        const ids = ranked.map(([id]) => id)
        const { data: students } = await supabase
          .from('students')
          .select('id, full_name, grupo')
          .in('id', ids)

        const sMap: Record<string, { full_name: string; grupo: string }> = {}
        students?.forEach(s => { sMap[s.id] = s })

        setReincidentes(
          ranked.map(([studentId, count]) => {
            const s = sMap[studentId]
            return {
              studentId,
              displayName: s ? anonymize(s.full_name, s.grupo) : '? ?. (?)',
              count,
            }
          }),
        )
      }

      // ── SLA ───────────────────────────────────────────────────────────────
      const ts      = now.getTime()
      const TWO_H   = 2  * 60 * 60 * 1000
      const ONE_DAY = 24 * 60 * 60 * 1000
      const FIFTEEN = 15 * 24 * 60 * 60 * 1000

      const sl = slaReports ?? []

      function slaRate(
        candidates: typeof sl,
        predMet: (r: typeof sl[0]) => boolean,
      ): number {
        if (!candidates.length) return 100
        return Math.round(candidates.filter(predMet).length / candidates.length * 100)
      }

      const critCandidates  = sl.filter(r => r.severity_level === 'critica' && ts - new Date(r.created_at).getTime() > TWO_H)
      const genCandidates   = sl.filter(r => ts - new Date(r.created_at).getTime() > ONE_DAY)
      const closeCandidates = sl.filter(r => ts - new Date(r.created_at).getTime() > FIFTEEN)

      const critPct  = slaRate(critCandidates,  r => r.status !== 'nuevo')
      const genPct   = slaRate(genCandidates,   r => r.status !== 'nuevo')
      const closePct = slaRate(closeCandidates, r => ['resuelto', 'archivado'].includes(r.status))

      setSlaItems([
        { label: 'Respuesta crítica < 2h',   pct: critPct,  met: critPct  >= 90 },
        { label: 'Respuesta general < 24h',  pct: genPct,   met: genPct   >= 90 },
        { label: 'Cierre formal < 15 días',  pct: closePct, met: closePct >= 80 },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-svh">
      {/* ── Cabecera ────────────────────────────────────────────────────────── */}
      <div className="bg-director px-5 pt-12 pb-5">
        <h1 className="font-display text-3xl font-bold text-white leading-tight">{t('director_alertas.title')}</h1>
        <p className="text-sm text-white/55 mt-0.5 leading-snug">
          No verás el contenido de los chats.{' '}
          Solo lo que requiere tu atención.
        </p>
      </div>

      <div className="flex-1 bg-cream px-5 pt-5 pb-4 flex flex-col gap-5">

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-director border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Banner reincidencia ────────────────────────────────────────── */}
            {hasThreePlus && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-ink-soft leading-snug">
                  <span className="font-semibold text-ink">Reincidencia detectada.</span>{' '}
                  Un alumno aparece en 3+ reportes este mes.
                </p>
              </div>
            )}

            {/* ── Ranking de reincidencia ───────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-bold tracking-widest text-muted uppercase">
                  Ranking de reincidencia
                </p>
                <span className="text-xs font-medium text-primary">Privacidad</span>
              </div>

              {reincidentes.length === 0 ? (
                <div className="bg-white rounded-2xl p-5 text-center shadow-sm">
                  <p className="text-sm text-muted">Sin reincidentes este mes</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                  {reincidentes.map((r, idx) => (
                    <div
                      key={r.studentId}
                      className={`flex items-center gap-3 px-4 py-3.5 ${
                        idx > 0 ? 'border-t border-hairline' : ''
                      }`}
                    >
                      {/* Posición */}
                      <div className="w-7 h-7 rounded-full bg-[#FFECE8] flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] font-bold text-[#D45A3A] leading-none">
                          {idx + 1}
                        </span>
                      </div>

                      {/* Nombre */}
                      <span className="flex-1 text-sm font-medium text-ink">
                        {r.displayName}
                      </span>

                      {/* Conteo */}
                      <span className="text-sm text-muted">
                        {r.count} reportes
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Cumplimiento de plazos SLA ────────────────────────────────── */}
            <div>
              <p className="text-[11px] font-bold tracking-widest text-muted uppercase mb-3">
                Cumplimiento de plazos
              </p>
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                {slaItems.map((item, idx) => (
                  <div
                    key={item.label}
                    className={`flex items-center gap-3 px-4 py-3.5 ${
                      idx > 0 ? 'border-t border-hairline' : ''
                    }`}
                  >
                    {/* Icono */}
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      item.met ? 'bg-green-500' : 'bg-amber-400'
                    }`}>
                      {item.met
                        ? <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                        : <span className="text-white font-bold text-xs leading-none">!</span>
                      }
                    </div>

                    {/* Texto */}
                    <span className={`text-sm flex-1 leading-snug ${
                      item.met ? 'line-through text-ink-soft/60' : 'text-ink'
                    }`}>
                      {item.label}:{' '}
                      <span className={`font-semibold not-italic ${
                        item.met ? 'text-ink-soft/60' : 'text-amber-600'
                      }`}>
                        {item.pct}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
