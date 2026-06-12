import { useNavigate, useSearchParams } from 'react-router'
import { Shield, MessageSquare, LayoutDashboard } from 'lucide-react'

export default function LandingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const centro = searchParams.get('centro') ?? ''
  const centroParam = centro ? `?centro=${centro}` : ''

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-hairline bg-cream-lt">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          <span className="font-display font-bold text-xl text-primary-dk">EduSafe</span>
        </div>
        <button
          onClick={() => navigate('/auth/login')}
          className="text-sm text-ink-soft hover:text-primary transition-base"
        >
          Acceso staff
        </button>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-8 text-center">
        <div className="max-w-sm">
          <h1 className="text-4xl font-display text-primary-dk mb-3 leading-tight">
            Un espacio seguro para contar lo que pasa
          </h1>
          <p className="text-ink-soft text-base">
            Tu voz importa. Nadie va a saber que eres tú.
          </p>
        </div>

        {/* Role selector */}
        <div className="w-full max-w-sm flex flex-col gap-3">
          <RoleCard
            icon={<MessageSquare className="w-6 h-6" />}
            label="Soy estudiante"
            description="Reporta de forma anónima y segura"
            color="sage"
            onClick={() => navigate(`/alumno${centroParam}`)}
          />
          <RoleCard
            icon={<Shield className="w-6 h-6" />}
            label="Soy mediador"
            description="Accede a tu bandeja de casos"
            color="primary"
            onClick={() => navigate('/auth/login?role=mediador')}
          />
          <RoleCard
            icon={<LayoutDashboard className="w-6 h-6" />}
            label="Soy director/a"
            description="Panel de seguimiento del centro"
            color="primary-dk"
            onClick={() => navigate('/auth/login?role=director')}
          />
        </div>

        {/* Re-acceso alumno */}
        <button
          onClick={() => navigate(`/alumno/mis-casos${centroParam}`)}
          className="text-sm text-ink-soft underline underline-offset-2 hover:text-primary transition-base"
        >
          Ya tengo un caso abierto — volver al chat
        </button>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 text-center">
        <p className="text-xs text-muted">
          EduSafe · Tecnología con alma · Datos protegidos bajo RGPD
        </p>
      </footer>
    </div>
  )
}

interface RoleCardProps {
  icon: React.ReactNode
  label: string
  description: string
  color: 'sage' | 'primary' | 'primary-dk'
  onClick: () => void
}

function RoleCard({ icon, label, description, color, onClick }: RoleCardProps) {
  const colorMap = {
    sage: 'bg-sage text-white hover:bg-sage-dk',
    primary: 'bg-primary text-white hover:bg-primary-dk',
    'primary-dk': 'bg-primary-dk text-white hover:opacity-90',
  }

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-4 px-5 py-4 rounded-xl text-left
        transition-base active:scale-[0.98]
        ${colorMap[color]}
      `}
    >
      <span className="shrink-0 opacity-90">{icon}</span>
      <div>
        <div className="font-semibold text-base">{label}</div>
        <div className="text-sm opacity-80">{description}</div>
      </div>
    </button>
  )
}
