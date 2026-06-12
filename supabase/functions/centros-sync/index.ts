// Edge Function: POST /functions/v1/centros-sync
// Importa el censo de alumnos desde CSV subido por el admin del centro

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  try {
    // 1. Verificar auth del director
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Autenticación requerida', 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !user) return errorResponse('Token inválido', 401)

    const { data: director } = await supabaseAdmin
      .from('directors')
      .select('id, tenant_id, centro_id')
      .eq('user_id', user.id)
      .single()

    if (!director) return errorResponse('Solo directores pueden sincronizar el censo', 403)

    // 2. Parsear el CSV (multipart/form-data)
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return errorResponse('Se requiere un archivo CSV', 400)

    const csvText = await file.text()
    const students = parseStudentsCsv(csvText)

    if (students.length === 0) return errorResponse('CSV vacío o formato inválido', 400)

    // 3. Upsert en students por external_id
    let inserted = 0
    let updated = 0
    const errors: string[] = []

    for (const student of students) {
      try {
        const { data, error } = await supabaseAdmin
          .from('students')
          .upsert({
            tenant_id: director.tenant_id,
            centro_id: director.centro_id,
            external_id: student.external_id,
            full_name: student.full_name,
            curso: student.curso,
            grupo: student.grupo,
            nacido_en: student.nacido_en ?? null,
            active: true,
          }, {
            onConflict: 'centro_id,external_id',
          })
          .select('id')

        if (error) {
          errors.push(`Error en ${student.external_id}: ${error.message}`)
        } else if (data && data.length > 0) {
          inserted++
        } else {
          updated++
        }
      } catch (e) {
        errors.push(`Error procesando ${student.external_id}`)
      }
    }

    // 4. Actualizar csv_uploaded_at en el centro
    await supabaseAdmin
      .from('centros')
      .update({ csv_uploaded_at: new Date().toISOString() })
      .eq('id', director.centro_id)

    // 5. Audit log
    await supabaseAdmin.from('audit_log').insert({
      tenant_id: director.tenant_id,
      actor_type: 'director',
      actor_id: director.id,
      action: 'students.csv_sync',
      resource_type: 'centro',
      resource_id: director.centro_id,
      details: { inserted, updated, errors: errors.length },
    })

    return jsonResponse({ inserted, updated, errors }, 200)

  } catch (err) {
    console.error('Error en centros-sync:', err)
    return errorResponse('Error interno del servidor', 500)
  }
})

interface StudentRow {
  external_id: string
  full_name: string
  curso: string
  grupo: string
  nacido_en?: string
}

function parseStudentsCsv(csv: string): StudentRow[] {
  const lines = csv.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].toLowerCase().split(',').map(h => h.trim())
  const required = ['external_id', 'full_name', 'curso', 'grupo']
  if (!required.every(h => headers.includes(h))) return []

  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? '' })
    return {
      external_id: row.external_id,
      full_name: row.full_name,
      curso: row.curso,
      grupo: row.grupo,
      nacido_en: row.nacido_en || undefined,
    }
  }).filter(s => s.external_id && s.full_name)
}
