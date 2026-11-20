import { useTranslation } from 'react-i18next'

export default function AlumnoAyuda() {
  const { t } = useTranslation()
  const items = [
    {
      emoji: '🕶️',
      title: t('ayuda.camo_title'),
      desc: t('ayuda.camo_desc'),
    },
    {
      emoji: '🔑',
      title: t('ayuda.key_title'),
      desc: t('ayuda.key_desc'),
    },
    {
      emoji: '🔒',
      title: t('ayuda.anon_title'),
      desc: t('ayuda.anon_desc'),
    },
    {
      emoji: '⏱️',
      title: t('ayuda.time_title'),
      desc: t('ayuda.time_desc'),
    },
  ]

  return (
    <div className="flex flex-col min-h-svh bg-cream">

      <div className="bg-alumno px-5 pt-12 pb-5 rounded-b-3xl">
        <h1 className="font-display text-2xl font-bold text-white">{t('ayuda.title')}</h1>
        <p className="text-sm text-white/60 mt-0.5">{t('ayuda.subtitle')}</p>
      </div>

      <div className="px-5 pt-5 flex flex-col gap-3">
        {items.map(item => (
          <div key={item.title} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">{item.emoji}</span>
              <p className="font-semibold text-ink text-sm">{item.title}</p>
            </div>
            <p className="text-sm text-ink/60 leading-snug">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
