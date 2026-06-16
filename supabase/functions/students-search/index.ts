import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  try {
    const { centro_slug: centroSlug, query } = await req.json()

    if (!centroSlug) return errorResponse('Falta centro_slug', 400)
    if (!query || query.length < 2) return jsonResponse({ students: [] })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Resolver centro por slug
    const { data: centro, error: centroErr } = await supabase
      .from('centros')
      .select('id')
      .eq('slug', centroSlug)   // ⚠️  centros usa "slug" si existe, si no ajustar al nombre de columna real
      .single()

    // Si no existe columna slug en centros, buscar por nombre aproximado
    if (centroErr || !centro) {
      return errorResponse('Centro no encontrado', 404)
    }

    const { data: students, error } = await supabase
      .from('students')
      .select('id, full_name, curso, grupo')
      .eq('centro_id', centro.id)
      .eq('active', true)
      .ilike('full_name', `%${query}%`)
      .limit(8)

    if (error) throw error

    return jsonResponse({ students: students ?? [] })
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Error interno', 500)
  }
})
