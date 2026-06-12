import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Download, FileText, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/edusafe/supabase'
import { toast } from 'sonner'

interface Acta {
  id: string
  csv_code: string
  generated_at: string
  pdf_storage_path: string
  case_code: string
  report_id: string
}

interface PendingReport {
  id: string
  case_code: string
  category: string | null
  description: string | null
  previ_steps: number[]
}

const CAT_LABEL: Record<string, string> = {
  ciberacoso: 'Ciberacoso', exclusion: 'Exclusión social', fisico: 'Violencia física',
  verbal: 'Violencia verbal', sexual: 'Acoso sexual', otros: 'Otros',
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function shortCsv(code: string): string {
  // Muestra solo los primeros 14 chars si es largo
  return code.length > 14 ? code.slice(0, 14) : code
}

export default function MediadorActas() {
  const navigate = useNavigate()

  const [actas,    setActas]    = useState<Acta[]>([])
  const [pending,  setPending]  = useState<PendingReport[]>([])
  const [loading,  setLoading]  = useState(true)
  const [dlLoading, setDlLoading] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      // Actas firmadas (tipo final)
      const { data: actasRaw } = await supabase
        .from('actas')
        .select('id, csv_code, generated_at, pdf_storage_path, report_id')
        .eq('type', 'final')
        .order('generated_at', { ascending: false })

      if (actasRaw && actasRaw.length > 0) {
        const reportIds = actasRaw.map(a => a.report_id)
        const { data: reports } = await supabase
          .from('reports')
          .select('id, case_code')
          .in('id', reportIds)

        const codeMap: Record<string, string> = {}
        reports?.forEach(r => { codeMap[r.id] = r.case_code })

        setActas(actasRaw.map(a => ({
          id:                a.id,
          csv_code:          a.csv_code,
          generated_at:      a.generated_at,
          pdf_storage_path:  a.pdf_storage_path,
          case_code:         codeMap[a.report_id] ?? '—',
          report_id:         a.report_id,
        })))
      } else {
        setActas([])
      }

      // Casos pendientes de cerrar (con protocolo incompleto)
      const { data: pendingRaw } = await supabase
        .from('reports')
        .select('id, case_code, category, description, previ_steps')
        .not('status', 'in', '(resuelto,archivado)')
        .order('severity_score', { ascending: false })
        .limit(10)

      setPending((pendingRaw ?? []).map(r => ({
        ...r,
        previ_steps: r.previ_steps ?? [],
      })))
    } finally {
      setLoading(false)
    }
  }

  async function downloadActa(acta: Acta) {
    setDlLoading(acta.id)
    try {
      const { data, error } = await supabase.storage
        .from('actas')
        .createSignedUrl(acta.pdf_storage_path, 60)

      if (error || !data?.signedUrl) {
        toast.error('No se pudo generar el enlace de descarga')
        return
      }
      const link = document.createElement('a')
      link.href     = data.signedUrl
      link.download = `acta-${acta.case_code}-${acta.csv_code.slice(0, 8)}.pdf`
      link.click()
    } finally {
      setDlLoading(null)
    }
  }

  return (
    <div className="flex flex-col min-h-svh">
      {/* Cabecera */}
      <div className="bg-mediador px-5 pt-12 pb-5">
        <h1 className="font-display text-3xl font-bold text-white leading-tight">Informes</h1>
        <p className="text-sm text-white/60 mt-0.5">Actas firmadas digitalmente con CSV</p>
      </div>

      <div className="flex-1 bg-cream px-5 pt-5 pb-4 flex flex-col gap-5">

        {/* Tarjeta informativa mostaza */}
        <div className="bg-mostaza/15 rounded-2xl p-4 flex gap-3">
          <div className="w-9 h-9 rounded-xl bg-mostaza/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <FileText className="w-4 h-4 text-mostaza" />
          </div>
          <p className="text-sm text-ink-soft leading-snug">
            Las actas se generan automáticamente al cerrar un caso y quedan listas para inspección educativa.
          </p>
        </div>

        {/* Lista de actas */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-mediador border-t-transparent rounded-full animate-spin" />
          </div>
        ) : actas.length === 0 ? (
          <div className="text-center py-6 text-muted">
            <p className="text-3xl mb-2">📄</p>
            <p className="text-sm font-medium text-ink">Sin actas generadas aún</p>
            <p className="text-xs mt-1">Se crean al cerrar un caso con el protocolo completo</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {actas.map(acta => (
              <div key={acta.id} className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm">
                {/* Icono */}
                <div className="w-10 h-10 rounded-xl bg-cream flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-muted" />
                </div>

                {/* Texto */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    Acta · #{acta.case_code}
                  </p>
                  <p className="text-xs text-muted truncate">
                    {fmtDate(acta.generated_at)} · CSV: {shortCsv(acta.csv_code)} · Firmada
                  </p>
                </div>

                {/* Verificar */}
                <a
                  href={`/verificar/${acta.csv_code}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-xl bg-cream flex items-center justify-center flex-shrink-0 active:scale-90 transition-base"
                >
                  <ExternalLink className="w-4 h-4 text-ink-soft" />
                </a>

                {/* Descarga */}
                <button
                  onClick={() => downloadActa(acta)}
                  disabled={dlLoading === acta.id}
                  className="w-8 h-8 rounded-xl bg-cream flex items-center justify-center flex-shrink-0 active:scale-90 transition-base disabled:opacity-40"
                >
                  {dlLoading === acta.id ? (
                    <div className="w-4 h-4 border-2 border-muted border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 text-ink-soft" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pendientes de cerrar */}
        {!loading && pending.length > 0 && (
          <div>
            <p className="text-[11px] font-bold tracking-widest text-muted uppercase mb-3">
              Pendientes de cerrar
            </p>
            <div className="flex flex-col gap-3">
              {pending.map(r => {
                const steps = r.previ_steps.length
                const title = r.description
                  ? r.description.length > 60 ? r.description.slice(0, 58) + '…' : r.description
                  : CAT_LABEL[r.category ?? ''] ?? 'Sin descripción'

                return (
                  <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm">
                    <p className="text-sm font-semibold text-ink leading-snug mb-0.5">
                      #{r.case_code} · {title}
                    </p>
                    <p className="text-xs text-muted mb-3">
                      {steps}/5 pasos del protocolo
                    </p>
                    <button
                      onClick={() => navigate(`/mediador/casos/${r.id}`)}
                      className="w-full py-2.5 rounded-xl border border-hairline text-sm font-semibold text-primary active:scale-[0.98] transition-base"
                    >
                      Continuar
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
