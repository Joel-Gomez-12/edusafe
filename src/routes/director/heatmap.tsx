// Sprint 5: Mapa de calor del centro — densidad de reportes por zona
import { useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'

export default function DirectorHeatmap() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <header className="px-6 py-4 flex items-center gap-3 border-b border-hairline bg-primary-dk text-white">
        <button onClick={() => navigate('/director')} className="p-1 -ml-1 opacity-80 hover:opacity-100 transition-base">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="font-semibold">Mapa de calor del centro</span>
      </header>
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="text-center text-muted">
          <p className="text-4xl mb-3">🚧</p>
          <p className="font-display text-lg text-ink">Sprint 5 — Mapa de calor</p>
          <p className="text-sm mt-1">SVG del centro con zonas coloreadas por incidencias</p>
        </div>
      </main>
    </div>
  )
}
