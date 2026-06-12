import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  try {
    const { case_code, device_token, emoji_pattern } = await req.json()

    if (!case_code || !device_token || !emoji_pattern || emoji_pattern.length !== 3) {
      return errorResponse('case_code, device_token y emoji_pattern (3 emojis) son obligatorios', 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Hashear el nuevo emoji_pattern
    const salt = Deno.env.get('EMOJI_HASH_SALT') ?? 'edusafe-salt'
    const encoder = new TextEncoder()
    const data = encoder.encode(emoji_pattern.join('') + salt)
    const buf = await crypto.subtle.digest('SHA-256', data)
    const emojiHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')

    // Verificar que el device_token corresponde al reporte
    const { data: report, error } = await supabase
      .from('reports')
      .update({ emoji_pattern_hash: emojiHash })
      .eq('case_code', case_code)
      .eq('device_token', device_token)
      .select('id')
      .single()

    if (error || !report) {
      return errorResponse('Reporte no encontrado o token incorrecto', 404)
    }

    return jsonResponse({ ok: true })
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Error interno', 500)
  }
})
