import { NavLink, Outlet } from 'react-router'
import { Inbox, FolderOpen, Users, FileText, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'

export default function MediadorLayout() {
  const { t } = useTranslation()

  const tabs = [
    { to: '/mediador',          label: t('nav_mediador.inbox'),    Icon: Inbox,      end: true  },
    { to: '/mediador/casos',    label: t('nav_mediador.cases'),    Icon: FolderOpen, end: false },
    { to: '/mediador/alumnos',  label: t('nav_mediador.students'), Icon: Users,      end: false },
    { to: '/mediador/informes', label: t('nav_mediador.reports'),  Icon: FileText,   end: false },
    { to: '/mediador/perfil',   label: t('nav_mediador.profile'),  Icon: User,       end: false },
  ]

  return (
    <div className="min-h-svh bg-cream">
      <div className="pb-16">
        <Outlet />
      </div>

      {/* Selector de idioma flotante */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-hairline h-16 flex z-40">
        {tabs.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-mediador' : 'text-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`p-1.5 rounded-xl ${isActive ? 'bg-mediador-lt' : ''}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
