import { NavLink, Outlet } from 'react-router'
import { Inbox, FolderOpen, Users, FileText, User } from 'lucide-react'

const tabs = [
  { to: '/mediador',           label: 'Inbox',    Icon: Inbox,      end: true  },
  { to: '/mediador/casos',     label: 'Casos',    Icon: FolderOpen, end: false },
  { to: '/mediador/alumnos',   label: 'Alumnos',  Icon: Users,      end: false },
  { to: '/mediador/informes',  label: 'Informes', Icon: FileText,   end: false },
  { to: '/mediador/perfil',    label: 'Perfil',   Icon: User,       end: false },
]

export default function MediadorLayout() {
  return (
    <div className="min-h-svh bg-cream">
      <div className="pb-16">
        <Outlet />
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
