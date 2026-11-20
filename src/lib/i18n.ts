import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import es from '@/locales/es.json'
import en from '@/locales/en.json'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
    },
    lng: localStorage.getItem('edusafe_lang') ?? 'es',
    fallbackLng: 'es',
    interpolation: { escapeValue: false },
  })

// Mantener <html lang> acorde al idioma activo (lectores de pantalla y navegador)
document.documentElement.lang = i18n.language || 'es'
i18n.on('languageChanged', lng => { document.documentElement.lang = lng })

/** Configuración regional para formatear fechas y números según el idioma activo. */
export function dateLocale(): string {
  return i18n.language === 'en' ? 'en-GB' : 'es-ES'
}

export default i18n
