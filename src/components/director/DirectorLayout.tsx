import { Outlet, NavLink } from 'react-router'
import { LayoutDashboard, Building2, AlertTriangle, Lock, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'

export default function DirectorLayout() {
  const { t } = useTranslation()

  const tabs = [
    { to: '/director',          label: t('nav_director.dashboard'), Icon: LayoutDashboard, end: true  },
    { to: '/director/centros',  label: t('nav_director.schools'),   Icon: Building2,       end: false },
    { to: '/director/alertas',  label: t('nav_director.alerts'),    Icon: AlertTriangle,   end: false },
    { to: '/director/moriarty', label: t('nav_director.moriarty'),  Icon: Lock,            end: false },
    { to: '/director/perfil',   label: t('nav_director.profile'),   Icon: User,            end: false },
  ]

  return (
    <div className="flex flex-col min-h-svh">
      <div className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </div>

      {/* Selector de idioma flotante */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-hairline flex z-40">
        {tabs.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-base ${
                isActive ? 'text-director' : 'text-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{label}</span>
                {isActive && <span className="w-1 h-1 rounded-full bg-director absolute bottom-1" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
