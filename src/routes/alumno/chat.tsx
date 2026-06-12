import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router'
import { ArrowLeft, Send } from 'lucide-react'
import { callEdgeFunction } from '@/lib/edusafe/supabase'
import { toast } from 'sonner'

interface ChatMsg {
  id: string
  sender: 'mediador' | 'alumno'
  content: string
  created_at: string
}

export default function AlumnoChat() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const bottomRef = useRef<HTMLDivElement>(null)

  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [caseCode, setCaseCode] = useState('')

  useEffect(() => {
    loadMessages()
  }, [caseId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadMessages() {
    try {
      const sessionToken = localStorage.getItem('edusafe_chat_token') ?? ''
      const res = await callEdgeFunction<{ case_code: string; messages: ChatMsg[] }>('chat-access', {
        method: 'GET',
        sessionToken,
        headers: { 'X-Case-Id': caseId ?? '' },
      })
      setCaseCode(res.case_code)
      setMessages(res.messages ?? [])
    } catch {
      toast.error('No se pudo cargar el chat. Verifica tu llave.')
      navigate('/alumno/mis-casos')
    }
  }

  async function sendMessage() {
    if (!input.trim() || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)

    // Optimistic update
    const tempMsg: ChatMsg = {
      id: `temp-${Date.now()}`,
      sender: 'alumno',
      content: text,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMsg])

    try {
      const sessionToken = localStorage.getItem('edusafe_chat_token') ?? ''
      await callEdgeFunction('chat-message', {
        sessionToken,
        body: { case_id: caseId, content: text },
      })
      await loadMessages()
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

      {/* Sistema message */}
      <div className="px-4 py-3 bg-sage-lt border-b border-hairline">
        <p className="text-xs text-sage-dk text-center">
          🔒 El mediador ve tu caso pero no sabe quién eres. Tu identidad está protegida.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="text-center py-12 text-ink/30">
            <p className="text-3xl mb-2">💬</p>
            <p className="text-sm">Aún no hay mensajes.<br />El mediador responderá en menos de 24h.</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === 'alumno' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[78%]">
              <div
                className={`px-4 py-3 rounded-2xl text-sm leading-snug ${
                  msg.sender === 'alumno'
                    ? 'bg-alumno text-white rounded-br-sm'
                    : 'bg-white text-ink rounded-bl-sm shadow-sm'
                }`}
              >
                {msg.sender === 'mediador' && (
                  <p className="text-[10px] font-semibold text-ink/40 mb-1 uppercase tracking-wider">Mediador</p>
                )}
                {msg.content}
              </div>
              <p className={`text-[10px] text-ink/30 mt-1 ${msg.sender === 'alumno' ? 'text-right' : 'text-left'}`}>
                {formatTime(msg.created_at)}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-white border-t border-hairline flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Escribe aquí..."
          className="flex-1 bg-transparent text-sm focus:outline-none text-ink placeholder:text-ink/30"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          className="w-9 h-9 bg-alumno text-white rounded-full flex items-center justify-center disabled:opacity-30 active:scale-95 transition-base"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
