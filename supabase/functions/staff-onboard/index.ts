// Edge Function: staff-onboard
// GET  → devuelve lista de centros (para el dropdown del formulario)
// POST → crea perfil de mediador o director para un usuario autenticado

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  // GET — lista de centros para el dropdown
  if (req.method === 'GET') {
    const { data: centros } = await supabaseAdmin
      .from('centros')
      .select('id, nombre, municipio')
      .eq('active', true)
      .order('nombre')
    return jsonResponse({ centros: centros ?? [] })
  }

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  try {
    // Verificar que el usuario está autenticado
    const authHeader = req.headers.get('Authorization') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      anonKey,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return errorResponse('No autenticado', 401)

    const { full_name, role, centro_id } = await req.json()
    if (!full_name?.trim()) return errorResponse('full_name es obligatorio', 400)
    if (!role || !['mediador', 'director'].includes(role)) return errorResponse('role debe ser mediador o director', 400)
    if (!centro_id) return errorResponse('centro_id es obligatorio', 400)

    // Verificar que el centro existe y obtener tenant_id
    const { data: centro, error: centroErr } = await supabaseAdmin
      .from('centros')
      .select('id, tenant_id')
      .eq('id', centro_id)
      .single()
    if (centroErr || !centro) return errorResponse('Centro no encontrado', 404)

    // Comprobar que el usuario no tiene ya un perfil
    const [medRow, dirRow] = await Promise.all([
      supabaseAdmin.from('mediators').select('id').eq('user_id', user.id).maybeSingle(),
      supabaseAdmin.from('directors').select('id').eq('user_id', user.id).maybeSingle(),
    ])
    if (medRow.data || dirRow.data) return errorResponse('Este usuario ya tiene un perfil', 409)

    // Crear el perfil según el rol
    if (role === 'mediador') {
      const { error } = await supabaseAdmin.from('mediators').insert({
        user_id:   user.id,
        tenant_id: centro.tenant_id,
        centro_id: centro.id,
        full_name: full_name.trim(),
        email:     user.email ?? '',
      })
      if (error) throw error
    } else {
      const { error } = await supabaseAdmin.from('directors').insert({
        user_id:   user.id,
        tenant_id: centro.tenant_id,
        centro_id: centro.id,
        full_name: full_name.trim(),
        email:     user.email ?? '',
      })
      if (error) throw error
    }

    // Audit log
    await supabaseAdmin.from('audit_log').insert({
      tenant_id:     centro.tenant_id,
      actor_type:    role,
      actor_id:      user.id,
      action:        'staff.onboarded',
      resource_type: role === 'mediador' ? 'mediators' : 'directors',
      resource_id:   user.id,
      details:       { full_name, centro_id, email: user.email },
    })

    return jsonResponse({ ok: true, role })
  } catch (err) {
    console.error('staff-onboard error:', err)
    return errorResponse('Error interno del servidor', 500)
  }
})
