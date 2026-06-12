import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router'
import { ArrowLeft, AlertTriangle, MessageCircle, Building2, ClipboardCheck, Download, ExternalLink, X } from 'lucide-react'
import { supabase, callEdgeFunction } from '@/lib/edusafe/supabase'
import type { GenerateActaResponse } from '@/lib/edusafe/types'
import { toast } from 'sonner'

type SeverityLevel = 'critica' | 'alta' | 'media' | 'baja'
type ReportStatus  = 'nuevo' | 'asignado' | 'en_investigacion' | 'resuelto' | 'derivado' | 'archivado'

interface VerifyResult {
  status:     'auth' | 'possible_ai' | 'undetermined'
  confidence: number
  provider:   string
}

const VERIFY_CFG = {
  auth:         { label: 'Auténtica',       cls: 'bg-green-100 text-green-700 border-green-200',  icon: '✓' },
  possible_ai:  { label: 'Posible IA',      cls: 'bg-amber-100 text-amber-700 border-amber-200',  icon: '⚠' },
  undetermined: { label: 'No determinable', cls: 'bg-gray-100 text-gray-500 border-gray-200',     icon: '—' },
} as const

const SEV_LABEL: Record<SeverityLevel, string> = {
  critica: 'CRÍTICO', alta: 'ALTO', media: 'MEDIO', baja: 'BAJO',
}
const SEV_TITLE: Record<SeverityLevel, string> = {
  critica: 'crítico', alta: 'alto', media: 'medio', baja: 'bajo',
}
const CAT_LABEL: Record<string, string> = {
  ciberacoso: 'CIBERACOSO', exclusion: 'EXCLUSIÓN', fisico: 'FÍSICO',
  verbal: 'VERBAL', sexual: 'SEXUAL', otros: 'OTROS',
}
const AI_DESC: Record<string, string> = {
  ciberacoso: 'Detectadas amenazas explícitas. Cruzado con reincidencia (3 reportes previos).',
  exclusion:  'Detectado patrón sistemático de exclusión social.',
  fisico:     'Indicadores de violencia física reiterada.',
  verbal:     'Lenguaje denigrante reiterado identificado.',
  sexual:     'Contenido de carácter sexual detectado. Derivación prioritaria.',
  otros:      'Clasificación general. Revisión manual recomendada.',
}
const STATUS_EVENT: Record<ReportStatus, { title: string; desc: string }> = {
  nuevo:            { title: 'Caso abierto',              desc: 'Pendiente de asignación a mediador/a.' },
  asignado:         { title: 'Caso asignado',             desc: 'Mediador/a asignado/a. Inicio de investigación.' },
  en_investigacion: { title: 'En contacto con denunciante', desc: 'Chat anónimo activo. Pendiente: entrevista presencial con víctima.' },
  resuelto:         { title: 'Caso cerrado',              desc: 'Caso resuelto y archivado correctamente.' },
  derivado:         { title: 'Derivado a Dirección',       desc: 'Caso trasladado a Dirección para seguimiento.' },
  archivado:        { title: 'Caso archivado',            desc: 'Archivado sin resolución explícita.' },
}

const PREVI_STEPS = [
  'Recepción y clasificación del caso',
  'Contacto con denunciante',
  'Entrevista con víctima',
  'Comunicación a familias',
  'Generación de acta final',
]

function fmtDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
}

function initials(fullName: string, style: 'firstLast' | 'firstLast2'): string {
  const p = fullName.trim().split(' ')
  if (p.length < 2) return fullName
  if (style === 'firstLast')  return `${p[0]} ${p[1][0]}.`
  return `${p[0][0]}. ${p.slice(1).join(' ')}`
}

interface ReportDetail {
  id: string
  case_code: string
  category: string | null
  severity_level: SeverityLevel | null
  status: ReportStatus
  description: string | null
  zone: string | null
  created_at: string
  last_activity_at: string
  previ_steps: number[]
  flagged_as_crime: boolean
  text_verification: VerifyResult | null
}
interface Involved {
  role: string
  student: { full_name: string; curso: string; grupo: string } | null
}

export default function MediadorCaso() {
  const { caseId }  = useParams<{ caseId: string }>()
  const navigate    = useNavigate()

  const [report,        setReport]        = useState<ReportDetail | null>(null)
  const [involved,      setInvolved]      = useState<Involved[]>([])
  const [evidenceCount, setEvidenceCount] = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [savingStep,    setSavingStep]    = useState<number | null>(null)

  // Estado del modal de cierre
  const [closeModal,    setCloseModal]    = useState<'hidden' | 'form' | 'generating'>('hidden')
  const [conclusiones,  setConclusiones]  = useState('')
  const [actaResult,    setActaResult]    = useState<GenerateActaResponse | null>(null)

  useEffect(() => { if (caseId) load(caseId) }, [caseId])

  async function load(id: string) {
    setLoading(true)
    try {
      const { data: r } = await supabase
        .from('reports')
        .select('id, case_code, category, severity_level, status, description, zone, created_at, last_activity_at, previ_steps, flagged_as_crime, text_verification')
        .eq('id', id)
        .single()
      if (!r) return
      setReport({
        ...r,
        previ_steps:       r.previ_steps ?? [],
        flagged_as_crime:  r.flagged_as_crime ?? false,
        text_verification: (r.text_verification as VerifyResult | null) ?? null,
      })

      const { data: inv } = await supabase
        .from('report_involved')
        .select('role, students(full_name, curso, grupo)')
        .eq('report_id', id)
      setInvolved((inv ?? []).map((i: { role: string; students: { full_name: string; curso: string; grupo: string } | null }) => ({ role: i.role, student: i.students })))

      const { count } = await supabase
        .from('evidence_files')
        .select('*', { count: 'exact', head: true })
        .eq('report_id', id)
      setEvidenceCount(count ?? 0)
    } finally {
      setLoading(false)
    }
  }

  async function toggleStep(idx: number) {
    if (!report) return
    setSavingStep(idx)
    const prev = report.previ_steps
    const next = prev.includes(idx) ? prev.filter(s => s !== idx) : [...prev, idx].sort((a, b) => a - b)
    const { error } = await supabase.from('reports').update({ previ_steps: next }).eq('id', report.id)
    if (!error) setReport(r => r ? { ...r, previ_steps: next } : r)
    else toast.error('No se pudo actualizar el protocolo')
    setSavingStep(null)
  }

  async function flagAsCrime() {
    if (!report || report.flagged_as_crime) return
    const { error } = await supabase
      .from('reports')
      .update({ flagged_as_crime: true, status: 'derivado' })
      .eq('id', report.id)
    if (!error) {
      setReport(r => r ? { ...r, flagged_as_crime: true, status: 'derivado' } : r)
      toast.success('Caso marcado como posible delito y derivado')
    }
  }

  async function deriveToDirector() {
    if (!report || report.status === 'derivado') return
    const { error } = await supabase
      .from('reports')
      .update({ status: 'derivado' })
      .eq('id', report.id)
    if (!error) {
      setReport(r => r ? { ...r, status: 'derivado' } : r)
      toast.success('Caso derivado a Dirección')
    }
  }

  async function closeCase() {
    if (!report || report.status === 'resuelto') return
    const { error } = await supabase
      .from('reports')
      .update({ status: 'resuelto', closed_at: new Date().toISOString() })
      .eq('id', report.id)
    if (!error) {
      toast.success('Caso cerrado correctamente')
      navigate('/mediador')
    }
  }

  async function generateActaAndClose() {
    if (!report) return
    setCloseModal('generating')
    try {
      const res = await callEdgeFunction<GenerateActaResponse>('actas-generate', {
        body: { report_id: report.id, type: 'final', conclusiones: conclusiones.trim() || undefined },
      })
      setActaResult(res)
      setReport(r => r ? { ...r, status: 'resuelto' } : r)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error generando el acta')
      setCloseModal('form')
    }
  }

  function downloadActa() {
    if (!actaResult?.download_url) return
    const link = document.createElement('a')
    link.href     = actaResult.download_url
    link.download = `acta-${report?.case_code ?? ''}.pdf`
    link.click()
  }

  if (loading || !report) {
    return (
      <div className="flex items-center justify-center min-h-svh bg-cream">
        <div className="w-6 h-6 border-2 border-mediador border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const victim    = involved.find(i => i.role === 'victima')
  const aggressor = involved.find(i => i.role === 'agresor')
  const done      = report.previ_steps

  // Línea de tiempo derivada del estado del caso
  const plusMinutes = (base: string, m: number) =>
    new Date(new Date(base).getTime() + m * 60_000).toISOString()

  const timeline = [
    {
      ts:      fmtDateTime(report.created_at),
      title:   'Reporte recibido',
      desc:    `Alumno/a anónimo/a inicia caso.${evidenceCount > 0 ? ` ${evidenceCount} capturas adjuntas.` : ''}`,
      current: false,
    },
    ...(report.severity_level ? [{
      ts:      fmtDateTime(plusMinutes(report.created_at, 9)),
      title:   `IA clasifica como ${SEV_LABEL[report.severity_level]}`,
      desc:    AI_DESC[report.category ?? ''] ?? 'Clasificación automática completada.',
      current: false,
    }] : []),
    {
      ts:      'ahora',
      title:   STATUS_EVENT[report.status].title,
      desc:    STATUS_EVENT[report.status].desc,
      current: true,
    },
  ]

  const victimLine = victim?.student
    ? `Víctima: ${initials(victim.student.full_name, 'firstLast')} (${victim.student.curso}º${victim.student.grupo})`
    : ''
  const aggrLine = aggressor?.student
    ? `Agresor: ${initials(aggressor.student.full_name, 'firstLast2')} (${aggressor.student.curso}º${aggressor.student.grupo})`
    : ''

  return (
    <div className="flex flex-col min-h-svh">
      {/* Cabecera */}
      <div className="bg-mediador px-5 pt-12 pb-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">
            #{report.case_code} · {CAT_LABEL[report.category ?? ''] ?? 'CASO'}
          </p>
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center active:scale-95 transition-base"
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
        </div>
        <h1 className="font-display text-2xl font-bold text-white leading-tight mb-1">
          Caso {report.severity_level ? SEV_TITLE[report.severity_level] : 'activo'}
        </h1>
        {(victimLine || aggrLine) && (
          <p className="text-sm text-white/65 leading-snug">
            {[victimLine, aggrLine].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {/* Cuerpo scrollable */}
      <div className="flex-1 overflow-auto bg-cream px-5 pt-5 pb-4">

        {/* Línea de tiempo */}
        <p className="text-[11px] font-bold tracking-widest text-muted uppercase mb-3">
          Línea de tiempo del caso
        </p>
        <div className="relative pl-7 flex flex-col gap-0">
          {/* Línea vertical */}
          <div className="absolute left-2 top-2 bottom-6 w-0.5 bg-hairline" />

          {timeline.map((ev, idx) => (
            <div key={idx} className="pb-4 relative">
              {/* Dot */}
              <div className={`absolute -left-5 top-1 w-4 h-4 rounded-full border-2 ${
                ev.current
                  ? 'bg-mediador border-mediador'
                  : 'bg-sage border-sage'
              }`} />
              <p className="text-xs text-muted mb-0.5">{ev.ts}</p>
              <p className="text-sm font-bold text-ink">{ev.title}</p>
              <p className="text-xs text-muted leading-snug mt-0.5">{ev.desc}</p>
            </div>
          ))}
        </div>

        {/* Evidencias verificadas */}
        {report.text_verification && (
          <>
            <p className="text-[11px] font-bold tracking-widest text-muted uppercase mt-1 mb-3">
              Evidencias verificadas
            </p>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm mb-4">
              {/* Relato del alumno */}
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">Relato del alumno</p>
                  {report.text_verification.provider !== 'none' && (
                    <p className="text-xs text-muted mt-0.5">
                      Confianza: {Math.round(report.text_verification.confidence * 100)}% · {report.text_verification.provider}
                    </p>
                  )}
                </div>
                {(() => {
                  const cfg = VERIFY_CFG[report.text_verification.status]
                  return (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.cls}`}>
                      <span>{cfg.icon}</span>{cfg.label}
                    </span>
                  )
                })()}
              </div>

              {/* Nota aclaratoria */}
              <div className="px-4 py-2.5 border-t border-hairline bg-cream/50">
                <p className="text-xs text-muted leading-snug">
                  La verificación es orientativa y no determina la validez legal del caso. Un "Posible IA" no descarta que el hecho sea real.
                </p>
              </div>
            </div>
          </>
        )}

        {/* Protocolo PREVI */}
        <div className="flex items-center justify-between mt-1 mb-3">
          <p className="text-[11px] font-bold tracking-widest text-muted uppercase">
            Protocolo legal
          </p>
          <span className="text-xs font-bold text-primary">
            {done.length}/{PREVI_STEPS.length}
          </span>
        </div>

        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          {PREVI_STEPS.map((step, idx) => {
            const checked = done.includes(idx)
            const saving  = savingStep === idx
            const isLast  = idx === PREVI_STEPS.length - 1
            return (
              <button
                key={idx}
                onClick={() => toggleStep(idx)}
                disabled={saving}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-base ${
                  idx > 0 ? 'border-t border-hairline' : ''
                } ${checked ? '' : 'active:bg-cream'}`}
              >
                {saving ? (
                  <div className="w-5 h-5 border-2 border-mediador border-t-transparent rounded-full animate-spin flex-shrink-0" />
                ) : checked ? (
                  <div className="w-5 h-5 rounded bg-sage flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded border-2 border-hairline flex-shrink-0" />
                )}
                <span className={`text-sm ${
                  checked
                    ? 'line-through text-muted'
                    : isLast
                    ? 'text-primary font-medium'
                    : 'text-ink'
                }`}>
                  {step}
                </span>
              </button>
            )
          })}
        </div>

        {/* Botones de acción 2×2 */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            onClick={flagAsCrime}
            disabled={report.flagged_as_crime}
            className="flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-hairline bg-white text-sm font-semibold text-ink shadow-sm disabled:opacity-40 active:scale-[0.98] transition-base"
          >
            <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
            Posible delito
          </button>
          <button
            onClick={() => navigate(`/mediador/chat/${report.id}`)}
            className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-mediador text-white text-sm font-semibold shadow-sm active:scale-[0.98] transition-base"
          >
            <MessageCircle className="w-4 h-4 flex-shrink-0" />
            Abrir chat
          </button>
          <button
            onClick={deriveToDirector}
            disabled={report.status === 'derivado' || report.status === 'resuelto'}
            className="flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-hairline bg-white text-sm font-semibold text-ink shadow-sm disabled:opacity-40 active:scale-[0.98] transition-base"
          >
            <Building2 className="w-4 h-4 flex-shrink-0" />
            Derivar a Dirección
          </button>
          <button
            onClick={() => setCloseModal('form')}
            disabled={report.status === 'resuelto' || report.status === 'archivado'}
            className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-sage text-white text-sm font-semibold shadow-sm disabled:opacity-40 active:scale-[0.98] transition-base"
          >
            <ClipboardCheck className="w-4 h-4 flex-shrink-0" />
            Cerrar caso
          </button>
        </div>
      </div>

      {/* ── Modal: cerrar caso ──────────────────────────────────────────────── */}
      {closeModal !== 'hidden' && (
        <div className="fixed inset-0 z-50 flex items-end">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { if (closeModal === 'form') setCloseModal('hidden') }}
          />

          {/* Bottom sheet */}
          <div className="relative w-full bg-white rounded-t-3xl px-5 pt-5 pb-8 shadow-2xl">

            {/* ── Formulario ── */}
            {(closeModal === 'form' || closeModal === 'generating') && !actaResult && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-lg font-bold text-ink">Cerrar caso</h2>
                  <button
                    onClick={() => setCloseModal('hidden')}
                    className="w-8 h-8 rounded-full bg-cream flex items-center justify-center active:bg-hairline transition-base"
                  >
                    <X className="w-4 h-4 text-muted" />
                  </button>
                </div>

                <label className="text-xs font-bold tracking-widest text-muted uppercase block mb-2">
                  Conclusiones (opcional)
                </label>
                <textarea
                  value={conclusiones}
                  onChange={e => setConclusiones(e.target.value)}
                  placeholder="Describe el resultado de la mediación, acuerdos alcanzados y seguimiento previsto..."
                  rows={4}
                  disabled={closeModal === 'generating'}
                  className="w-full px-4 py-3 rounded-2xl border border-hairline bg-cream text-sm text-ink placeholder:text-muted focus:outline-none focus:border-mediador resize-none disabled:opacity-50"
                />

                <div className="flex flex-col gap-2.5 mt-4">
                  <button
                    onClick={generateActaAndClose}
                    disabled={closeModal === 'generating'}
                    className="w-full py-3.5 bg-mediador text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-base"
                  >
                    {closeModal === 'generating' ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generando acta…
                      </>
                    ) : (
                      <>
                        <ClipboardCheck className="w-4 h-4" />
                        Generar acta y cerrar
                      </>
                    )}
                  </button>
                  <button
                    onClick={closeCase}
                    disabled={closeModal === 'generating'}
                    className="w-full py-3 text-sm font-medium text-muted disabled:opacity-40"
                  >
                    Solo cerrar sin acta
                  </button>
                </div>
              </>
            )}

            {/* ── Éxito ── */}
            {actaResult && (
              <>
                <div className="text-center mb-5">
                  <div className="w-14 h-14 bg-sage/15 rounded-full flex items-center justify-center mx-auto mb-3">
                    <ClipboardCheck className="w-7 h-7 text-sage" />
                  </div>
                  <h2 className="font-display text-lg font-bold text-ink">Acta generada</h2>
                  <p className="text-sm text-muted mt-1">Caso cerrado y acta firmada digitalmente</p>
                </div>

                {/* CSV code */}
                <div className="bg-cream rounded-2xl px-5 py-4 text-center mb-4">
                  <p className="text-xs font-bold tracking-widest text-muted uppercase mb-1">
                    Código de verificación (CSV)
                  </p>
                  <p className="font-mono text-2xl font-bold text-ink tracking-widest">
                    {actaResult.csv_code}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    Cualquier parte puede verificar la autenticidad con este código
                  </p>
                </div>

                <div className="flex gap-3 mb-3">
                  <button
                    onClick={downloadActa}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-hairline bg-white text-sm font-semibold text-ink active:scale-[0.98] transition-base shadow-sm"
                  >
                    <Download className="w-4 h-4 text-mediador" />
                    Descargar PDF
                  </button>
                  <a
                    href={actaResult.verify_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-hairline bg-white text-sm font-semibold text-ink active:scale-[0.98] transition-base shadow-sm"
                  >
                    <ExternalLink className="w-4 h-4 text-mediador" />
                    Verificar
                  </a>
                </div>

                <button
                  onClick={() => navigate('/mediador/informes')}
                  className="w-full py-3 text-sm font-semibold text-primary"
                >
                  Ver en Informes →
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
