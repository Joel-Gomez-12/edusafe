import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router'
import { ArrowLeft, Send, Lock } from 'lucide-react'
import { supabase } from '@/lib/edusafe/supabase'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

// ─── Types ────────────────────────────────────────────────────────────────────

type SenderType   = 'alumno' | 'mediador' | 'sistema'
type ReportStatus = 'nuevo' | 'asignado' | 'en_investigacion' | 'resuelto' | 'derivado' | 'archivado'

interface Message {
  id:          string
  sender_type: SenderType
  content:     string
  created_at:  string
}

interface ReportInfo {
  id:                string
  case_code:         string
  category:          string | null
  severity_level:    string | null
  status:            ReportStatus
  assigned_mediator: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CAT_LABEL: Record<string, string> = {
  ciberacoso: 'Ciberacoso', exclusion: 'Exclusión', fisico: 'Físico',
  verbal: 'Verbal', sexual: 'Sexual', otros: 'Otros',
}

const STATUS_PILL: Record<ReportStatus, { label: string; cls: string }> = {
  nuevo:            { label: 'Abierto',           cls: 'bg-white/20 text-white'        },
  asignado:         { label: 'Asignado',           cls: 'bg-white/20 text-white'        },
  en_investigacion: { label: 'Activo',             cls: 'bg-sage/70 text-white'         },
  resuelto:         { label: 'Resuelto',           cls: 'bg-green-500/40 text-white'    },
  derivado:         { label: 'Derivado',           cls: 'bg-orange-400/40 text-white'   },
  archivado:        { label: 'Archivado',          cls: 'bg-white/10 text-white/50'     },
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MediadorChat() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate   = useNavigate()
  const { user }   = useAuth()
  const { t }      = useTranslation()
  const bottomRef  = useRef<HTMLDivElement>(null)

  const [report,      setReport]      = useState<ReportInfo | null>(null)
  const [messages,    setMessages]    = useState<Message[]>([])
  const [mediatorId,  setMediatorId]  = useState<string | null>(null)
  const [input,       setInput]       = useState('')
  const [sending,     setSending]     = useState(false)
  const [claiming,    setClaiming]    = useState(false)
  const [loading,     setLoading]     = useState(true)

  const isAssigned = !!(report && mediatorId && report.assigned_mediator === mediatorId)
  const isClosed   = report?.status === 'resuelto' || report?.status === 'archivado'

  // ── Carga inicial ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (caseId) loadData()
  }, [caseId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Suscripción realtime + polling de respaldo ────────────────────────────

  useEffect(() => {
    if (!caseId) return
    const channel = supabase
      .channel(`mediador-chat:${caseId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `report_id=eq.${caseId}` },
        (payload) => {
          const m = payload.new as { id: string; sender_type: SenderType; content_encrypted: string; created_at: string }
          setMessages(prev => {
            if (prev.some(x => x.id === m.id)) return prev
            return [...prev, { id: m.id, sender_type: m.sender_type, content: m.content_encrypted, created_at: m.created_at }]
          })
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [caseId])

  // Polling cada 10s como red de seguridad para mensajes del alumno
  useEffect(() => {
    if (!caseId) return
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, sender_type, content_encrypted, created_at')
        .eq('report_id', caseId)
        .order('created_at', { ascending: true })
      if (!data) return
      const fresh = data.map(m => ({
        id:          m.id,
        sender_type: m.sender_type as SenderType,
        content:     m.content_encrypted,
        created_at:  m.created_at,
      }))
      setMessages(prev => {
        if (prev.length === fresh.length && prev.every((m, i) => m.id === fresh[i].id)) return prev
        return fresh
      })
    }, 10_000)
    return () => clearInterval(interval)
  }, [caseId])

  // ── loadData ───────────────────────────────────────────────────────────────

  async function loadData() {
    setLoading(true)
    try {
      // Staff_id del mediador autenticado
      const { data: med } = await supabase
        .from('mediators')
        .select('id')
        .eq('user_id', user?.id ?? '')
        .single()
      if (med) setMediatorId(med.id)

      // Datos del caso
      const { data: r } = await supabase
        .from('reports')
        .select('id, case_code, category, severity_level, status, assigned_mediator')
        .eq('id', caseId!)
        .single()
      if (!r) { toast.error('Caso no encontrado'); navigate('/mediador'); return }
      setReport(r as ReportInfo)

      // Mensajes — solo si ya está asignado al mediador actual
      if (med && r.assigned_mediator === med.id) {
        await fetchMessages()
      }
    } finally {
      setLoading(false)
    }
  }

  async function fetchMessages() {
    const { data } = await supabase
      .from('messages')
      .select('id, sender_type, content_encrypted, created_at')
      .eq('report_id', caseId!)
      .order('created_at', { ascending: true })

    setMessages(
      (data ?? []).map(m => ({
        id:          m.id,
        sender_type: m.sender_type as SenderType,
        content:     m.content_encrypted,
        created_at:  m.created_at,
      }))
    )
  }

  // ── Tomar caso ─────────────────────────────────────────────────────────────

  async function claimCase() {
    if (!mediatorId || !report) return
    setClaiming(true)
    try {
      const { error } = await supabase
        .from('reports')
        .update({ assigned_mediator: mediatorId, status: 'asignado' })
        .eq('id', report.id)
      if (error) throw error
      setReport(r => r ? { ...r, assigned_mediator: mediatorId, status: 'asignado' } : r)
      await fetchMessages()
      toast.success('Caso asignado. Ahora puedes chatear.')
    } catch {
      toast.error(t('mediador_chat.error_claim'))
    } finally {
      setClaiming(false)
    }
  }

  // ── Enviar mensaje ─────────────────────────────────────────────────────────

  async function sendMessage() {
    const text = input.trim()
    if (!text || sending || !isAssigned || isClosed || !mediatorId) return
    setInput('')
    setSending(true)

    // Optimista
    const tempId  = `temp-${Date.now()}`
    const tempMsg: Message = { id: tempId, sender_type: 'mediador', content: text, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, tempMsg])

    try {
      const { error } = await supabase.from('messages').insert({
        report_id:         caseId!,
        sender_type:       'mediador',
        sender_id:         mediatorId,
        content_encrypted: text,
      })
      if (error) throw error

      // Primer mensaje del mediador → pasar a "en_investigacion"
      if (report?.status === 'asignado' || report?.status === 'nuevo') {
        await supabase.from('reports').update({ status: 'en_investigacion' }).eq('id', caseId!)
        setReport(r => r ? { ...r, status: 'en_investigacion' } : r)
      }

      // Recargar desde DB — reemplaza el mensaje temporal con el real
      await fetchMessages()
    } catch {
      toast.error(t('mediador_chat.error_send'))
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setInput(text)
    } finally {
      setSending(false)
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading || !report) {
    return (
      <div className="flex items-center justify-center min-h-svh bg-cream">
        <div className="w-6 h-6 border-2 border-mediador border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const pill = STATUS_PILL[report.status]

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-svh bg-cream">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-mediador px-4 pt-10 pb-4 flex items-start gap-3">
        <button
          onClick={() => navigate(`/mediador/casos/${caseId}`)}
          className="mt-0.5 text-white/70 active:text-white transition-base flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-white/50 font-bold tracking-widest uppercase">
            #{report.case_code} · {CAT_LABEL[report.category ?? ''] ?? 'Caso'}
          </p>
          <p className="text-white font-semibold text-sm leading-tight mt-0.5">{t('mediador_chat.anonymous_chat')}</p>
          <p className="text-white/55 text-xs mt-0.5">{t('mediador_chat.anonymous_student')}</p>
        </div>
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 mt-1 ${pill.cls}`}>
          {pill.label}
        </span>
      </div>

      {/* ── Banner: caso no asignado ───────────────────────────────────────── */}
      {!isAssigned && !isClosed && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-amber-700 flex-1 leading-snug">
            {t('mediador_chat.unassigned_notice')}
          </p>
          <button
            onClick={claimCase}
            disabled={claiming}
            className="px-3.5 py-1.5 bg-amber-500 text-white text-sm font-semibold rounded-xl flex-shrink-0 disabled:opacity-50 active:scale-95 transition-base"
          >
            {claiming ? '...' : t('mediador_chat.claim_case')}
          </button>
        </div>
      )}

      {/* ── Banner: caso cerrado ───────────────────────────────────────────── */}
      {isClosed && (
        <div className="bg-cream border-b border-hairline px-4 py-2.5 flex items-center gap-2">
          <span className="text-xs text-muted">{t('mediador_chat.closed_notice')}</span>
        </div>
      )}

      {/* ── Barra de privacidad ────────────────────────────────────────────── */}
      {isAssigned && !isClosed && (
        <div className="px-4 py-2.5 bg-mediador/5 border-b border-hairline flex items-center gap-2">
          <Lock className="w-3 h-3 text-mediador flex-shrink-0" />
          <p className="text-xs text-mediador font-medium">
            {t('mediador_chat.privacy_notice')}
          </p>
        </div>
      )}

      {/* ── Mensajes ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {!isAssigned ? (
          <div className="text-center py-16">
            <p className="text-3xl mb-3">🔒</p>
            <p className="text-sm font-medium text-ink">{t('mediador_chat.locked_title')}</p>
            <p className="text-xs text-muted mt-1">{t('mediador_chat.locked_desc')}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16 text-ink/30">
            <p className="text-3xl mb-3">💬</p>
            <p className="text-sm leading-snug">
              {t('mediador_chat.empty_chat')}
            </p>
          </div>
        ) : (
          messages.map(msg => {
            // ── Sistema ──
            if (msg.sender_type === 'sistema') {
              return (
                <div key={msg.id} className="flex justify-center">
                  <span className="text-xs text-muted px-3 py-1 bg-white rounded-full shadow-sm">
                    {msg.content}
                  </span>
                </div>
              )
            }

            // ── Alumno / Mediador ──
            const isMe = msg.sender_type === 'mediador'
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[78%]">
                  <div
                    className={`px-4 py-3 rounded-2xl text-sm leading-snug ${
                      isMe
                        ? 'bg-mediador text-white rounded-br-sm'
                        : 'bg-white text-ink rounded-bl-sm shadow-sm'
                    }`}
                  >
                    {!isMe && (
                      <p className="text-[10px] font-semibold text-ink/40 mb-1 uppercase tracking-wider">
                        Alumno/a
                      </p>
                    )}
                    <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                  </div>
                  <p className={`text-[10px] text-ink/30 mt-1 ${isMe ? 'text-right' : 'text-left'}`}>
                    {fmtTime(msg.created_at)}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <div className={`px-4 py-3 bg-white border-t border-hairline flex items-center gap-2 transition-opacity ${
        (!isAssigned || isClosed) ? 'opacity-50 pointer-events-none' : ''
      }`}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder={
            isClosed       ? t('mediador_chat.closed_placeholder')      :
            !isAssigned    ? t('mediador_chat.unassigned_placeholder')   :
            t('mediador_chat.placeholder')
          }
          disabled={!isAssigned || isClosed}
          className="flex-1 bg-transparent text-sm focus:outline-none text-ink placeholder:text-ink/30 disabled:cursor-default"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending || !isAssigned || isClosed}
          className="w-9 h-9 bg-mediador text-white rounded-full flex items-center justify-center disabled:opacity-30 active:scale-95 transition-base"
        >
          {sending
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Send className="w-4 h-4" />
          }
        </button>
      </div>
    </div>
  )
}
