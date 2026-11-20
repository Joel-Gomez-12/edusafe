import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import { callEdgeFunction } from '@/lib/edusafe/supabase'
import { getDeviceToken } from '@/lib/edusafe/device'

const EMOJIS = ['☀️','🌈','🎈','🎮','⚽','🐶','🐱','🦊','🐼','🦁','🍕','🍦','🌸','🌻','🚀','🎵','📚','⚡','🍌','✨']

interface StoredCase {
  case_code: string
  device_token: string
  emojis: string[]
  created_at: string
  status: string
  severity: string
}

// Estado del caso → claves de traducción (etiqueta de la insignia y texto bajo la tarjeta)
function statusLabel(status: string): { labelKey: string | null; subKey: string; cls: string } {
  const map: Record<string, { labelKey: string; subKey: string; cls: string }> = {
    nuevo:           { labelKey: 'mis_casos.status_new',      subKey: 'mis_casos.sub_new',    cls: 'bg-gray-100 text-gray-500' },
    asignado:        { labelKey: 'mis_casos.status_review',   subKey: 'mis_casos.sub_review', cls: 'bg-orange-100 text-orange-600' },
    en_investigacion:{ labelKey: 'mis_casos.status_review',   subKey: 'mis_casos.sub_review', cls: 'bg-orange-100 text-orange-600' },
    resuelto:        { labelKey: 'mis_casos.status_closed',   subKey: 'mis_casos.sub_closed', cls: 'bg-green-100 text-green-600' },
    derivado:        { labelKey: 'mis_casos.status_referred', subKey: 'mis_casos.sub_new',    cls: 'bg-blue-100 text-blue-600' },
    archivado:       { labelKey: 'mis_casos.status_archived', subKey: 'mis_casos.sub_new',    cls: 'bg-gray-100 text-gray-400' },
  }
  return map[status] ?? { labelKey: null, subKey: 'mis_casos.sub_new', cls: 'bg-gray-100 text-gray-500' }
}


function timeAgo(isoDate: string): string {
  const diff = (Date.now() - new Date(isoDate).getTime()) / 1000
  if (diff < 3600)   return i18n.t('mis_casos.time_moment')
  if (diff < 86400)  return i18n.t('mis_casos.time_hours', { count: Math.floor(diff / 3600) })
  if (diff < 604800) return i18n.t('mis_casos.time_days',  { count: Math.floor(diff / 86400) })
  return i18n.t('mis_casos.time_weeks', { count: Math.floor(diff / 604800) })
}

export default function AlumnoMisCasos() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [cases, setCases] = useState<StoredCase[]>([])
  const [emojiKey, setEmojiKey] = useState<string[]>([])
  const [activeCaseCode, setActiveCaseCode] = useState<string>('')
  const [accessing, setAccessing] = useState(false)

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('edusafe_cases') ?? '[]') as StoredCase[]
    setCases(stored)
    if (stored.length > 0) setActiveCaseCode(stored[0].case_code)
  }, [])

  function toggleEmoji(emoji: string) {
    setEmojiKey(prev =>
      prev.includes(emoji)
        ? prev.filter(e => e !== emoji)
        : prev.length < 3 ? [...prev, emoji] : prev
    )
  }

  async function openCase() {
    if (emojiKey.length !== 3) { toast.error(t('mis_casos.select_3')); return }
    if (!activeCaseCode) { toast.error(t('mis_casos.select_first')); return }
    setAccessing(true)
    try {
      // Cada caso guarda el token con el que se creó (casos antiguos pueden tener uno distinto)
      const deviceToken = cases.find(c => c.case_code === activeCaseCode)?.device_token || getDeviceToken()
      const res = await callEdgeFunction<{ report_id: string; case_code: string }>('chat-access', {
        body: {
          case_code: activeCaseCode,
          device_token: deviceToken,
          emoji_pattern: emojiKey,
        },
      })
      // Guardar credenciales para que AlumnoChat pueda verificar y enviar mensajes
      localStorage.setItem('edusafe_active_chat', JSON.stringify({
        report_id:    res.report_id,
        case_code:    res.case_code,
        emojis:       emojiKey,
        device_token: deviceToken,
      }))
      navigate(`/alumno/chat/${res.report_id}`)
    } catch (err) {
      // 429: el caso está bloqueado temporalmente por demasiadas llaves incorrectas
      const locked = (err as { status?: number }).status === 429
      toast.error(t(locked ? 'mis_casos.locked' : 'mis_casos.wrong_key'))
    } finally {
      setAccessing(false)
    }
  }

  return (
    <div className="flex flex-col min-h-svh bg-cream">

      {/* Header */}
      <div className="bg-alumno px-5 pt-12 pb-5 rounded-b-3xl">
        <p className="text-[10px] font-semibold tracking-widest text-white/60 uppercase mb-1">
          {t('mis_casos.badge')}
        </p>
        <h1 className="font-display text-2xl font-bold text-white">{t('mis_casos.title')}</h1>
        <p className="text-sm text-white/60 mt-0.5">{t('mis_casos.subtitle')}</p>
      </div>

      <div className="px-5 pt-5 flex-1 flex flex-col gap-5">

        {/* Lista de casos */}
        {cases.length > 0 && (
          <div className="flex flex-col gap-3">
            {cases.map(c => {
              const { labelKey, subKey, cls } = statusLabel(c.status)
              return (
                <button
                  key={c.case_code}
                  onClick={() => {
                    setActiveCaseCode(c.case_code)
                    setEmojiKey(c.emojis)
                  }}
                  className="bg-white rounded-2xl p-4 text-left shadow-sm active:scale-[0.98] transition-base"
                >
                  <div className="flex items-start justify-between mb-1">
                    <p className="font-bold text-alumno text-base">{c.case_code}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>
                      ● {labelKey ? t(labelKey) : c.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mb-1">
                    {c.emojis.map((e, i) => <span key={i} className="text-base">{e}</span>)}
                  </div>
                  <p className="text-xs text-ink/40">
                    {t(subKey)} · {timeAgo(c.created_at)}
                  </p>
                </button>
              )
            })}
          </div>
        )}

        {/* Sección acceso con código */}
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-ink/40 uppercase mb-3">
            {t('mis_casos.section_access')}
          </p>

          <div className="bg-white rounded-3xl p-5 shadow-sm">
            <h3 className="font-display font-bold text-ink text-lg mb-1">{t('mis_casos.intro_title')}</h3>
            <p className="text-sm text-ink/60 mb-4 leading-snug">
              {t('mis_casos.intro_subtitle')}
            </p>

            {/* Slots seleccionados */}
            <div className="flex gap-3 justify-center mb-4">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl border-2 relative ${
                    emojiKey[i] ? 'bg-alumno-lt border-alumno' : 'bg-cream border-hairline'
                  }`}
                >
                  {emojiKey[i] ? (
                    <span>{emojiKey[i]}</span>
                  ) : (
                    <span className="text-xs text-ink/30 font-bold w-5 h-5 bg-alumno text-white rounded-full flex items-center justify-center">{i + 1}</span>
                  )}
                </div>
              ))}
            </div>

            <hr className="border-dashed border-hairline mb-4" />

            {/* Grid emojis */}
            <div className="grid grid-cols-5 gap-2 mb-4">
              {EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => toggleEmoji(emoji)}
                  className={`aspect-square rounded-2xl flex items-center justify-center text-xl transition-base active:scale-90 ${
                    emojiKey.includes(emoji)
                      ? 'bg-alumno-lt border-2 border-alumno'
                      : 'bg-cream border-2 border-transparent'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setEmojiKey([])}
                className="flex-1 py-3 rounded-2xl border border-hairline text-ink text-sm font-medium active:scale-95 transition-base"
              >
                {t('mis_casos.reset')}
              </button>
              <button
                onClick={openCase}
                disabled={emojiKey.length !== 3 || accessing}
                className="flex-[2] py-3 rounded-2xl bg-alumno text-white font-semibold text-sm disabled:opacity-40 active:scale-[0.98] transition-base flex items-center justify-center gap-2"
              >
                {accessing
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : t('mis_casos.open_case')
                }
              </button>
            </div>
          </div>
        </div>

        {cases.length === 0 && (
          <div className="text-center py-8 text-ink/30">
            <p className="text-3xl mb-2">📂</p>
            <p className="text-sm">{t('mis_casos.empty')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
