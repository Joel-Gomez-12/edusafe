-- ============================================================
-- EduSafe · Auth Hook — Custom JWT claims
-- Sprint 2 · Añade app_tenant_id, role, staff_id al JWT
-- ============================================================
-- Este hook se configura en Supabase Dashboard:
-- Authentication → Hooks → Custom Access Token Hook
-- Apuntar a: supabase/functions/auth-hook/index.ts

-- Función auxiliar: devuelve los metadatos del staff
CREATE OR REPLACE FUNCTION get_staff_jwt_claims(user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_mediator mediators%ROWTYPE;
  v_director directors%ROWTYPE;
BEGIN
  -- Buscar mediador
  SELECT * INTO v_mediator FROM mediators WHERE mediators.user_id = $1 AND active = TRUE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'role',          'mediador',
      'staff_id',      v_mediator.id::text,
      'app_tenant_id', v_mediator.tenant_id::text,
      'centro_id',     v_mediator.centro_id::text
    );
  END IF;

  -- Buscar director
  SELECT * INTO v_director FROM directors WHERE directors.user_id = $1 AND active = TRUE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'role',          'director',
      'staff_id',      v_director.id::text,
      'app_tenant_id', v_director.tenant_id::text,
      'centro_id',     v_director.centro_id::text
    );
  END IF;

  -- Usuario no registrado como staff
  RETURN '{}'::jsonb;
END;
$$;
