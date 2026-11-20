// Sprint 5: Mapa de calor del centro — densidad de reportes por zona
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'

export default function DirectorHeatmap() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <header className="px-6 py-4 flex items-center gap-3 border-b border-hairline bg-primary-dk text-white">
        <button onClick={() => navigate('/director')} className="p-1 -ml-1 opacity-80 hover:opacity-100 transition-base">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="font-semibold">{t('director_heatmap.title')}</span>
      </header>
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="text-center text-muted">
          <p className="text-4xl mb-3">🚧</p>
          <p className="font-display text-lg text-ink">{t('director_heatmap.wip_title')}</p>
          <p className="text-sm mt-1">{t('director_heatmap.wip_desc')}</p>
        </div>
      </main>
    </div>
  )
}
