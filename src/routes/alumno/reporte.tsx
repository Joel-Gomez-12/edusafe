import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { X, Send, Paperclip, ArrowLeft, Search } from 'lucide-react'
import { callEdgeFunction } from '@/lib/edusafe/supabase'
import { resolveCentroSlug, getDeviceToken, prepareEvidenceImage } from '@/lib/edusafe/device'
import { toast } from 'sonner'

// ── Tipos ─────────────────────────────────────────────────────
type MessageRole = 'bot' | 'user'
// `value` es lo que se guarda (igual en cualquier idioma); `label`, lo que se muestra
interface Chip { value: string; label: string; icon?: string }
interface ChatMessage {
  id: string
  role: MessageRole
  text: string
  chips?: Chip[]
  multiChips?: Chip[]
  showSearch?: boolean
  showPhotos?: boolean
  showSubmit?: boolean
}

interface WizardState {
  step: number
  description: string
  category: string
  whoAffected: string
  zones: string[]
  perpetratorName: string
  perpetratorId: string | null
  photos: File[]
}

interface VerifyResult {
  status:     'auth' | 'possible_ai' | 'undetermined'
  confidence: number
  provider:   string
}

// ── Badge de verificación ──────────────────────────────────────
const VERIFY_CFG = {
  auth:         { label: 'reporte.authentic',    cls: 'bg-green-100 text-green-700',  icon: '✓' },
  possible_ai:  { label: 'reporte.possible_ai',  cls: 'bg-amber-100 text-amber-700',  icon: '⚠' },
  undetermined: { label: 'reporte.undetermined', cls: 'bg-gray-100 text-gray-500',    icon: '—' },
} as const

function VerifyBadge({ result }: { result: VerifyResult | 'loading' }) {
  const { t } = useTranslation()
  if (result === 'loading') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/80 text-xs text-ink/40">
        <span className="w-2.5 h-2.5 border border-ink/20 border-t-transparent rounded-full animate-spin" />
        {t('reporte.verify_badge')}
      </span>
    )
  }
  const cfg = VERIFY_CFG[result.status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      <span>{cfg.icon}</span>{t(cfg.label)}
    </span>
  )
}

// ── Script del chatbot (los textos son claves de traducción) ──
const BOT_SCRIPT: ChatMessage[] = [
  {
    id: 'greeting',
    role: 'bot',
    text: 'reporte.bot_greeting',
  },
  {
    id: 'what',
    role: 'bot',
    text: 'reporte.bot_what',
  },
]

// Opciones del asistente. El valor es el que se envía/guarda (reports.category y
// reports.zone), siempre el mismo; la etiqueta visible sale de las traducciones.
const CATEGORY_OPTIONS = ['verbal', 'fisico', 'exclusion', 'ciberacoso', 'sexual', 'otros'] as const
const WHO_OPTIONS = [
  { value: 'A mí',           labelKey: 'reporte.who_me' },
  { value: 'A otra persona', labelKey: 'reporte.who_other' },
]
const ZONE_OPTIONS = [
  { value: 'Online',   labelKey: 'reporte.zone_online',   icon: '🖥️' },
  { value: 'Aula',     labelKey: 'reporte.zone_aula',     icon: '🏫' },
  { value: 'Pasillos', labelKey: 'reporte.zone_pasillos', icon: '🚶' },
  { value: 'Baños',    labelKey: 'reporte.zone_bathroom', icon: '🚻' },
  { value: 'Patio',    labelKey: 'reporte.zone_patio',    icon: '🌳' },
]

function botId() { return `bot-${Math.random().toString(36).slice(2)}` }
function userMsg(text: string): ChatMessage { return { id: botId(), role: 'user', text } }

export default function AlumnoReporte() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const centroSlugFromUrl = resolveCentroSlug(searchParams)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const [messages, setMessages] = useState<ChatMessage[]>(() => BOT_SCRIPT.map(m => ({ ...m, text: t(m.text) })))
  const [inputText, setInputText] = useState('')
  const [state, setState] = useState<WizardState>({
    step: 1,           // 1=descripción, 2=quién/dónde, 3=agresor, 4=fotos
    description: '',
    category: '',
    whoAffected: '',
    zones: [],
    perpetratorName: '',
    perpetratorId: null,
    photos: [],
  })
  const [searchResults, setSearchResults] = useState<{ id: string; full_name: string; curso: string; grupo: string }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [textVerif, setTextVerif]   = useState<VerifyResult | 'loading' | null>(null)
  const [textMsgId, setTextMsgId]   = useState<string | null>(null)
  const [photoVerifs, setPhotoVerifs] = useState<(VerifyResult | 'loading' | null)[]>([])

  const addBotMessages = useCallback((msgs: Omit<ChatMessage, 'id'>[]) => {
    setMessages(prev => [
      ...prev,
      ...msgs.map(m => ({ ...m, id: botId() })),
    ])
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Manejo de respuesta del usuario ──────────────────────────
  function handleSend(text?: string) {
    const txt = (text ?? inputText).trim()
    if (!txt) return
    setInputText('')

    if (state.step === 1) {
      // Descripción libre
      setState(s => ({ ...s, description: txt, step: 2 }))
      const msg = userMsg(txt)
      setMessages(prev => [...prev, msg])
      setTextMsgId(msg.id)

      // Verificación anti-IA del relato (no bloquea el flujo)
      setTextVerif('loading')
      callEdgeFunction<VerifyResult>('verify-content', {
        body: { type: 'text', payload: txt },
      })
        .then(r  => setTextVerif(r))
        .catch(() => setTextVerif({ status: 'undetermined', confidence: 0, provider: 'error' }))

      setTimeout(() => {
        addBotMessages([
          { role: 'bot', text: t('reporte.bot_category'), chips: CATEGORY_OPTIONS.map(c => ({ value: c, label: t(`reporte.cat_${c}`) })) },
        ])
      }, 400)
    }
  }

  function handleChip(chip: Chip) {
    if (state.step === 2 && !state.category) {
      setState(s => ({ ...s, category: chip.value }))
      setMessages(prev => [...prev, userMsg(chip.label)])
      setTimeout(() => {
        addBotMessages([
          { role: 'bot', text: t('reporte.bot_who'), chips: WHO_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) })) },
        ])
      }, 400)
      return
    }
    if (state.step === 2 && !state.whoAffected) {
      setState(s => ({ ...s, whoAffected: chip.value }))
      setMessages(prev => [...prev, userMsg(chip.label)])
      setTimeout(() => {
        addBotMessages([
          { role: 'bot', text: t('reporte.bot_where'), multiChips: ZONE_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey), icon: o.icon })) },
        ])
      }, 400)
    }
  }

  function handleMultiChip(zone: string) {
    setState(s => ({
      ...s,
      zones: s.zones.includes(zone)
        ? s.zones.filter(z => z !== zone)
        : [...s.zones, zone],
    }))
  }

  function confirmZones() {
    if (state.zones.length === 0) return
    const zoneLabels = state.zones.map(z => t(ZONE_OPTIONS.find(o => o.value === z)?.labelKey ?? z))
    setMessages(prev => [...prev, userMsg(zoneLabels.join(', '))])
    setState(s => ({ ...s, step: 3 }))
    setTimeout(() => {
      addBotMessages([{
        role: 'bot',
        text: t('reporte.bot_perpetrator'),
        showSearch: true,
      }])
    }, 400)
  }

  async function handleSearch(query: string) {
    if (query.length < 2) { setSearchResults([]); return }
    const centroSlug = centroSlugFromUrl
    try {
      const res = await callEdgeFunction<{ students: typeof searchResults }>('students-search', {
        method: 'POST',
        body: { centro_slug: centroSlug, query },
      })
      setSearchResults(res.students ?? [])
    } catch {
      setSearchResults([])
    }
  }

  function selectPerpetrator(s: { id: string; full_name: string; curso: string; grupo: string }) {
    setState(prev => ({ ...prev, perpetratorName: s.full_name, perpetratorId: s.id }))
    setSearchResults([])
    if (searchRef.current) searchRef.current.value = s.full_name
  }

  function skipPerpetrator() {
    setMessages(prev => [...prev, userMsg(t('reporte.skip'))])
    setState(s => ({ ...s, step: 4 }))
    goToPhotos()
  }

  function confirmPerpetrator() {
    const name = state.perpetratorName || t('reporte.not_indicated')
    setMessages(prev => [...prev, userMsg(name)])
    setState(s => ({ ...s, step: 4 }))
    goToPhotos()
  }

  function goToPhotos() {
    setTimeout(() => {
      addBotMessages([{
        role: 'bot',
        text: t('reporte.bot_photos'),
        showPhotos: true,
        showSubmit: true,
      }])
    }, 400)
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 4)
    photoUrls.forEach(url => URL.revokeObjectURL(url))
    const urls = files.map(f => URL.createObjectURL(f))
    setState(s => ({ ...s, photos: files }))
    setPhotoUrls(urls)

    // Verificación anti-IA por imagen (no bloquea el flujo)
    setPhotoVerifs(files.map(() => 'loading'))
    files.forEach((file, i) => {
      fileToBase64(file)
        .then(b64 => callEdgeFunction<VerifyResult>('verify-content', {
          body: { type: 'image', payload: b64 },
        }))
        .then(r  => setPhotoVerifs(prev => { const n = [...prev]; n[i] = r;                                           return n }))
        .catch(() => setPhotoVerifs(prev => { const n = [...prev]; n[i] = { status: 'undetermined', confidence: 0, provider: 'error' }; return n }))
    })
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // ── Enviar reporte ────────────────────────────────────────────
  async function submitReport() {
    if (!state.description) { toast.error(t('reporte.error_describe')); return }
    setSubmitting(true)
    try {
      const deviceToken = getDeviceToken()

      const centroSlug = centroSlugFromUrl
      const res = await callEdgeFunction<{ case_code: string }>('reports-create', {
        centroSlug,
        body: {
          device_token: deviceToken,
          description: state.description,
          who_affected: state.whoAffected,
          zones: state.zones,
          perpetrator_student_id: state.perpetratorId,
          category: state.category || inferCategory(state.description),
          text_verification: textVerif && textVerif !== 'loading' ? textVerif : undefined,
        },
      })
      // Subir las capturas ya con el caso creado (no bloquea si alguna falla)
      if (state.photos.length > 0) {
        const failed = await uploadEvidence(res.case_code, deviceToken)
        if (failed > 0) {
          toast.warning(t('reporte.evidence_failed', { count: failed }))
        }
      }
      // Limpiar el input de archivos antes de navegar (evita conflicto con extensiones)
      if (fileRef.current) fileRef.current.value = ''
      // Pequeño delay para que React limpie el estado antes de navegar
      setTimeout(() => navigate(`/alumno/llave?caso=${res.case_code}`, { replace: true }), 50)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('reporte.error_send'))
    } finally {
      setSubmitting(false)
    }
  }

  // Sube cada captura al bucket privado vía edge function. Devuelve cuántas fallaron.
  async function uploadEvidence(caseCode: string, deviceToken: string): Promise<number> {
    const results = await Promise.allSettled(state.photos.map(async (file, i) => {
      // Recodificar quita los metadatos EXIF; si el formato no se puede leer, se sube tal cual
      const blob = await prepareEvidenceImage(file).catch(() => file)
      const form = new FormData()
      form.append('case_code', caseCode)
      form.append('device_token', deviceToken)
      form.append('file', blob, `captura-${i + 1}.jpg`)
      const verif = photoVerifs[i]
      if (verif && verif !== 'loading') form.append('verification', JSON.stringify(verif))
      await callEdgeFunction('evidence-upload', { formData: form })
    }))
    return results.filter(r => r.status === 'rejected').length
  }

  function inferCategory(desc: string): string {
    const d = desc.toLowerCase()
    if (d.includes('instagram') || d.includes('whatsapp') || d.includes('tiktok') || d.includes('online')) return 'ciberacoso'
    if (d.includes('golpe') || d.includes('pega') || d.includes('empuja') || d.includes('físico')) return 'fisico'
    if (d.includes('excluye') || d.includes('dejan fuera') || d.includes('grupo')) return 'exclusion'
    if (d.includes('insulta') || d.includes('burla') || d.includes('dice') || d.includes('mensaje')) return 'verbal'
    return 'otros'
  }

  // ── UI: Chat wizard ───────────────────────────────────────────
  const lastMsg = messages[messages.length - 1]

  return (
    <div className="flex flex-col h-svh bg-cream">

      {/* Header */}
      <div className="bg-alumno px-4 pt-10 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-white/70 active:text-white transition-base">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <p className="text-[10px] text-white/60 font-semibold uppercase tracking-wider">{t('reporte.step_of', { n: Math.min(state.step, 4) })}</p>
          <p className="text-white font-display font-bold text-base leading-tight">{t('reporte.header_title')}</p>
        </div>
        <button onClick={() => navigate('/alumno')} className="text-white/70 active:text-white transition-base">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.map((msg, idx) => (
          <div key={msg.id}>
            {/* Burbuja */}
            <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-snug whitespace-pre-line ${
                  msg.role === 'user'
                    ? 'bg-sage text-white rounded-br-sm'
                    : 'bg-white text-ink rounded-bl-sm shadow-sm'
                }`}
              >
                {msg.text}
              </div>
            </div>

            {/* Badge de verificación del relato */}
            {msg.id === textMsgId && textVerif && (
              <div className="flex justify-end mt-1">
                <VerifyBadge result={textVerif} />
              </div>
            )}

            {/* Chips de selección única (último bot message) */}
            {msg.chips && idx === messages.length - 1 && (
              <div className="flex flex-wrap gap-2 mt-2 ml-1">
                {msg.chips.map(chip => (
                  <button
                    key={chip.value}
                    onClick={() => handleChip(chip)}
                    className="px-4 py-2 rounded-full border border-alumno text-alumno text-sm font-medium bg-white active:bg-alumno-lt transition-base"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            {/* Chips multi-selección + confirmar */}
            {msg.multiChips && idx === messages.length - 1 && (
              <div className="mt-2 ml-1">
                <div className="flex flex-wrap gap-2 mb-3">
                  {msg.multiChips.map(chip => {
                    return (
                      <button
                        key={chip.value}
                        onClick={() => handleMultiChip(chip.value)}
                        className={`px-3 py-2 rounded-full text-sm font-medium border transition-base active:scale-95 flex items-center gap-1 ${
                          state.zones.includes(chip.value)
                            ? 'bg-alumno text-white border-alumno'
                            : 'bg-white text-ink border-hairline'
                        }`}
                      >
                        <span>{chip.icon}</span> {chip.label}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={confirmZones}
                  disabled={state.zones.length === 0}
                  className="px-5 py-2 bg-alumno text-white rounded-full text-sm font-semibold disabled:opacity-40 active:scale-95 transition-base"
                >
                  {t('reporte.confirm')}
                </button>
              </div>
            )}

            {/* Campo búsqueda de agresor */}
            {msg.showSearch && idx === messages.length - 1 && (
              <div className="mt-2 ml-1">
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/30" />
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder={t('reporte.search_placeholder')}
                    onChange={e => handleSearch(e.target.value)}
                    onInput={e => handleSearch((e.target as HTMLInputElement).value)}
                    className="w-full pl-9 pr-4 py-3 bg-white border border-hairline rounded-2xl text-sm focus:outline-none focus:border-alumno"
                  />
                </div>
                {searchResults.length > 0 && (
                  <div className="bg-white rounded-2xl border border-hairline overflow-hidden mb-2">
                    {searchResults.map(s => (
                      <button
                        key={s.id}
                        onClick={() => selectPerpetrator(s)}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-alumno-lt flex justify-between items-center border-b border-hairline last:border-0"
                      >
                        <span className="font-medium text-ink">{s.full_name}</span>
                        <span className="text-ink/40 text-xs">{s.curso} {s.grupo}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={skipPerpetrator}
                    className="flex-1 py-2 rounded-full border border-hairline text-sm text-ink/60"
                  >
                    {t('reporte.skip_short')}
                  </button>
                  <button
                    onClick={confirmPerpetrator}
                    className="flex-1 py-2 rounded-full bg-alumno text-white text-sm font-semibold active:scale-95 transition-base"
                  >
                    {t('reporte.continue')}
                  </button>
                </div>
              </div>
            )}

            {/* Fotos y botón enviar */}
            {msg.showPhotos && idx === messages.length - 1 && (
              <div className="mt-2 ml-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFiles}
                />
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[0, 1, 2].map(i => (
                    <button
                      key={i}
                      onClick={() => fileRef.current?.click()}
                      className="aspect-square bg-white border-2 border-dashed border-hairline rounded-2xl flex flex-col items-center justify-center text-ink/30 active:border-alumno transition-base overflow-hidden relative"
                    >
                      {photoUrls[i] ? (
                        <>
                          <img
                            src={photoUrls[i]}
                            className="w-full h-full object-cover rounded-2xl"
                            alt=""
                          />
                          {photoVerifs[i] && (
                            <div className="absolute bottom-1 left-0 right-0 flex justify-center px-1">
                              <VerifyBadge result={photoVerifs[i]} />
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-2xl mb-1">📷</span>
                          <span className="text-xs">{t('reporte.capture_n', { n: i + 1 })}</span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
                <button
                  onClick={submitReport}
                  disabled={submitting}
                  className="w-full py-4 bg-alumno-dk text-white font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-base disabled:opacity-60"
                >
                  {submitting ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>{t('reporte.send_report_btn')}</>
                  )}
                </button>
                <button
                  onClick={() => navigate(-1)}
                  className="w-full py-3 text-sm text-ink/40 mt-1"
                >
                  {t('reporte.back')}
                </button>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar — solo activo en step 1 */}
      <div className="px-4 py-3 bg-white border-t border-hairline flex items-center gap-2">
        <button className="p-2 text-ink/30">
          <Paperclip className="w-5 h-5" />
        </button>
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={state.step === 1 ? t('chat.placeholder') : ''}
          disabled={state.step !== 1}
          className="flex-1 bg-transparent text-sm focus:outline-none text-ink placeholder:text-ink/30 disabled:cursor-default"
        />
        <button
          onClick={() => handleSend()}
          disabled={state.step !== 1 || !inputText.trim()}
          className="w-9 h-9 bg-alumno text-white rounded-full flex items-center justify-center disabled:opacity-30 active:scale-95 transition-base"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
