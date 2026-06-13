import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Phone, BookOpen } from 'lucide-react'

export default function AlumnoHome() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const centroNombre = localStorage.getItem('edusafe_centro_nombre') ?? 'Tu centro educativo'

  useEffect(() => {
    const slug = searchParams.get('centro')
    if (slug) localStorage.setItem('edusafe_centro_slug', slug)
  }, [searchParams])

  return (
    <div className="flex flex-col min-h-svh bg-cream">

      {/* ── Header violeta ─────────────────────────────────────── */}
      <div className="bg-alumno px-5 pt-12 pb-6 rounded-b-3xl">

        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            <p className="text-[10px] font-semibold tracking-widest text-white/60 uppercase mb-1">
              Espacio seguro y anónimo
            </p>
            <h1 className="font-display text-3xl font-bold text-white leading-tight">
              Tu voz importa.
            </h1>
            <p className="text-sm text-white/75 mt-1 leading-snug">
              Aquí nadie sabe quién eres.<br />Tu información va cifrada.
            </p>
          </div>
          <div className="w-11 h-11 bg-white/15 rounded-2xl flex items-center justify-center text-xl ml-3 flex-shrink-0">
            🎭
          </div>
        </div>

        {/* Card — Iniciar reporte */}
        <button
          onClick={() => navigate('/alumno/reporte')}
          className="w-full bg-alumno-dk rounded-2xl p-4 flex items-center gap-4 text-left mb-3 active:scale-[0.98] transition-base"
        >
          <div className="w-12 h-12 bg-mostaza rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
            📣
          </div>
          <div>
            <p className="font-semibold text-white text-base">Iniciar reporte</p>
            <p className="text-xs text-white/70 mt-0.5">Crea tu llave + chat guiado · 3 min</p>
          </div>
        </button>

        {/* Card — Seguir mi reporte */}
        <button
          onClick={() => navigate('/alumno/mis-casos')}
          className="w-full bg-sage rounded-2xl p-4 flex items-center gap-4 text-left active:scale-[0.98] transition-base"
        >
          <div className="w-12 h-12 bg-mostaza rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
            🔒
          </div>
          <div>
            <p className="font-semibold text-white text-base">Seguir mi reporte</p>
            <p className="text-xs text-white/70 mt-0.5">Ver respuesta del mediador</p>
          </div>
        </button>
      </div>

      {/* ── Ayuda inmediata ────────────────────────────────────── */}
      <div className="px-5 pt-5 flex-1">
        <p className="text-[10px] font-semibold tracking-widest text-ink/40 uppercase mb-3">
          ¿Necesitas ayuda inmediata?
        </p>

        <div className="flex flex-col gap-2">
          <a
            href="tel:016"
            className="bg-white rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-base shadow-sm"
          >
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Phone className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="font-semibold text-ink text-sm">Hablar con un orientador ahora</p>
              <p className="text-xs text-ink/50 mt-0.5">Llamada anónima · Lunes a viernes 8–20h</p>
            </div>
          </a>

          <button
            onClick={() => navigate('/alumno/recursos')}
            className="bg-white rounded-2xl p-4 flex items-center gap-4 text-left active:scale-[0.98] transition-base shadow-sm"
          >
            <div className="w-10 h-10 bg-sage-lt rounded-xl flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5 text-sage-dk" />
            </div>
            <div>
              <p className="font-semibold text-ink text-sm">Saber más sobre acoso</p>
              <p className="text-xs text-ink/50 mt-0.5">Qué es, cómo reconocerlo, dónde pedir ayuda</p>
            </div>
          </button>
        </div>

        <div className="text-center mt-8 pb-4">
          <p className="font-display font-bold text-alumno text-sm">EduSafe</p>
          <p className="text-[10px] text-ink/40 uppercase tracking-widest mt-0.5">{centroNombre}</p>
        </div>
      </div>
    </div>
  )
}
