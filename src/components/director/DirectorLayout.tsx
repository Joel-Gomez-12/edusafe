import { Outlet } from 'react-router'
import { NavLink } from 'react-router'
import { LayoutDashboard, Building2, AlertTriangle, Lock, User } from 'lucide-react'

const tabs = [
  { to: '/director',          label: 'Dashboard', Icon: LayoutDashboard, end: true  },
  { to: '/director/centros',  label: 'Centros',   Icon: Building2,        end: false },
  { to: '/director/alertas',  label: 'Alertas',   Icon: AlertTriangle,    end: false },
  { to: '/director/moriarty', label: 'Moriarty',  Icon: Lock,             end: false },
  { to: '/director/perfil',   label: 'Perfil',    Icon: User,             end: false },
]

export default function DirectorLayout() {
  return (
    <div className="flex flex-col min-h-svh">
      <div className="flex-1 overflow-y-auto pb-20">
        <Outlet />
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
                {isActive && (
                  <span className="w-1 h-1 rounded-full bg-director absolute bottom-1" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
