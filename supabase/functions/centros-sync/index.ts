// Edge Function: POST /functions/v1/centros-sync
// Importa el censo de alumnos del centro. Solo staff autenticado (mediador o director),
// y siempre sobre SU propio centro. Dos formatos de entrada:
//   · JSON:      { students: [{ full_name, curso, grupo, external_id?, nacido_en? }] }
//   · multipart: file=alumnos.csv  (cabecera: external_id,full_name,curso,grupo[,nacido_en]
//                                   o bien:    nombre,apellidos,curso,grupo)
// No duplica: omite alumnos que ya existen (por external_id, o por nombre+curso+grupo).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const MAX_ROWS = 5000

interface StudentRow {
  external_id?: string | null
  full_name:    string
  curso:        string
  grupo:        string
  nacido_en?:   string | null
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  try {
    // 1. Autenticación: mediador o director activo
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return errorResponse('Autenticación requerida', 401)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !user) return errorResponse('Token inválido', 401)

    const [{ data: med }, { data: dir }] = await Promise.all([
      supabaseAdmin.from('mediators').select('id, tenant_id, centro_id')
        .eq('user_id', user.id).eq('active', true).maybeSingle(),
      supabaseAdmin.from('directors').select('id, tenant_id, centro_id')
        .eq('user_id', user.id).eq('active', true).maybeSingle(),
    ])
    const staff     = med ?? dir
    const actorType = med ? 'mediador' : 'director'
    if (!staff) return errorResponse('Solo el personal del centro puede importar el censo', 403)

    // 2. Leer filas (JSON o CSV)
    let rows: StudentRow[] = []
    const contentType = req.headers.get('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file')
      if (!(file instanceof File)) return errorResponse('Se requiere un archivo CSV', 400)
      rows = parseStudentsCsv(await file.text())
    } else {
      const body = await req.json().catch(() => null)
      rows = Array.isArray(body?.students) ? body.students : []
    }

    // 3. Validar y limpiar
    const clean: StudentRow[] = []
    let invalid = 0
    for (const r of rows.slice(0, MAX_ROWS)) {
      const full_name = String(r?.full_name ?? '').replace(/\s+/g, ' ').trim()
      const curso     = String(r?.curso ?? '').trim()
      const grupo     = String(r?.grupo ?? '').trim()
      if (!full_name || !curso || !grupo || full_name.length > 120 || curso.length > 40 || grupo.length > 20) {
        invalid++
        continue
      }
      const external_id = r?.external_id ? String(r.external_id).trim().slice(0, 60) : null
      const nacido_en   = r?.nacido_en && /^\d{4}-\d{2}-\d{2}$/.test(String(r.nacido_en)) ? String(r.nacido_en) : null
      clean.push({ external_id, full_name, curso, grupo, nacido_en })
    }
    if (clean.length === 0) return errorResponse('CSV vacío o formato inválido', 400)

    // 4. Omitir los que ya están en el censo (y duplicados dentro del propio archivo)
    const { data: existing } = await supabaseAdmin
      .from('students')
      .select('external_id, full_name, curso, grupo')
      .eq('centro_id', staff.centro_id)
      .limit(20000)

    const nameKey = (s: { full_name: string; curso: string; grupo: string }) =>
      `${s.full_name.toLowerCase()}|${s.curso.toLowerCase()}|${s.grupo.toLowerCase()}`
    const seenNames = new Set((existing ?? []).map(nameKey))
    const seenExt   = new Set((existing ?? []).map(s => s.external_id).filter(Boolean) as string[])

    const toInsert: Record<string, unknown>[] = []
    let skipped = 0
    for (const s of clean) {
      if (seenNames.has(nameKey(s)) || (s.external_id && seenExt.has(s.external_id))) { skipped++; continue }
      seenNames.add(nameKey(s))
      if (s.external_id) seenExt.add(s.external_id)
      toInsert.push({ ...s, tenant_id: staff.tenant_id, centro_id: staff.centro_id, active: true })
    }

    // 5. Insertar en lotes
    let inserted = 0
    const errors: string[] = []
    for (let i = 0; i < toInsert.length; i += 500) {
      const batch = toInsert.slice(i, i + 500)
      const { error } = await supabaseAdmin.from('students').insert(batch)
      if (error) errors.push(error.message)
      else inserted += batch.length
    }

    // 6. Marcar la fecha de carga y auditar
    await supabaseAdmin
      .from('centros')
      .update({ csv_uploaded_at: new Date().toISOString() })
      .eq('id', staff.centro_id)

    await supabaseAdmin.from('audit_log').insert({
      tenant_id:     staff.tenant_id,
      actor_type:    actorType,
      actor_id:      staff.id,
      action:        'students.csv_sync',
      resource_type: 'centro',
      resource_id:   staff.centro_id,
      details:       { inserted, skipped, invalid, errors: errors.length },
    })

    if (errors.length > 0 && inserted === 0) {
      console.error('centros-sync insert errors:', errors)
      return errorResponse('No se pudo guardar el censo', 500)
    }
    return jsonResponse({ inserted, skipped, invalid, updated: 0, errors })

  } catch (err) {
    console.error('Error en centros-sync:', err)
    return errorResponse('Error interno del servidor', 500)
  }
})

function parseStudentsCsv(csv: string): StudentRow[] {
  const lines = csv.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  const split   = (line: string) => line.split(/[,;]/).map(v => v.trim().replace(/^"|"$/g, ''))
  const headers = split(lines[0]).map(h => h.toLowerCase())
  const col     = (row: string[], name: string) => {
    const i = headers.indexOf(name)
    return i >= 0 ? (row[i] ?? '') : ''
  }

  return lines.slice(1).map(line => {
    const row = split(line)
    const full_name = headers.includes('full_name')
      ? col(row, 'full_name')
      : `${col(row, 'nombre')} ${col(row, 'apellidos')}`.trim()
    return {
      external_id: col(row, 'external_id') || null,
      full_name,
      curso:       col(row, 'curso'),
      grupo:       col(row, 'grupo'),
      nacido_en:   col(row, 'nacido_en') || null,
    }
  })
}
