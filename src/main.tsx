import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/i18n'
import App from './App.tsx'

// Auto-recarga cuando un chunk JS no existe (nuevo deploy mientras el usuario tenía la app abierta)
window.addEventListener('vite:preloadError', () => window.location.reload())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
