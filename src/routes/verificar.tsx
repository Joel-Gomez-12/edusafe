// Sprint 6: Verificación pública de actas — sin autenticación
import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Shield, CheckCircle, XCircle, Loader } from 'lucide-react'
import { callEdgeFunction } from '@/lib/edusafe/supabase'
import type { VerifyActaResponse } from '@/lib/edusafe/types'

export default function VerificarActa() {
  const { csv_code } = useParams<{ csv_code: string }>()
  const [result, setResult] = useState<VerifyActaResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!csv_code) return
    callEdgeFunction<VerifyActaResponse>(`verificar/${csv_code}`, { method: 'GET' })
      .then(data => setResult(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [csv_code])

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Shield className="w-6 h-6 text-primary" />
          <span className="font-display font-bold text-xl text-primary-dk">EduSafe</span>
        </div>

        {loading && (
          <div className="flex flex-col items-center gap-3">
            <Loader className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-ink-soft">Verificando autenticidad del acta...</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3">
            <XCircle className="w-12 h-12 text-alerta-critica" />
            <h1 className="text-xl font-display text-ink">Acta no encontrada</h1>
            <p className="text-sm text-ink-soft">
              El código <strong className="font-mono">{csv_code}</strong> no corresponde a ningún acta válida en nuestro sistema.
            </p>
          </div>
        )}

        {!loading && result && result.valid && (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle className="w-12 h-12 text-sage-dk" />
            <h1 className="text-xl font-display text-ink">Acta válida</h1>
            <div className="w-full bg-cream-lt border border-hairline rounded-xl p-4 text-left flex flex-col gap-2">
              <MetaRow label="Centro" value={result.centro ?? '—'} />
              <MetaRow label="Tipo" value={result.type ?? '—'} />
              <MetaRow label="Código caso" value={result.case_code ?? '—'} />
              <MetaRow label="Generada" value={result.generated_at ? new Date(result.generated_at).toLocaleString('es-ES') : '—'} />
              <MetaRow label="SHA-256" value={(result.sha256_hash ?? '').slice(0, 16) + '...'} mono />
            </div>
            <p className="text-xs text-muted">
              Esta verificación no revela el contenido del acta, solo confirma su autenticidad.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function MetaRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-muted shrink-0">{label}</span>
      <span className={`text-ink text-right ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  )
}
