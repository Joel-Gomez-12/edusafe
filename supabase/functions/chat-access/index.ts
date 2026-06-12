// Edge Function: POST /functions/v1/chat-access
// Re-acceso del alumno al chat mediante case_code + emoji_pattern + device_token
// Devuelve un JWT de sesión de 15 minutos + los mensajes del chat

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.1/mod.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

interface ChatAccessBody {
  case_code: string
  emoji_pattern: string[]
  device_token: string
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  try {
    const body: ChatAccessBody = await req.json()
    const { case_code, emoji_pattern, device_token } = body

    if (!case_code || !emoji_pattern || !device_token) {
      return errorResponse('case_code, emoji_pattern y device_token son obligatorios', 400)
    }

    // 1. Buscar el reporte
    const { data: report, error } = await supabaseAdmin
      .from('reports')
      .select('id, tenant_id, emoji_pattern_hash, device_token, status')
      .eq('case_code', case_code.toUpperCase())
      .single()

    if (error || !report) {
      return errorResponse('Caso no encontrado', 403)
    }

    // 2. Verificar device_token
    if (report.device_token !== device_token) {
      return errorResponse('Acceso denegado: dispositivo no autorizado', 403)
    }

    // 3. Verificar emoji_pattern
    const emojiString = emoji_pattern.join('')
    const encoder = new TextEncoder()
    const data = encoder.encode(emojiString + Deno.env.get('EMOJI_HASH_SALT', 'edusafe-salt'))
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const emojiHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    if (emojiHash !== report.emoji_pattern_hash) {
      return errorResponse('Patrón de emojis incorrecto', 403)
    }

    // 4. Obtener mensajes (descifrado lo hará el cliente en Sprint 3)
    const { data: rawMessages } = await supabaseAdmin
      .from('messages')
      .select('id, sender_type, content_encrypted, created_at, read_at')
      .eq('report_id', report.id)
      .order('created_at', { ascending: true })

    // 5. Generar JWT de sesión corta (15 min) — solo identifica el report_id
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(Deno.env.get('SUPABASE_JWT_SECRET')!),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    )

    const sessionToken = await create(
      { alg: 'HS256', typ: 'JWT' },
      {
        sub: report.id,
        role: 'alumno_anon',
        report_id: report.id,
        tenant_id: report.tenant_id,
        exp: getNumericDate(15 * 60),  // 15 minutos
      },
      key,
    )

    // 6. Audit log
    await supabaseAdmin.from('audit_log').insert({
      tenant_id: report.tenant_id,
      actor_type: 'alumno',
      action: 'chat.accessed',
      resource_type: 'report',
      resource_id: report.id,
      details: { case_code },
      ip_address: req.headers.get('cf-connecting-ip') ?? null,
    })

    return jsonResponse({
      session_token: sessionToken,
      messages: rawMessages ?? [],
    })

  } catch (err) {
    console.error('Error en chat-access:', err)
    return errorResponse('Error interno del servidor', 500)
  }
})
