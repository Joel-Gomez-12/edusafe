-- ============================================================
-- EduSafe · Auth Hook — firma correcta para Supabase Auth Hooks
-- Corrige: columna auth_user_id (no user_id) + firma event jsonb
-- ============================================================
-- Después de ejecutar esta migración:
-- Authentication → Hooks → Customize Access Token (JWT) Claims
-- → Hook type: PostgreSQL function
-- → Schema: public  Function: custom_access_token_hook
-- ============================================================

-- Eliminar función anterior con firma incorrecta
DROP FUNCTION IF EXISTS get_staff_jwt_claims(UUID);

-- Función con la firma que espera Supabase Auth
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID;
  v_claims   JSONB;
  v_extra    JSONB;
  v_mediator mediators%ROWTYPE;
  v_director directors%ROWTYPE;
BEGIN
  v_user_id := (event ->> 'user_id')::UUID;
  v_claims  := event -> 'claims';

  -- Buscar mediador
  SELECT * INTO v_mediator
  FROM mediators
  WHERE user_id = v_user_id AND active = TRUE
  LIMIT 1;

  IF FOUND THEN
    v_extra := jsonb_build_object(
      'role',          'mediador',
      'staff_id',      v_mediator.id::TEXT,
      'app_tenant_id', v_mediator.tenant_id::TEXT,
      'centro_id',     v_mediator.centro_id::TEXT
    );
    RETURN jsonb_build_object('claims', v_claims || v_extra);
  END IF;

  -- Buscar director
  SELECT * INTO v_director
  FROM directors
  WHERE user_id = v_user_id AND active = TRUE
  LIMIT 1;

  IF FOUND THEN
    v_extra := jsonb_build_object(
      'role',          'director',
      'staff_id',      v_director.id::TEXT,
      'app_tenant_id', v_director.tenant_id::TEXT,
      'centro_id',     NULL
    );
    RETURN jsonb_build_object('claims', v_claims || v_extra);
  END IF;

  -- Usuario no staff: devolver claims sin modificar
  RETURN jsonb_build_object('claims', v_claims);
END;
$$;

-- Permisos requeridos por Supabase Auth para ejecutar el hook
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- supabase_auth_admin necesita leer las tablas de staff
GRANT SELECT ON public.mediators TO supabase_auth_admin;
GRANT SELECT ON public.directors TO supabase_auth_admin;

-- ─── Fix: audit_log necesita ENABLE RLS (no solo FORCE) ─────
-- La migración 001 tenía FORCE ROW LEVEL SECURITY pero faltaba ENABLE.
-- Las políticas ya existen en 001 — solo activamos RLS aquí.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
