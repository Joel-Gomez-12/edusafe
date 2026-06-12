import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { callEdgeFunction } from '@/lib/edusafe/supabase'

const EMOJIS = ['☀️','🌈','🎈','🎮','⚽','🐶','🐱','🦊','🐼','🦁','🍕','🍦','🌸','🌻','🚀','🎵','📚','⚡','🍌','✨']

export default function AlumnoLlave() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const caseCode = searchParams.get('caso') ?? ''

  const [emojiKey, setEmojiKey] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  function toggleEmoji(emoji: string) {
    setEmojiKey(prev =>
      prev.includes(emoji)
        ? prev.filter(e => e !== emoji)
        : prev.length < 3 ? [...prev, emoji] : prev
    )
  }

  async function saveLlave() {
    if (emojiKey.length !== 3) { toast.error('Elige exactamente 3 emojis'); return }
    setSaving(true)
    try {
      const deviceToken = localStorage.getItem('edusafe_device_token') ?? ''

      // Guardar hash en Supabase
      await callEdgeFunction('reports-set-emoji', {
        body: { case_code: caseCode, device_token: deviceToken, emoji_pattern: emojiKey },
      })

      // Guardar caso en localStorage
      const cases = JSON.parse(localStorage.getItem('edusafe_cases') ?? '[]')
      const exists = cases.find((c: { case_code: string }) => c.case_code === caseCode)
      if (!exists) {
        cases.push({
          case_code: caseCode,
          device_token: deviceToken,
          emojis: emojiKey,
          created_at: new Date().toISOString(),
          status: 'nuevo',
          severity: 'media',
        })
        localStorage.setItem('edusafe_cases', JSON.stringify(cases))
      }

      navigate('/alumno/mis-casos')
    } catch {
      toast.error('Error al guardar la llave. Anota el código del caso y tus emojis.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col min-h-svh bg-cream px-5 pt-10">

      {/* Header */}
      <div className="bg-alumno rounded-2xl p-5 text-white mb-6">
        <p className="text-xs font-semibold tracking-wider uppercase mb-1 text-white/60">
          Caso {caseCode} creado ✓
        </p>
        <h2 className="font-display text-xl font-bold mb-1">Crea tu llave secreta</h2>
        <p className="text-sm text-white/75 leading-snug">
          Elige 3 emojis en orden. Solo con esta llave podrás acceder a tu caso.
        </p>
      </div>

      {/* Slots seleccionados */}
      <div className="flex gap-3 justify-center mb-5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl border-2 transition-base ${
              emojiKey[i] ? 'bg-alumno-lt border-alumno' : 'bg-white border-hairline'
            }`}
          >
            {emojiKey[i] ?? (
              <span className="w-6 h-6 bg-alumno text-white rounded-full flex items-center justify-center text-xs font-bold">
                {i + 1}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Grid de emojis */}
      <div className="grid grid-cols-5 gap-2 mb-6">
        {EMOJIS.map(emoji => (
          <button
            key={emoji}
            onClick={() => toggleEmoji(emoji)}
            className={`aspect-square rounded-2xl flex items-center justify-center text-2xl transition-base active:scale-90 ${
              emojiKey.includes(emoji)
                ? 'bg-alumno-lt border-2 border-alumno'
                : 'bg-white border-2 border-transparent'
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setEmojiKey([])}
          className="flex-1 py-3 rounded-2xl border border-hairline text-ink text-sm font-medium"
        >
          Reiniciar
        </button>
        <button
          onClick={saveLlave}
          disabled={emojiKey.length !== 3 || saving}
          className="flex-[2] py-3 rounded-2xl bg-alumno text-white font-semibold text-sm disabled:opacity-40 active:scale-[0.98] transition-base flex items-center justify-center"
        >
          {saving
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : 'Guardar llave ▶'
          }
        </button>
      </div>
    </div>
  )
}
