import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/context/AuthContext'
import { ProtectedRoute } from '@/components/ui/ProtectedRoute'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

// Layouts
import AlumnoLayout   from '@/components/alumno/AlumnoLayout'
import MediadorLayout from '@/components/mediador/MediadorLayout'
import DirectorLayout from '@/components/director/DirectorLayout'

// Rutas públicas
import LandingPage from '@/routes/index'

// Rutas alumno (sin auth — device_token)
import AlumnoHome      from '@/routes/alumno/index'
import AlumnoReporte   from '@/routes/alumno/reporte'
import AlumnoMisCasos  from '@/routes/alumno/mis-casos'
import AlumnoChat      from '@/routes/alumno/chat'
import AlumnoRecursos  from '@/routes/alumno/recursos'
import AlumnoAyuda     from '@/routes/alumno/ayuda'
import AlumnoLlave     from '@/routes/alumno/llave'

// Rutas mediador (auth requerida)
import MediadorInbox   from '@/routes/mediador/index'
import MediadorCasos   from '@/routes/mediador/casos'
import MediadorAlumnos from '@/routes/mediador/alumnos'
import MediadorActas   from '@/routes/mediador/actas'
import MediadorPerfil  from '@/routes/mediador/perfil'
import MediadorCaso    from '@/routes/mediador/caso'
import MediadorChat    from '@/routes/mediador/chat'

// Rutas director (auth requerida)
import DirectorDashboard from '@/routes/director/index'
import DirectorCentros   from '@/routes/director/centros'
import DirectorAlertas   from '@/routes/director/alertas'
import DirectorMoriarty  from '@/routes/director/moriarty'
import DirectorPerfil    from '@/routes/director/perfil'

// Auth
import LoginPage    from '@/routes/auth/login'
import AuthCallback from '@/routes/auth/callback'

// Verificación pública de actas
import VerificarActa from '@/routes/verificar'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
        <Routes>
          {/* Público */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth/login"    element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/verificar/:csv_code" element={<VerificarActa />} />

          {/* Flujo alumno — layout con bottom nav */}
          <Route path="/alumno" element={<AlumnoLayout />}>
            <Route index          element={<AlumnoHome />} />
            <Route path="reporte"   element={<AlumnoReporte />} />
            <Route path="mis-casos" element={<AlumnoMisCasos />} />
            <Route path="chat/:caseId" element={<AlumnoChat />} />
            <Route path="llave"     element={<AlumnoLlave />} />
            <Route path="recursos"  element={<AlumnoRecursos />} />
            <Route path="ayuda"     element={<AlumnoAyuda />} />
          </Route>

          {/* Chat mediador — full-screen, sin bottom nav */}
          <Route path="/mediador/chat/:caseId" element={
            <ProtectedRoute role="mediador"><MediadorChat /></ProtectedRoute>
          } />

          {/* Mediador — layout con bottom nav */}
          <Route path="/mediador" element={
            <ProtectedRoute role="mediador"><MediadorLayout /></ProtectedRoute>
          }>
            <Route index                    element={<MediadorInbox />}   />
            <Route path="casos"             element={<MediadorCasos />}   />
            <Route path="casos/:caseId"     element={<MediadorCaso />}    />
            <Route path="alumnos"           element={<MediadorAlumnos />} />
            <Route path="informes"          element={<MediadorActas />}   />
            <Route path="perfil"            element={<MediadorPerfil />}  />
          </Route>

          {/* Director — layout con bottom nav */}
          <Route path="/director" element={
            <ProtectedRoute role="director"><DirectorLayout /></ProtectedRoute>
          }>
            <Route index                    element={<DirectorDashboard />} />
            <Route path="centros"           element={<DirectorCentros />}  />
            <Route path="alertas"           element={<DirectorAlertas />}  />
            <Route path="moriarty"          element={<DirectorMoriarty />} />
            <Route path="perfil"            element={<DirectorPerfil />}   />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <Toaster
          position="top-center"
          richColors
          toastOptions={{ style: { fontFamily: 'Calibri, "Segoe UI", system-ui, sans-serif' } }}
        />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  )
}
