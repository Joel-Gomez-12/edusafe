// Edge Function: POST /functions/v1/evidence-upload  (multipart/form-data)
// El alumno anónimo adjunta una captura a SU reporte recién creado.
// Campos: case_code, device_token, file, verification? (JSON del análisis anti-IA)
// Sube al bucket privado 'evidence' y registra la fila en evidence_files con su SHA-256.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const MAX_FILES_PER_REPORT = 4
const MAX_SIZE_BYTES       = 8 * 1024 * 1024   // 8 MB
const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
}
const VERIFY_STATUSES = ['auth', 'possible_ai', 'undetermined']

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  try {
    const form        = await req.formData()
    const caseCode    = String(form.get('case_code') ?? '').trim().toUpperCase()
    const deviceToken = String(form.get('device_token') ?? '').trim()
    const file        = form.get('file')

    if (!caseCode || !deviceToken || !(file instanceof File)) {
      return errorResponse('case_code, device_token y file son obligatorios', 400)
    }

    const ext = ALLOWED_MIME[file.type]
    if (!ext) return errorResponse('Solo se admiten imágenes JPG, PNG o WEBP', 415)
    if (file.size === 0 || file.size > MAX_SIZE_BYTES) {
      return errorResponse('La imagen está vacía o supera los 8 MB', 413)
    }

    // 1. El reporte debe existir y pertenecer a este dispositivo
    const { data: report } = await supabaseAdmin
      .from('reports')
      .select('id, tenant_id, device_token, status')
      .eq('case_code', caseCode)
      .maybeSingle()

    if (!report || report.device_token !== deviceToken) {
      return errorResponse('Caso no encontrado o dispositivo no autorizado', 403)
    }
    if (['resuelto', 'archivado'].includes(report.status)) {
      return errorResponse('El caso ya está cerrado', 409)
    }

    // 2. Límite de capturas por reporte
    const { count } = await supabaseAdmin
      .from('evidence_files')
      .select('id', { count: 'exact', head: true })
      .eq('report_id', report.id)
    if ((count ?? 0) >= MAX_FILES_PER_REPORT) {
      return errorResponse(`Máximo ${MAX_FILES_PER_REPORT} capturas por reporte`, 409)
    }

    // 3. SHA-256 del archivo (cadena de custodia)
    const bytes   = new Uint8Array(await file.arrayBuffer())
    const hashBuf = await crypto.subtle.digest('SHA-256', bytes)
    const sha256  = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    // 4. Subir al bucket privado. El nombre original NO se conserva (podría identificar al alumno)
    const storagePath = `${report.tenant_id}/${report.id}/${crypto.randomUUID()}.${ext}`
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('evidence')
      .upload(storagePath, bytes, { contentType: file.type, upsert: false })
    if (uploadErr) {
      console.error('evidence-upload storage error:', uploadErr)
      return errorResponse('Error guardando la captura', 500)
    }

    // 5. Resultado anti-IA calculado en el wizard (orientativo)
    let verification: unknown = null
    try {
      const parsed = JSON.parse(String(form.get('verification') ?? 'null'))
      if (parsed && VERIFY_STATUSES.includes(parsed.status)) {
        verification = {
          status:     parsed.status,
          confidence: Number(parsed.confidence) || 0,
          provider:   String(parsed.provider ?? 'none').slice(0, 40),
        }
      }
    } catch { /* verificación ausente o inválida: se guarda null */ }

    // 6. Registrar la evidencia
    const { data: row, error: insertErr } = await supabaseAdmin
      .from('evidence_files')
      .insert({
        tenant_id:    report.tenant_id,
        report_id:    report.id,
        storage_path: storagePath,
        file_name:    `captura-${(count ?? 0) + 1}.${ext}`,
        mime_type:    file.type,
        size_bytes:   file.size,
        sha256_hash:  sha256,
        uploaded_by:  null,
        verification,
      })
      .select('id')
      .single()

    if (insertErr || !row) {
      console.error('evidence-upload insert error:', insertErr)
      await supabaseAdmin.storage.from('evidence').remove([storagePath])
      return errorResponse('Error registrando la captura', 500)
    }

    // 7. Audit log
    await supabaseAdmin.from('audit_log').insert({
      tenant_id:     report.tenant_id,
      actor_type:    'alumno',
      action:        'evidence.uploaded',
      resource_type: 'evidence_file',
      resource_id:   row.id,
      details:       { case_code: caseCode, sha256_prefix: sha256.slice(0, 12), size_bytes: file.size },
    })

    return jsonResponse({ evidence_id: row.id, sha256_hash: sha256 }, 201)

  } catch (err) {
    console.error('evidence-upload error:', err)
    return errorResponse('Error interno del servidor', 500)
  }
})
