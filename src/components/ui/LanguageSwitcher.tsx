import { useTranslation } from 'react-i18next'
import i18n from '@/lib/i18n'

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { i18n: i18nInstance } = useTranslation()
  const isES = i18nInstance.language === 'es'

  function toggle() {
    const next = isES ? 'en' : 'es'
    i18n.changeLanguage(next)
    localStorage.setItem('edusafe_lang', next)
  }

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-hairline bg-white/80 hover:bg-white text-xs font-semibold text-ink transition-base active:scale-95 ${className}`}
      aria-label="Cambiar idioma / Change language"
    >
      <span className="text-sm">{isES ? '🇪🇸' : '🇬🇧'}</span>
      <span>{isES ? 'ES' : 'EN'}</span>
    </button>
  )
}
