// Edge Function: POST /functions/v1/reports-create
// Alumno anónimo crea un nuevo reporte de bullying
// Requiere: X-Centro-Slug header

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

interface VerifyResult {
  status:     'auth' | 'possible_ai' | 'undetermined'
  confidence: number
  provider:   string
}

interface CreateReportBody {
  device_token: string
  emoji_pattern?: string[]          // opcional — se actualiza después con reports-set-emoji
  category?: string
  zone?: string
  zones?: string[]                  // array del wizard → se une en zone
  description?: string
  who_affected?: string
  perpetrator_student_id?: string   // UUID directo del alumno seleccionado en búsqueda
  involved?: Array<{
    student_external_id: string
    role: 'victima' | 'agresor' | 'testigo'
  }>
  text_verification?: VerifyResult  // resultado del análisis del relato (verify-content)
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  try {
    // 1. Resolver centro desde el header X-Centro-Slug
    const centroSlug = req.headers.get('X-Centro-Slug')
    if (!centroSlug) return errorResponse('X-Centro-Slug header requerido', 400)

    // Buscar el centro por slug (columna añadida en migración 007)
    const { data: centro, error: centroErr } = await supabaseAdmin
      .from('centros')
      .select('id, tenant_id')
      .eq('slug', centroSlug)
      .single()

    if (centroErr || !centro) return errorResponse('Centro no encontrado', 404)

    // 2. Parsear el body
    const body: CreateReportBody = await req.json()
    const {
      device_token, emoji_pattern, category,
      zone, zones, description, who_affected,
      perpetrator_student_id, involved, text_verification,
    } = body

    if (!device_token) return errorResponse('device_token es obligatorio', 400)

    // 3. Hash del emoji_pattern (si lo mandan) o placeholder del device_token
    const encoder = new TextEncoder()
    const salt = Deno.env.get('EMOJI_HASH_SALT') ?? 'edusafe-salt'
    let emojiHash: string
    if (emoji_pattern && emoji_pattern.length === 3) {
      const data = encoder.encode(emoji_pattern.join('') + salt)
      const buf = await crypto.subtle.digest('SHA-256', data)
      emojiHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
    } else {
      // Placeholder — el alumno actualizará con reports-set-emoji
      const data = encoder.encode(device_token + salt)
      const buf = await crypto.subtle.digest('SHA-256', data)
      emojiHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
    }

    // Normalizar zones array → string
    const zoneStr = zone ?? (zones && zones.length > 0 ? zones.join(', ') : null)

    // 4. Generar case_code único: 2 letras del slug + 4 dígitos
    const prefix = centroSlug.slice(0, 2).toUpperCase().replace(/[^A-Z]/g, 'X')
    const suffix = Math.floor(1000 + Math.random() * 9000)
    const case_code = `${prefix}-${suffix}`

    // 5. INSERT en reports
    const { data: report, error: reportErr } = await supabaseAdmin
      .from('reports')
      .insert({
        tenant_id: centro.tenant_id,
        centro_id: centro.id,
        case_code,
        device_token,
        emoji_pattern_hash: emojiHash,
        category: category ?? 'otros',
        zone: zoneStr,
        description,
        status: 'nuevo',
        text_verification: text_verification ?? null,
      })
      .select('id, case_code')
      .single()

    if (reportErr) {
      console.error('Error insertando reporte:', reportErr)
      return errorResponse('Error creando el reporte', 500)
    }

    // 6. INSERT en report_involved
    const involvedRows: { report_id: string; student_id: string; role: string }[] = []

    // Por UUID directo (búsqueda del wizard)
    if (perpetrator_student_id) {
      involvedRows.push({ report_id: report!.id, student_id: perpetrator_student_id, role: 'agresor' })
    }

    // Por external_id (importación SIS)
    if (involved && involved.length > 0) {
      const lookups = await Promise.all(
        involved.map(async ({ student_external_id, role }) => {
          const { data: student } = await supabaseAdmin
            .from('students').select('id')
            .eq('centro_id', centro.id).eq('external_id', student_external_id).single()
          return student ? { report_id: report!.id, student_id: student.id, role } : null
        })
      )
      involvedRows.push(...lookups.filter(Boolean) as typeof involvedRows)
    }

    if (involvedRows.length > 0) {
      await supabaseAdmin.from('report_involved').insert(involvedRows)
    }

    // 7. Triaje básico de severidad (Sprint 7 lo reemplaza con IA)
    const severityScore = classifyBasicSeverity(description ?? '', category ?? '')
    const severityLevel = severityScore >= 80 ? 'critica'
      : severityScore >= 60 ? 'alta'
      : severityScore >= 40 ? 'media' : 'baja'

    await supabaseAdmin
      .from('reports')
      .update({ severity_score: severityScore, severity_level: severityLevel })
      .eq('id', report!.id)

    // 8. Audit log
    await supabaseAdmin.from('audit_log').insert({
      tenant_id: centro.tenant_id,
      actor_type: 'alumno',
      action: 'report.created',
      resource_type: 'report',
      resource_id: report!.id,
      details: { case_code, severity_level: severityLevel },
      ip_address: req.headers.get('cf-connecting-ip') ?? null,
      user_agent: req.headers.get('user-agent') ?? null,
    })

    // 9. Respuesta al alumno
    return jsonResponse({
      case_code: report!.case_code,
      next_step: 'Guarda este código y los emojis. Los necesitarás para volver al chat.',
    }, 201)

  } catch (err) {
    console.error('Error inesperado:', err)
    return errorResponse('Error interno del servidor', 500)
  }
})

// Triaje básico por keywords y categoría
function classifyBasicSeverity(description: string, category: string): number {
  let score = 20

  // Boost por categoría
  if (category === 'sexual') score += 50
  if (category === 'fisico') score += 30
  if (category === 'ciberacoso') score += 20
  if (category === 'exclusion') score += 10
  if (category === 'verbal') score += 10

  // Keywords de alta gravedad
  const highRisk = ['amenaza', 'golpe', 'pegar', 'foto', 'video', 'difund', 'suicid', 'matar']
  const text = description.toLowerCase()
  highRisk.forEach(kw => { if (text.includes(kw)) score += 15 })

  return Math.min(score, 100)
}
