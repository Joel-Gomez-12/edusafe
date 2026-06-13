// Edge Function: POST /functions/v1/chat-access
// Acceso del alumno al chat: verifica case_code + emoji_pattern + device_token
// Opcionalmente envía un mensaje si se incluye send_content en el body

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

interface ChatAccessBody {
  case_code:     string
  emoji_pattern: string[]
  device_token:  string
  send_content?: string
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  try {
    const body: ChatAccessBody = await req.json()
    const { case_code, emoji_pattern, device_token, send_content } = body

    if (!case_code || !emoji_pattern || !device_token) {
      return errorResponse('case_code, emoji_pattern y device_token son obligatorios', 400)
    }

    // 1. Buscar el reporte
    const { data: report, error } = await supabaseAdmin
      .from('reports')
      .select('id, tenant_id, emoji_pattern_hash, device_token, status, case_code')
      .eq('case_code', case_code.toUpperCase())
      .single()

    if (error || !report) return errorResponse('Caso no encontrado', 403)

    // 2. Verificar device_token
    if (report.device_token !== device_token) {
      return errorResponse('Acceso denegado: dispositivo no autorizado', 403)
    }

    // 3. Verificar emoji_pattern
    const emojiString = emoji_pattern.join('')
    const encoder    = new TextEncoder()
    const salt       = Deno.env.get('EMOJI_HASH_SALT') ?? 'edusafe-salt'
    const hashBuf    = await crypto.subtle.digest('SHA-256', encoder.encode(emojiString + salt))
    const emojiHash  = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    if (emojiHash !== report.emoji_pattern_hash) {
      return errorResponse('Patrón de emojis incorrecto', 403)
    }

    // 4. Enviar mensaje si se incluye
    if (send_content?.trim()) {
      await supabaseAdmin.from('messages').insert({
        report_id:         report.id,
        sender_type:       'alumno',
        content_encrypted: send_content.trim(),
      })
    }

    // 5. Obtener mensajes
    const { data: rawMessages } = await supabaseAdmin
      .from('messages')
      .select('id, sender_type, content_encrypted, created_at')
      .eq('report_id', report.id)
      .order('created_at', { ascending: true })

    // 6. Audit log (solo en acceso, no en cada mensaje)
    if (!send_content) {
      await supabaseAdmin.from('audit_log').insert({
        tenant_id:     report.tenant_id,
        actor_type:    'alumno',
        action:        'chat.accessed',
        resource_type: 'report',
        resource_id:   report.id,
        details:       { case_code },
        ip_address:    req.headers.get('cf-connecting-ip') ?? null,
      })
    }

    return jsonResponse({
      report_id: report.id,
      case_code: report.case_code,
      messages:  rawMessages ?? [],
    })

  } catch (err) {
    console.error('Error en chat-access:', err)
    return errorResponse('Error interno del servidor', 500)
  }
})
