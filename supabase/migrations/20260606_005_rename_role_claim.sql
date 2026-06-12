-- ============================================================
-- EduSafe · Fix claim "role" → "edusafe_role"
-- El claim "role" en el JWT de Supabase está reservado para el
-- rol Postgres (authenticated/anon). Usarlo para el rol de app
-- hace que auth_role() lea "authenticated" en vez de "mediador".
-- ============================================================

-- 1. Actualizar la función helper que leen las políticas RLS
CREATE OR REPLACE FUNCTION auth_role() RETURNS TEXT
  LANGUAGE sql STABLE AS $$
    SELECT auth.jwt() ->> 'edusafe_role'
  $$;

-- 2. Actualizar el hook que enriquece el JWT
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

  SELECT * INTO v_mediator
  FROM mediators
  WHERE user_id = v_user_id AND active = TRUE
  LIMIT 1;

  IF FOUND THEN
    v_extra := jsonb_build_object(
      'edusafe_role',  'mediador',
      'staff_id',      v_mediator.id::TEXT,
      'app_tenant_id', v_mediator.tenant_id::TEXT,
      'centro_id',     v_mediator.centro_id::TEXT
    );
    RETURN jsonb_build_object('claims', v_claims || v_extra);
  END IF;

  SELECT * INTO v_director
  FROM directors
  WHERE user_id = v_user_id AND active = TRUE
  LIMIT 1;

  IF FOUND THEN
    v_extra := jsonb_build_object(
      'edusafe_role',  'director',
      'staff_id',      v_director.id::TEXT,
      'app_tenant_id', v_director.tenant_id::TEXT,
      'centro_id',     v_director.centro_id::TEXT
    );
    RETURN jsonb_build_object('claims', v_claims || v_extra);
  END IF;

  RETURN jsonb_build_object('claims', v_claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
GRANT SELECT ON public.mediators TO supabase_auth_admin;
GRANT SELECT ON public.directors TO supabase_auth_admin;
