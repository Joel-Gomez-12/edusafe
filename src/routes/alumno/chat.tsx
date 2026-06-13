import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router'
import { ArrowLeft, Send } from 'lucide-react'
import { callEdgeFunction } from '@/lib/edusafe/supabase'
import { toast } from 'sonner'

interface ChatMsg {
  id:         string
  sender_type: 'mediador' | 'alumno'
  content_encrypted: string
  created_at: string
}

interface ActiveChat {
  report_id:    string
  case_code:    string
  emojis:       string[]
  device_token: string
}

export default function AlumnoChat() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate   = useNavigate()
  const bottomRef  = useRef<HTMLDivElement>(null)

  const [messages,  setMessages]  = useState<ChatMsg[]>([])
  const [caseCode,  setCaseCode]  = useState('')
  const [input,     setInput]     = useState('')
  const [sending,   setSending]   = useState(false)
  const [loading,   setLoading]   = useState(true)
  const [creds,     setCreds]     = useState<ActiveChat | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('edusafe_active_chat')
    if (!stored) { navigate('/alumno/mis-casos'); return }
    const parsed: ActiveChat = JSON.parse(stored)
    // Verificar que coincide con el caseId de la URL
    if (parsed.report_id !== caseId) { navigate('/alumno/mis-casos'); return }
    setCreds(parsed)
    setCaseCode(parsed.case_code)
    loadMessages(parsed)
  }, [caseId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Polling cada 20s para nuevos mensajes del mediador
  useEffect(() => {
    if (!creds) return
    const interval = setInterval(() => loadMessages(creds), 20_000)
    return () => clearInterval(interval)
  }, [creds])

  async function loadMessages(auth: ActiveChat) {
    try {
      const res = await callEdgeFunction<{ report_id: string; case_code: string; messages: ChatMsg[] }>('chat-access', {
        body: {
          case_code:     auth.case_code,
          device_token:  auth.device_token,
          emoji_pattern: auth.emojis,
        },
      })
      setMessages(res.messages ?? [])
    } catch {
      toast.error('No se pudo cargar el chat.')
      navigate('/alumno/mis-casos')
    } finally {
      setLoading(false)
    }
  }

  async function sendMessage() {
    if (!input.trim() || sending || !creds) return
    const text = input.trim()
    setInput('')
    setSending(true)

    const tempMsg: ChatMsg = {
      id:                `temp-${Date.now()}`,
      sender_type:       'alumno',
      content_encrypted: text,
      created_at:        new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMsg])

    try {
      const res = await callEdgeFunction<{ messages: ChatMsg[] }>('chat-access', {
        body: {
          case_code:     creds.case_code,
          device_token:  creds.device_token,
          emoji_pattern: creds.emojis,
          send_content:  text,
        },
      })
      setMessages(res.messages ?? [])
    } catch {
      toast.error('Error al enviar el mensaje')
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id))
    } finally {
      setSending(false)
    }
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col h-svh bg-cream">

      {/* Header */}
      <div className="bg-alumno px-4 pt-10 pb-3 flex items-center gap-3">
        <button onClick={() => navigate('/alumno/mis-casos')} className="text-white/70 active:text-white transition-base">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <p className="text-[10px] text-white/60 font-semibold uppercase tracking-wider">Caso {caseCode}</p>
          <p className="text-white font-semibold text-sm">Chat con el mediador</p>
        </div>
        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
          <span className="text-sm">🛡️</span>
        </div>
      </div>

      {/* Aviso privacidad */}
      <div className="px-4 py-2.5 bg-sage-lt border-b border-hairline">
        <p className="text-xs text-sage-dk text-center">
          🔒 El mediador ve tu caso pero no sabe quién eres. Tu identidad está protegida.
        </p>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-alumno border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-ink/30">
            <p className="text-3xl mb-2">💬</p>
            <p className="text-sm">Aún no hay mensajes.<br />El mediador responderá en menos de 24h.</p>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.sender_type === 'alumno' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[78%]">
                <div className={`px-4 py-3 rounded-2xl text-sm leading-snug ${
                  msg.sender_type === 'alumno'
                    ? 'bg-alumno text-white rounded-br-sm'
                    : 'bg-white text-ink rounded-bl-sm shadow-sm'
                }`}>
                  {msg.sender_type === 'mediador' && (
                    <p className="text-[10px] font-semibold text-ink/40 mb-1 uppercase tracking-wider">Mediador</p>
                  )}
                  {msg.content_encrypted}
                </div>
                <p className={`text-[10px] text-ink/30 mt-1 ${msg.sender_type === 'alumno' ? 'text-right' : 'text-left'}`}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-white border-t border-hairline flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Escribe aquí..."
          className="flex-1 bg-transparent text-sm focus:outline-none text-ink placeholder:text-ink/30"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          className="w-9 h-9 bg-alumno text-white rounded-full flex items-center justify-center disabled:opacity-30 active:scale-95 transition-base"
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
