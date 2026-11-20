import { useState, useEffect, useRef } from 'react'
import { dateLocale } from '@/lib/i18n'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { supabase, callEdgeFunction } from '@/lib/edusafe/supabase'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'

interface MediadorData { centro_id: string; tenant_id: string }
interface Stats { total: number; grupos: number; lastUpdate: string | null }

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return i18n.t('mediador_alumnos.never')
  const d     = new Date(dateStr)
  const today = new Date()
  if (d.toDateString() === today.toDateString())
    return `${i18n.t('mediador_alumnos.today')} ${d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function MediadorAlumnos() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)

  const [medData,   setMedData]   = useState<MediadorData | null>(null)
  const [stats,     setStats]     = useState<Stats | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging,  setDragging]  = useState(false)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    setLoading(true)
    try {
      const { data: med } = await supabase
        .from('mediators')
        .select('centro_id, tenant_id')
        .eq('user_id', user?.id ?? '')
        .single()
      if (!med) return
      setMedData(med)

      const [{ count: total }, { data: gruposData }, { data: centro }] = await Promise.all([
        supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('centro_id', med.centro_id)
          .eq('active', true),
        supabase
          .from('students')
          .select('grupo')
          .eq('centro_id', med.centro_id)
          .eq('active', true),
        supabase
          .from('centros')
          .select('csv_uploaded_at')
          .eq('id', med.centro_id)
          .single(),
      ])

      const grupos = new Set(gruposData?.map(s => s.grupo) ?? []).size
      setStats({ total: total ?? 0, grupos, lastUpdate: centro?.csv_uploaded_at ?? null })
    } finally {
      setLoading(false)
    }
  }

  async function processCSV(file: File) {
    if (!medData) return
    setUploading(true)
    try {
      const text  = await file.text()
      const lines = text.trim().split('\n')

      // Saltamos la cabecera si la primera línea no parece datos numéricos
      const dataLines = lines[0].toLowerCase().replace(/"/g, '').includes('nombre')
        ? lines.slice(1)
        : lines

      const students = dataLines
        .map(line => {
          const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
          if (cols.length < 4) return null
          const [nombre, apellidos, curso, grupo] = cols
          if (!nombre || !curso || !grupo) return null
          return { full_name: `${nombre} ${apellidos}`.trim(), curso, grupo }
        })
        .filter((s): s is NonNullable<typeof s> => s !== null)

      if (students.length === 0) {
        toast.error(t('mediador_alumnos.csv_bad_format'))
        return
      }

      // El alta la hace el servidor (RLS no permite INSERT directo en students):
      // valida, omite los que ya existen y deja rastro en el audit_log.
      const res = await callEdgeFunction<{ inserted: number; skipped: number; invalid: number }>(
        'centros-sync', { body: { students } },
      )

      const extra = [
        res.skipped > 0 ? t('mediador_alumnos.csv_skipped', { n: res.skipped }) : '',
        res.invalid > 0 ? t('mediador_alumnos.csv_invalid', { n: res.invalid }) : '',
      ].filter(Boolean).join(', ')
      toast.success(t('mediador_alumnos.csv_added', { count: res.inserted }) + (extra ? ` (${extra})` : ''))
      await loadStats()
    } catch {
      toast.error(t('mediador_alumnos.csv_error'))
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.csv')) processCSV(file)
    else toast.error(t('mediador_alumnos.csv_only'))
  }

  const statsRows = [
    { label: t('mediador_alumnos.stat_total'),  value: stats?.total.toLocaleString(dateLocale()) ?? '—' },
    { label: t('mediador_alumnos.stat_groups'), value: stats?.grupos.toString() ?? '—'             },
    { label: t('mediador_alumnos.stat_last'),   value: fmtDate(stats?.lastUpdate ?? null)           },
  ]

  return (
    <div className="flex flex-col min-h-svh">
      {/* Cabecera */}
      <div className="bg-mediador px-5 pt-12 pb-5">
        <h1 className="font-display text-3xl font-bold text-white leading-tight">
          {t('mediador_alumnos.header')}
        </h1>
        <p className="text-sm text-white/60 mt-0.5">
          {loading
            ? t('mediador_alumnos.loading')
            : t('mediador_alumnos.header_sub', { n: stats?.total ?? 0, date: fmtDate(stats?.lastUpdate ?? null) })
          }
        </p>
      </div>

      <div className="flex-1 bg-cream px-5 pt-5 pb-4 flex flex-col gap-5">

        {/* Tarjeta informativa */}
        <div className="bg-sage-lt rounded-2xl p-4 flex gap-3">
          <div className="w-9 h-9 rounded-xl bg-sage/25 flex items-center justify-center flex-shrink-0 mt-0.5">
            <RefreshCw className="w-4 h-4 text-sage-dk" />
          </div>
          <p className="text-sm text-ink-soft leading-snug">
            {t('mediador_alumnos.info')}
          </p>
        </div>

        {/* Fuente del censo */}
        <div>
          <p className="text-[11px] font-bold tracking-widest text-muted uppercase mb-3">
            {t('mediador_alumnos.source_title')}
          </p>
          <div className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-cream flex items-center justify-center flex-shrink-0">
              <div className={`w-3.5 h-3.5 rounded-full shadow-sm ${stats?.lastUpdate ? 'bg-green-500' : 'bg-gray-300'}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">{t('mediador_alumnos.source_manual')}</p>
              <p className="text-xs text-muted">
                {stats?.lastUpdate
                  ? t('mediador_alumnos.source_last', { date: fmtDate(stats.lastUpdate) })
                  : t('mediador_alumnos.source_none')}
                {' · '}{t('mediador_alumnos.source_no_sync')}
              </p>
            </div>
          </div>
        </div>

        {/* CSV manual */}
        <div>
          <p className="text-[11px] font-bold tracking-widest text-muted uppercase mb-3">
            {t('mediador_alumnos.upload_csv')}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) processCSV(f) }}
          />
          <div
            role="button"
            tabIndex={0}
            onClick={() => !uploading && fileRef.current?.click()}
            onKeyDown={e => e.key === 'Enter' && !uploading && fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`w-full border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-2 cursor-pointer select-none transition-base ${
              dragging  ? 'border-primary bg-primary/5' :
              uploading ? 'border-hairline bg-white opacity-60' :
                          'border-hairline bg-white active:scale-[0.99]'
            }`}
          >
            {uploading ? (
              <>
                <div className="w-7 h-7 border-2 border-mediador border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted">{t('mediador_alumnos.processing')}</p>
              </>
            ) : (
              <>
                <span className="text-4xl">📤</span>
                <p className="text-sm font-semibold text-ink">{t('mediador_alumnos.drop_hint')}</p>
                <p className="text-xs text-muted">{t('mediador_alumnos.csv_columns')}</p>
              </>
            )}
          </div>
        </div>

        {/* Estadísticas del censo */}
        <div>
          <p className="text-[11px] font-bold tracking-widest text-muted uppercase mb-3">
            {t('mediador_alumnos.status_title')}
          </p>
          {loading ? (
            <div className="bg-white rounded-2xl p-6 flex justify-center">
              <div className="w-5 h-5 border-2 border-mediador border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {statsRows.map(({ label, value }, idx) => (
                <div
                  key={label}
                  className={`flex items-center justify-between px-4 py-3.5 ${
                    idx > 0 ? 'border-t border-hairline' : ''
                  }`}
                >
                  <span className="text-sm text-ink">{label}</span>
                  <span className="text-sm font-semibold text-ink">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
