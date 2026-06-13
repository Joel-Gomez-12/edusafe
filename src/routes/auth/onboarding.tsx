import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Shield } from 'lucide-react'
import { supabase, callEdgeFunction } from '@/lib/edusafe/supabase'
import { toast } from 'sonner'

interface Centro {
  id:        string
  nombre:    string
  municipio: string | null
}

export default function OnboardingPage() {
  const navigate = useNavigate()

  const [centros,   setCentros]   = useState<Centro[]>([])
  const [role,      setRole]      = useState<'mediador' | 'director'>('mediador')
  const [fullName,  setFullName]  = useState('')
  const [centroId,  setCentroId]  = useState('')
  const [loading,   setLoading]   = useState(false)
  const [loadingC,  setLoadingC]  = useState(true)

  useEffect(() => {
    callEdgeFunction<{ centros: Centro[] }>('staff-onboard', { method: 'GET' })
      .then(res => {
        setCentros(res.centros)
        if (res.centros.length === 1) setCentroId(res.centros[0].id)
      })
      .catch(() => toast.error('No se pudo cargar la lista de centros'))
      .finally(() => setLoadingC(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim() || !centroId) return
    setLoading(true)
    try {
      await callEdgeFunction('staff-onboard', {
        body: { full_name: fullName.trim(), role, centro_id: centroId },
      })
      // Refrescar sesión para que el JWT hook inyecte el nuevo rol
      const { data, error } = await supabase.auth.refreshSession()
      if (error || !data.session) throw new Error('No se pudo refrescar la sesión')

      toast.success('¡Perfil creado! Bienvenido/a a EduSafe.')
      navigate(role === 'director' ? '/director' : '/mediador', { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear el perfil')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-display text-primary-dk leading-tight">EduSafe</h1>
            <p className="text-xs text-muted">Configura tu perfil</p>
          </div>
        </div>

        <h2 className="text-2xl font-display text-ink mb-1">Bienvenido/a</h2>
        <p className="text-sm text-ink-soft mb-6">
          Es tu primera vez aquí. Completa estos datos para empezar.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* Nombre */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-ink">Tu nombre completo</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="María García López"
              required
              className="w-full px-4 py-3 rounded-lg border border-hairline bg-cream-lt text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary transition-base"
            />
          </div>

          {/* Rol */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-ink">Tu rol en el centro</label>
            <div className="grid grid-cols-2 gap-2">
              {(['mediador', 'director'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`py-3 rounded-xl border-2 text-sm font-semibold transition-base ${
                    role === r
                      ? 'border-primary bg-primary text-white'
                      : 'border-hairline bg-cream-lt text-ink hover:border-primary/40'
                  }`}
                >
                  {r === 'mediador' ? '🛡️ Mediador/a' : '📊 Director/a'}
                </button>
              ))}
            </div>
          </div>

          {/* Centro */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-ink">Tu centro educativo</label>
            {loadingC ? (
              <div className="h-11 rounded-lg border border-hairline bg-cream-lt flex items-center px-4">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <select
                value={centroId}
                onChange={e => setCentroId(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-hairline bg-cream-lt text-ink focus:outline-none focus:ring-2 focus:ring-primary transition-base"
              >
                <option value="">Selecciona tu centro...</option>
                {centros.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}{c.municipio ? ` · ${c.municipio}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !fullName.trim() || !centroId}
            className="w-full py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dk disabled:opacity-50 disabled:cursor-not-allowed transition-base"
          >
            {loading ? 'Creando perfil...' : 'Entrar a EduSafe →'}
          </button>
        </form>
      </div>
    </div>
  )
}
