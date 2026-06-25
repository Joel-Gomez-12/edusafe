import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useSearchParams, useLocation } from 'react-router'
import { Home, Megaphone, Lock, BookOpen, HelpCircle, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'

// ── Calculadora falsa ─────────────────────────────────────────────────────────

function FakeCalculator({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState('0')
  const [expr,    setExpr]    = useState('')

  function press(val: string) {
    if (val === 'AC') { onClose(); return }   // secreto: AC vuelve a la app

    if (val === 'C') {
      setDisplay('0'); setExpr(''); return
    }
    if (val === '=') {
      try {
        const result = Function('"use strict"; return (' + expr + display + ')')()
        setDisplay(String(parseFloat(result.toFixed(8))))
        setExpr('')
      } catch { setDisplay('Error') }
      return
    }
    if (['+', '−', '×', '÷'].includes(val)) {
      const op = val === '÷' ? '/' : val === '×' ? '*' : val === '−' ? '-' : '+'
      setExpr(expr + display + op)
      setDisplay('0')
      return
    }
    if (val === '+/−') {
      setDisplay(d => d.startsWith('-') ? d.slice(1) : '-' + d)
      return
    }
    if (val === '%') {
      setDisplay(d => String(parseFloat(d) / 100))
      return
    }
    if (val === '.' && display.includes('.')) return
    setDisplay(d => d === '0' && val !== '.' ? val : d + val)
  }

  const rows = [
    ['C', '+/−', '%', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '−'],
    ['1', '2', '3', '+'],
    ['AC', '0', '.', '='],
  ]

  const colorOf = (v: string) =>
    ['÷','×','−','+','='].includes(v) ? 'bg-orange-400 text-white' :
    ['C','+/−','%'].includes(v)       ? 'bg-zinc-500 text-white'   :
    v === 'AC'                         ? 'bg-zinc-500 text-white'   :
                                         'bg-zinc-700 text-white'

  return (
    <div className="fixed inset-0 z-[999] bg-black flex flex-col justify-end pb-6 px-4 select-none">
      {/* Display */}
      <div className="px-2 pb-4 text-right">
        <p className="text-zinc-500 text-lg min-h-6">{expr}</p>
        <p className="text-white font-light leading-none"
           style={{ fontSize: display.length > 9 ? '2.5rem' : '4.5rem' }}>
          {display}
        </p>
      </div>

      {/* Botones */}
      <div className="flex flex-col gap-3">
        {rows.map((row, ri) => (
          <div key={ri} className="flex gap-3">
            {row.map(val => (
              <button
                key={val}
                onClick={() => press(val)}
                className={`flex-1 rounded-full flex items-center justify-center text-2xl font-light transition-opacity active:opacity-70 ${colorOf(val)} ${val === '0' ? '' : ''}`}
                style={{ height: '5rem' }}
              >
                {val}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Layout principal ──────────────────────────────────────────────────────────

export default function AlumnoLayout() {
  const navigate    = useNavigate()
  const location    = useLocation()
  const { t }       = useTranslation()
  const [searchParams] = useSearchParams()
  const [showCalc, setShowCalc] = useState(false)

  const isInicio = location.pathname === '/alumno' || location.pathname === '/alumno/'

  const NAV = [
    { to: '/alumno',           label: t('nav.home'),      Icon: Home,        end: true  },
    { to: '/alumno/reporte',   label: t('nav.report'),    Icon: Megaphone,   end: false },
    { to: '/alumno/mis-casos', label: t('nav.my_cases'),  Icon: Lock,        end: false },
    { to: '/alumno/recursos',  label: t('nav.resources'), Icon: BookOpen,    end: false },
    { to: '/alumno/ayuda',     label: t('nav.help'),      Icon: HelpCircle,  end: false },
  ]

  useEffect(() => {
    const slug = searchParams.get('centro')
    if (slug) {
      localStorage.setItem('edusafe_centro_slug', slug)
      const nombre = slug
        .replace(/([A-Z])/g, ' $1')
        .replace(/-/g, ' ')
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase())
      localStorage.setItem('edusafe_centro_nombre', nombre)
    }
  }, [searchParams])

  return (
    <div className="min-h-svh flex flex-col bg-cream">
      <div className="flex-1 overflow-auto pb-20">
        <Outlet />
      </div>

      {/* Calculadora falsa (modo camuflaje) */}
      {showCalc && <FakeCalculator onClose={() => setShowCalc(false)} />}

      {/* Selector de idioma + FAB modo camuflaje — solo en Inicio */}
      {isInicio && !showCalc && (
        <>
          <div className="fixed bottom-24 right-20 z-50">
            <LanguageSwitcher />
          </div>
          <button
            onClick={() => setShowCalc(true)}
            aria-label="Modo camuflaje"
            className="fixed bottom-24 right-4 z-50 w-12 h-12 bg-alerta-critica text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-base"
          >
            <X className="w-5 h-5" strokeWidth={3} />
          </button>
        </>
      )}

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
