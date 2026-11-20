// Edge Function: POST /functions/v1/verify-content
// Verifica si un texto o imagen fue generado por IA.
// Proveedor primario: Hive AI (RGPD-compliant, sin almacenamiento de imágenes en plan enterprise).
// Si HIVE_API_KEY no está configurada devuelve status='undetermined' para no bloquear el flujo.

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

// Esta función es pública (la usa el alumno anónimo), así que NO escribe en la base:
// antes aceptaba un report_id y sobrescribía reports.text_verification de cualquier
// reporte. El resultado lo adjunta el cliente al crear el reporte (reports-create).
// Los límites evitan que se use como pasarela gratuita hacia el proveedor.
const MAX_TEXT_CHARS   = 5_000
const MAX_IMAGE_BASE64 = 11_000_000   // ~8 MB de imagen

type VerifyType   = 'image' | 'text'
type VerifyStatus = 'auth' | 'possible_ai' | 'undetermined'

interface VerifyBody {
  type:         VerifyType
  payload:      string      // base64 (con o sin data URL prefix) para imágenes, texto plano para texto
}

interface VerifyResult {
  status:     VerifyStatus
  confidence: number        // 0-1
  provider:   string
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  try {
    const body: VerifyBody = await req.json()
    const { type, payload } = body

    if (!type || !payload) return errorResponse('type y payload son obligatorios', 400)
    if (type !== 'image' && type !== 'text') return errorResponse('type debe ser image o text', 400)
    if (typeof payload !== 'string') return errorResponse('payload inválido', 400)
    if (payload.length > (type === 'text' ? MAX_TEXT_CHARS : MAX_IMAGE_BASE64)) {
      // Demasiado grande para analizar: no se bloquea el flujo del alumno
      return jsonResponse({ status: 'undetermined', confidence: 0, provider: 'none' })
    }

    const hiveKey = Deno.env.get('HIVE_API_KEY')

    let result: VerifyResult

    if (!hiveKey) {
      // Sin API key: no bloquear. El mediador verá "No determinable".
      result = { status: 'undetermined', confidence: 0, provider: 'none' }
    } else {
      result = type === 'image'
        ? await verifyImageHive(payload, hiveKey)
        : await verifyTextHive(payload, hiveKey)
    }

    return jsonResponse(result)

  } catch (err) {
    console.error('verify-content error:', err)
    // Nunca bloquear el flujo del alumno por fallos del proveedor
    return jsonResponse({ status: 'undetermined', confidence: 0, provider: 'error' })
  }
})

// ─── Hive AI: imágenes ─────────────────────────────────────────────────────────

async function verifyImageHive(base64: string, apiKey: string): Promise<VerifyResult> {
  // Eliminar el prefijo data URL si existe
  const rawBase64 = base64.replace(/^data:image\/[a-z+]+;base64,/, '')

  const binary = atob(rawBase64)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const form = new FormData()
  form.append('image', new Blob([bytes], { type: 'image/jpeg' }), 'evidence.jpg')

  const res = await fetch('https://hivemoderation.com/api/v2/task/sync', {
    method: 'POST',
    headers: { 'Authorization': `token ${apiKey}` },
    body: form,
  })

  if (!res.ok) throw new Error(`Hive image API ${res.status}`)

  const json = await res.json()
  // Estructura Hive: on_image[0].response.output[0].classes
  const classes: { class: string; score: number }[] =
    json?.on_image?.[0]?.response?.output?.[0]?.classes ?? []

  const aiScore = classes.find(c => c.class === 'ai_generated')?.score ?? 0
  return mapScore(aiScore, 'hive', 'image')
}

// ─── Hive AI: texto ────────────────────────────────────────────────────────────

async function verifyTextHive(text: string, apiKey: string): Promise<VerifyResult> {
  const res = await fetch('https://hivemoderation.com/api/v2/task/sync', {
    method: 'POST',
    headers: {
      'Authorization': `token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text_data: text }),
  })

  if (!res.ok) throw new Error(`Hive text API ${res.status}`)

  const json = await res.json()
  const classes: { class: string; score: number }[] =
    json?.status?.response?.output?.[0]?.classes ?? []

  const aiScore = classes.find(c => c.class === 'ai_generated')?.score ?? 0
  return mapScore(aiScore, 'hive', 'text')
}

// ─── Mapeo de score a status ───────────────────────────────────────────────────

function mapScore(score: number, provider: string, mode: 'image' | 'text'): VerifyResult {
  // Umbrales conservadores — texto tiene más falsos positivos que imagen
  const highThreshold = mode === 'text' ? 0.92 : 0.75
  const lowThreshold  = mode === 'text' ? 0.30 : 0.20

  if (score >= highThreshold) {
    return { status: 'possible_ai',  confidence: score,         provider }
  }
  if (score <= lowThreshold) {
    return { status: 'auth',         confidence: 1 - score,     provider }
  }
  return   { status: 'undetermined', confidence: score,         provider }
}
