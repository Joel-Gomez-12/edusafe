import { useNavigate, useSearchParams } from 'react-router'
import { Shield, MessageSquare, LayoutDashboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'

export default function LandingPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
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
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <button
            onClick={() => navigate('/auth/login')}
            className="text-sm text-ink-soft hover:text-primary transition-base"
          >
            {t('landing.staff_access')}
          </button>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-8 text-center">
        <div className="max-w-sm">
          <h1 className="text-4xl font-display text-primary-dk mb-3 leading-tight">
            {t('landing.hero_title')}
          </h1>
          <p className="text-ink-soft text-base">
            {t('landing.hero_subtitle')}
          </p>
        </div>

        {/* Role selector */}
        <div className="w-full max-w-sm flex flex-col gap-3">
          <RoleCard
            icon={<MessageSquare className="w-6 h-6" />}
            label={t('landing.student')}
            description={t('landing.student_desc')}
            color="sage"
            onClick={() => navigate(`/alumno${centroParam}`)}
          />
          <RoleCard
            icon={<Shield className="w-6 h-6" />}
            label={t('landing.mediator')}
            description={t('landing.mediator_desc')}
            color="primary"
            onClick={() => navigate('/auth/login?role=mediador')}
          />
          <RoleCard
            icon={<LayoutDashboard className="w-6 h-6" />}
            label={t('landing.director')}
            description={t('landing.director_desc')}
            color="primary-dk"
            onClick={() => navigate('/auth/login?role=director')}
          />
        </div>

        <button
          onClick={() => navigate(`/alumno/mis-casos${centroParam}`)}
          className="text-sm text-ink-soft underline underline-offset-2 hover:text-primary transition-base"
        >
          {t('landing.already_open')}
        </button>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 text-center">
        <p className="text-xs text-muted">{t('landing.footer')}</p>
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
      className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl text-left transition-base active:scale-[0.98] ${colorMap[color]}`}
    >
      <span className="shrink-0 opacity-90">{icon}</span>
      <div>
        <div className="font-semibold text-base">{label}</div>
        <div className="text-sm opacity-80">{description}</div>
      </div>
    </button>
  )
}
