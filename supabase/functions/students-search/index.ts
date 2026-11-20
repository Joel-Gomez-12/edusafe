// Edge Function: POST /functions/v1/students-search
// Buscador "ciego" del asistente de reporte: el alumno escribe un nombre y recibe
// solo nombre + curso + grupo de alumnos de SU centro.
// La búsqueda ignora tildes y mayúsculas ("maria" encuentra a "María"): compara
// contra students.name_norm (columna generada, migración 015).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

// Misma normalización que public.edusafe_norm() en la base: sin tildes y en minúsculas.
// Se quitan además los comodines de LIKE para que el texto se busque literalmente.
function normalizeQuery(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[%_*\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  try {
    const { centro_slug: centroSlug, query } = await req.json()

    if (!centroSlug) return errorResponse('Falta centro_slug', 400)

    const q = normalizeQuery(query)
    if (q.length < 2) return jsonResponse({ students: [] })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Resolver centro por slug
    const { data: centro, error: centroErr } = await supabase
      .from('centros')
      .select('id')
      .eq('slug', centroSlug)
      .single()

    if (centroErr || !centro) {
      return errorResponse('Centro no encontrado', 404)
    }

    const { data: students, error } = await supabase
      .from('students')
      .select('id, full_name, curso, grupo')
      .eq('centro_id', centro.id)
      .eq('active', true)
      .ilike('name_norm', `%${q}%`)
      .order('full_name')
      .limit(8)

    if (error) throw error

    return jsonResponse({ students: students ?? [] })
  } catch (err) {
    console.error('students-search error:', err)
    return errorResponse('Error interno', 500)
  }
})
