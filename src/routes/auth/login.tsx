import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Shield, Mail, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/edusafe/supabase'
import { toast } from 'sonner'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const role = searchParams.get('role') ?? 'mediador'
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      try {
        // Leer edusafe_role del JWT (inyectado por custom_access_token_hook)
        const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
        const claims  = JSON.parse(atob(payload)) as Record<string, unknown>
        const jwtRole = claims.edusafe_role as string | undefined
        if (jwtRole === 'director') { navigate('/director', { replace: true }); return }
        if (jwtRole === 'mediador') { navigate('/mediador', { replace: true }); return }
      } catch { /* JWT inválido */ }
      // El hook no inyectó rol — usar el parámetro ?role= como destino optimista.
      // ProtectedRoute hará la verificación real vía AuthContext DB fallback.
      navigate(role === 'director' ? '/director' : '/mediador', { replace: true })
    })
  }, [navigate, role])

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error enviando el enlace')
    } finally {
      setLoading(false)
    }
  }

  const roleLabel = role === 'director' ? 'Director/a' : 'Mediador/a'

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-ink-soft hover:text-primary transition-base mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Volver</span>
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-display text-primary-dk leading-tight">EduSafe</h1>
            <p className="text-xs text-muted">Acceso {roleLabel}</p>
          </div>
        </div>

        {!sent ? (
          <form onSubmit={handleSendLink} className="flex flex-col gap-4">
            <div>
              <h2 className="text-2xl font-display text-ink mb-1">Iniciar sesión</h2>
              <p className="text-sm text-ink-soft">
                Te enviamos un enlace mágico a tu correo institucional.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-sm font-medium text-ink">
                Email institucional
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@colegio.es"
                  required
                  className="w-full pl-9 pr-4 py-3 rounded-lg border border-hairline bg-cream-lt text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-base"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dk disabled:opacity-50 disabled:cursor-not-allowed transition-base"
            >
              {loading ? 'Enviando...' : 'Enviar enlace de acceso'}
            </button>
          </form>
        ) : (
          <div className="text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-sage-lt rounded-full flex items-center justify-center">
              <Mail className="w-8 h-8 text-sage-dk" />
            </div>
            <div>
              <h2 className="text-xl font-display text-ink mb-2">Revisa tu email</h2>
              <p className="text-sm text-ink-soft">
                Hemos enviado un enlace de acceso a <strong>{email}</strong>.
                El enlace expira en 15 minutos.
              </p>
            </div>
            <button
              onClick={() => setSent(false)}
              className="text-sm text-primary underline underline-offset-2 hover:text-primary-dk transition-base"
            >
              Usar otro email
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
