import { useState, useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/edusafe/supabase'
import { useAuth } from '@/context/AuthContext'

interface MediadorProfile {
  full_name:  string
  email:      string
  centro:     string
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
}

export default function MediadorPerfil() {
  const { user, signOut } = useAuth()
  const [profile, setProfile] = useState<MediadorProfile | null>(null)

  useEffect(() => { loadProfile() }, [])

  async function loadProfile() {
    const { data: med } = await supabase
      .from('mediators')
      .select('full_name, email, centro_id')
      .eq('user_id', user?.id ?? '')
      .single()
    if (!med) return

    const { data: centro } = await supabase
      .from('centros')
      .select('nombre')
      .eq('id', med.centro_id)
      .single()

    setProfile({
      full_name: med.full_name,
      email:     med.email,
      centro:    centro?.nombre ?? '',
    })
  }

  const initials = profile ? getInitials(profile.full_name) : '…'

  const menuRows: Array<{ label: string; value?: string; action?: () => void; danger?: boolean }> = [
    { label: 'Notificaciones' },
    { label: 'Idioma', value: 'ES' },
    { label: 'Manual del mediador' },
    { label: 'Cerrar sesión', action: signOut, danger: true },
  ]

  return (
    <div className="flex flex-col min-h-svh">
      {/* Cabecera */}
      <div className="bg-mediador px-5 pt-12 pb-5">
        <h1 className="font-display text-3xl font-bold text-white leading-tight">Perfil</h1>
      </div>

      <div className="flex-1 bg-cream px-5 pt-5 pb-4 flex flex-col gap-5">

        {/* Tarjeta de perfil */}
        <div className="bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-full bg-mediador flex items-center justify-center flex-shrink-0">
            <span className="text-lg font-bold text-white tracking-wide">{initials}</span>
          </div>

          {/* Datos */}
          <div className="min-w-0">
            <p className="text-base font-bold text-ink">
              {profile?.full_name ?? user?.email?.split('@')[0] ?? '…'}
            </p>
            <p className="text-sm text-sage-dk font-medium truncate">
              Mediadora certificada
            </p>
            {profile?.centro && (
              <p className="text-xs text-muted mt-0.5 truncate">{profile.centro}</p>
            )}
          </div>
        </div>

        {/* Sección cuenta */}
        <div>
          <p className="text-[11px] font-bold tracking-widest text-muted uppercase mb-3">
            Cuenta
          </p>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {menuRows.map(({ label, value, action, danger }, idx) => (
              <button
                key={label}
                onClick={action}
                className={`w-full flex items-center justify-between px-4 py-4 text-left transition-base ${
                  idx > 0 ? 'border-t border-hairline' : ''
                } ${danger ? '' : 'active:bg-cream'}`}
              >
                <span className={`text-sm font-medium ${danger ? 'text-red-500' : 'text-ink'}`}>
                  {label}
                </span>
                {!danger && (
                  <span className="flex items-center gap-0.5 text-muted">
                    {value && <span className="text-sm text-muted mr-0.5">{value}</span>}
                    <ChevronRight className="w-4 h-4" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
