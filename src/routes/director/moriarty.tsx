import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Folder, LockKeyhole, Check, Shield } from 'lucide-react'
import { supabase } from '@/lib/edusafe/supabase'
import { useAuth } from '@/context/AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Expedient {
  id:          string
  case_code:   string
  category:    string | null
  description: string | null
  status:      string
  created_at:  string
  morId:       string
  hash:        string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sha256(input: string): Promise<string> {
  const buf  = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function genMorId(caseCode: string, createdAt: string): string {
  const year = new Date(createdAt).getFullYear()
  let h = 0
  for (let i = 0; i < caseCode.length; i++) {
    h = Math.imul(31, h) + caseCode.charCodeAt(i) | 0
  }
  const num = (Math.abs(h) % 9000) + 1000
  return `MOR-${year}-${num.toString().padStart(4, '0')}`
}

const CAT_LABEL: Record<string, string> = {
  ciberacoso: 'director_moriarty.cat_ciberacoso',
  sexual:     'director_moriarty.cat_sexual',
  fisico:     'director_moriarty.cat_fisico',
  verbal:     'director_moriarty.cat_verbal',
  exclusion:  'director_moriarty.cat_exclusion',
  otros:      'director_moriarty.cat_otros',
}

function escaladoStatus(status: string): string {
  if (status === 'derivado')         return 'director_moriarty.st_gdt'
  if (status === 'en_investigacion') return 'director_moriarty.st_investigating'
  if (status === 'resuelto')         return 'director_moriarty.st_closed'
  return 'director_moriarty.st_pending'
}

const PROTOCOL = [
  'director_moriarty.protocol_1',
  'director_moriarty.protocol_2',
  'director_moriarty.protocol_3',
  'director_moriarty.protocol_4',
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function DirectorMoriarty() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [expedients, setExpedients] = useState<Expedient[]>([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data: dir } = await supabase
        .from('directors')
        .select('tenant_id')
        .eq('user_id', user?.id ?? '')
        .single()
      if (!dir) return

      const { data: cases } = await supabase
        .from('reports')
        .select('id, case_code, category, description, status, created_at')
        .eq('tenant_id', dir.tenant_id)
        .eq('flagged_as_crime', true)
        .order('created_at', { ascending: false })

      if (!cases?.length) { setExpedients([]); return }

      // SHA256 cadena de custodia (determinístico por caso)
      const withHash: Expedient[] = await Promise.all(
        cases.map(async c => ({
          ...c,
          morId: genMorId(c.case_code, c.created_at),
          hash:  await sha256(`${c.case_code}:${c.id}:EduSafe-Moriarty-v1`),
        })),
      )

      setExpedients(withHash)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-svh">
      {/* ── Cabecera ────────────────────────────────────────────────────────── */}
      <div className="bg-director px-5 pt-12 pb-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-[10px] font-bold tracking-widest text-white/50 uppercase">
              {t('director_moriarty.badge')}
            </p>
            <h1 className="font-display text-3xl font-bold text-white leading-tight mt-0.5">
              {t('director_moriarty.header')}
            </h1>
            <p className="text-sm text-white/55 mt-0.5 leading-snug">
              {t('director_moriarty.header_sub')}
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0 mt-1">
            <LockKeyhole className="w-5 h-5 text-amber-400" />
          </div>
        </div>
      </div>

      <div className="flex-1 bg-cream px-5 pt-5 pb-4 flex flex-col gap-5">

        {/* ── Info banner ────────────────────────────────────────────────────── */}
        <div className="bg-cream-lt border border-hairline rounded-2xl px-4 py-3.5 flex gap-3">
          <Shield className="w-4 h-4 text-muted flex-shrink-0 mt-0.5" />
          <p className="text-sm text-ink-soft leading-snug">
            {t('director_moriarty.info_1')}{' '}
            <span className="font-semibold text-ink">Moriarty Bullying</span> {t('director_moriarty.info_2')}
          </p>
        </div>

        {/* ── Expedientes ──────────────────────────────────────────────────────── */}
        <div>
          <p className="text-[11px] font-bold tracking-widest text-muted uppercase mb-3">
            {t('director_moriarty.active_title')}
          </p>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-director border-t-transparent rounded-full animate-spin" />
            </div>
          ) : expedients.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
              <p className="text-3xl mb-2">⚖️</p>
              <p className="text-sm font-medium text-ink">{t('director_moriarty.empty_title')}</p>
              <p className="text-xs text-muted mt-1">{t('director_moriarty.empty_desc')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {expedients.map(exp => (
                <div key={exp.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  {/* Título */}
                  <div className="flex items-start gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-director flex items-center justify-center flex-shrink-0">
                      <Folder className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-ink leading-snug">
                        EduSafe #{exp.case_code} → {exp.morId}
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        {t(CAT_LABEL[exp.category ?? ''] ?? 'director_moriarty.cat_otros')}
                        {' · '}
                        <span className={
                          exp.status === 'derivado' ? 'text-orange-500 font-medium' : ''
                        }>
                          {t(escaladoStatus(exp.status))}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Descripción */}
                  {exp.description && (
                    <p className="text-xs text-ink-soft leading-snug mb-3">
                      {exp.description.length > 180
                        ? exp.description.slice(0, 178) + '…'
                        : exp.description}
                    </p>
                  )}

                  {/* Hash SHA256 */}
                  <div className="bg-cream rounded-xl px-3 py-2">
                    <p className="font-mono text-[10px] text-muted truncate">
                      sha256: {exp.hash}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Protocolo de escalado ─────────────────────────────────────────── */}
        <div>
          <p className="text-[11px] font-bold tracking-widest text-muted uppercase mb-3">
            {t('director_moriarty.protocol_title')}
          </p>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {PROTOCOL.map((item, idx) => (
              <div
                key={item}
                className={`flex items-center gap-3 px-4 py-3.5 ${
                  idx > 0 ? 'border-t border-hairline' : ''
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                </div>
                <span className="text-sm line-through text-ink-soft/60 flex-1 leading-snug">
                  {t(item)}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
