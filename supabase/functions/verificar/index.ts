// Edge Function: GET /functions/v1/verificar/:csv_code
// Verificación pública de actas — sin autenticación
// NUNCA devuelve el contenido del acta, solo metadatos de autenticidad

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'GET') return errorResponse('Method not allowed', 405)

  try {
    // Extraer csv_code de la URL
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')
    const csvCode = pathParts[pathParts.length - 1]?.toUpperCase()

    if (!csvCode || csvCode.length < 8) {
      return errorResponse('Código de verificación inválido', 400)
    }

    // Buscar el acta
    const { data: acta } = await supabaseAdmin
      .from('actas')
      .select(`
        id, type, csv_code, sha256_hash, generated_at,
        reports!inner(case_code, centros!inner(nombre))
      `)
      .eq('csv_code', csvCode)
      .single()

    if (!acta) {
      return jsonResponse({ valid: false }, 404)
    }

    // Devolver SOLO metadatos — nunca el contenido del acta
    const typeLabels: Record<string, string> = {
      final: 'Acta final de resolución',
      borrador: 'Acta borrador',
    }

    return jsonResponse({
      valid: true,
      centro: (acta.reports as Record<string, unknown> & { centros: { nombre: string } }).centros?.nombre ?? 'Centro educativo',
      type: typeLabels[acta.type] ?? acta.type,
      generated_at: acta.generated_at,
      case_code: (acta.reports as { case_code: string }).case_code,
      sha256_hash: acta.sha256_hash,
    })

  } catch (err) {
    console.error('Error en verificar:', err)
    return errorResponse('Error interno del servidor', 500)
  }
})
