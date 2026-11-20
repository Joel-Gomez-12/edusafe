// Edge Function: POST /functions/v1/chat-access
// Acceso del alumno al chat: verifica case_code + emoji_pattern + device_token
// Opcionalmente envía un mensaje si se incluye send_content en el body
//
// Seguridad:
//  · Tras MAX_FAILED llaves incorrectas desde el dispositivo correcto, el caso queda
//    bloqueado LOCK_MINUTES minutos (la llave son 3 emojis de 20: 6.840 combinaciones).
//    Los intentos sin el device_token correcto no cuentan: así nadie puede bloquear
//    el caso de otro alumno conociendo solo el código.
//  · Los mensajes se guardan cifrados (trigger en la BD) y se leen descifrados a través
//    de get_case_messages_service, accesible solo con la clave de servicio.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const MAX_FAILED     = 5
const LOCK_MINUTES   = 15
const MAX_MSG_LENGTH = 2000

interface ChatAccessBody {
  case_code:     string
  emoji_pattern: string[]
  device_token:  string
  send_content?: string
  poll?:         boolean   // refresco periódico del chat ya abierto: no se audita
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  try {
    const body: ChatAccessBody = await req.json()
    const { case_code, emoji_pattern, device_token, send_content, poll } = body

    if (!case_code || !Array.isArray(emoji_pattern) || !device_token) {
      return errorResponse('case_code, emoji_pattern y device_token son obligatorios', 400)
    }

    // 1. Buscar el reporte
    const { data: report, error } = await supabaseAdmin
      .from('reports')
      .select('id, tenant_id, emoji_pattern_hash, device_token, status, case_code, access_failed_count, access_locked_until')
      .eq('case_code', String(case_code).toUpperCase())
      .single()

    if (error || !report) return errorResponse('Caso no encontrado', 403)

    // 2. Verificar device_token
    if (report.device_token !== device_token) {
      return errorResponse('Acceso denegado: dispositivo no autorizado', 403)
    }

    // 3. ¿Bloqueado por demasiados intentos?
    const lockedUntil = report.access_locked_until ? new Date(report.access_locked_until).getTime() : 0
    if (lockedUntil > Date.now()) {
      const minutes = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60_000))
      return errorResponse(`Demasiados intentos. Vuelve a probar en ${minutes} min.`, 429)
    }

    // 4. Verificar emoji_pattern
    const emojiString = emoji_pattern.join('')
    const encoder    = new TextEncoder()
    const salt       = Deno.env.get('EMOJI_HASH_SALT') ?? 'edusafe-salt'
    const hashBuf    = await crypto.subtle.digest('SHA-256', encoder.encode(emojiString + salt))
    const emojiHash  = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    if (emojiHash !== report.emoji_pattern_hash) {
      const failed = (report.access_failed_count ?? 0) + 1
      const lock   = failed >= MAX_FAILED
      await supabaseAdmin
        .from('reports')
        .update({
          access_failed_count: lock ? 0 : failed,
          access_locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
        })
        .eq('id', report.id)

      await supabaseAdmin.from('audit_log').insert({
        tenant_id:     report.tenant_id,
        actor_type:    'alumno',
        action:        lock ? 'chat.access_locked' : 'chat.access_denied',
        resource_type: 'report',
        resource_id:   report.id,
        details:       { case_code: report.case_code, failed_attempts: failed },
      })

      return lock
        ? errorResponse(`Demasiados intentos. Vuelve a probar en ${LOCK_MINUTES} min.`, 429)
        : errorResponse('Patrón de emojis incorrecto', 403)
    }

    // Acceso correcto: limpiar el contador si había fallos previos
    if ((report.access_failed_count ?? 0) > 0 || report.access_locked_until) {
      await supabaseAdmin
        .from('reports')
        .update({ access_failed_count: 0, access_locked_until: null })
        .eq('id', report.id)
    }

    // 5. Enviar mensaje si se incluye (el trigger de la BD lo cifra al guardar)
    const text = typeof send_content === 'string' ? send_content.trim() : ''
    if (text) {
      if (text.length > MAX_MSG_LENGTH) {
        return errorResponse(`El mensaje no puede superar ${MAX_MSG_LENGTH} caracteres`, 413)
      }
      const { error: insertErr } = await supabaseAdmin.from('messages').insert({
        report_id:         report.id,
        sender_type:       'alumno',
        content_encrypted: text,
      })
      if (insertErr) {
        console.error('chat-access insert error:', insertErr)
        return errorResponse('No se pudo enviar el mensaje', 500)
      }
    }

    // 6. Obtener mensajes ya descifrados
    const { data: rows, error: readErr } = await supabaseAdmin
      .rpc('get_case_messages_service', { p_report_id: report.id })
    if (readErr) {
      console.error('chat-access read error:', readErr)
      return errorResponse('No se pudo cargar el chat', 500)
    }

    // Se mantiene el nombre de campo que espera el cliente (content_encrypted),
    // aunque aquí el contenido ya viaja descifrado sobre TLS.
    const messages = (rows ?? []).map((m: { id: string; sender_type: string; content: string; created_at: string }) => ({
      id:                m.id,
      sender_type:       m.sender_type,
      content_encrypted: m.content,
      created_at:        m.created_at,
    }))

    // 7. Audit log (solo al abrir el chat; no en cada mensaje ni en cada refresco)
    if (!text && !poll) {
      await supabaseAdmin.from('audit_log').insert({
        tenant_id:     report.tenant_id,
        actor_type:    'alumno',
        action:        'chat.accessed',
        resource_type: 'report',
        resource_id:   report.id,
        details:       { case_code: report.case_code },
      })
    }

    return jsonResponse({
      report_id: report.id,
      case_code: report.case_code,
      messages,
    })

  } catch (err) {
    console.error('Error en chat-access:', err)
    return errorResponse('Error interno del servidor', 500)
  }
})
