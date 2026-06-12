import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useSearchParams } from 'react-router'
import { Home, Megaphone, Lock, BookOpen, HelpCircle, X } from 'lucide-react'

const NAV = [
  { to: '/alumno',           label: 'Inicio',    Icon: Home,        end: true  },
  { to: '/alumno/reporte',   label: 'Reportar',  Icon: Megaphone,   end: false },
  { to: '/alumno/mis-casos', label: 'Mis casos', Icon: Lock,        end: false },
  { to: '/alumno/recursos',  label: 'Recursos',  Icon: BookOpen,    end: false },
  { to: '/alumno/ayuda',     label: 'Ayuda',     Icon: HelpCircle,  end: false },
]

export default function AlumnoLayout() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Capturar el slug del centro desde la URL y guardarlo en localStorage
  useEffect(() => {
    const slug = searchParams.get('centro')
    if (slug) {
      localStorage.setItem('edusafe_centro_slug', slug)
      // Formatear el slug como nombre legible mientras se obtiene el real
      const nombre = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      localStorage.setItem('edusafe_centro_nombre', nombre)
    }
  }, [searchParams])

  function modoCamuflaje() {
    // Redirige a una URL inocua para ocultar la app rápidamente
    window.location.replace('https://www.google.com')
  }

  return (
    <div className="min-h-svh flex flex-col bg-cream">
      {/* Contenido de la ruta hija */}
      <div className="flex-1 overflow-auto pb-20">
        <Outlet />
      </div>

      {/* FAB modo camuflaje */}
      <button
        onClick={modoCamuflaje}
        aria-label="Modo camuflaje — salir rápido"
        className="fixed bottom-24 right-4 z-50 w-12 h-12 bg-alerta-critica text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-base"
      >
        <X className="w-5 h-5" strokeWidth={3} />
      </button>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-hairline safe-bottom flex">
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                isActive ? 'text-alumno' : 'text-ink/40'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.75} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
