-- ============================================================
-- TEST: Aislamiento cross-tenant con RLS
-- Ejecutar en Supabase → SQL Editor (como postgres / service_role)
--
-- El test simula el JWT de mediador_a (Tenant A) y verifica que
-- NO puede ver datos del Tenant B.
-- ============================================================

-- Helpers: simular el contexto JWT de un usuario autenticado
-- Supabase RLS usa request.jwt.claims para evaluar las políticas

BEGIN;

-- ── Test 1: Mediador A solo ve reportes de su tenant ─────────────────────────
SET LOCAL request.jwt.claims = '{
  "sub": "00000000-0000-0000-0000-000000000000",
  "role": "authenticated",
  "iss": "supabase",
  "edusafe_role": "mediador",
  "app_tenant_id": "a0000000-0000-0000-0000-000000000001",
  "staff_id": "e0000000-0000-0000-0000-000000000001",
  "centro_id": "b0000000-0000-0000-0000-000000000001"
}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count_own   INT;
  v_count_other INT;
BEGIN
  -- Reportes de su propio tenant (debe ver 1)
  SELECT COUNT(*) INTO v_count_own FROM reports
  WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001';

  -- Reportes del tenant ajeno (debe ver 0)
  SELECT COUNT(*) INTO v_count_other FROM reports
  WHERE tenant_id = 'a0000000-0000-0000-0000-000000000002';

  RAISE NOTICE '── Test 1: Mediador A ve reportes propios: % (esperado 1)', v_count_own;
  RAISE NOTICE '── Test 1: Mediador A ve reportes ajenos: % (esperado 0)', v_count_other;

  IF v_count_other > 0 THEN
    RAISE EXCEPTION 'FAIL: Mediador A puede ver reportes del Tenant B — revisar RLS en reports';
  END IF;
  IF v_count_own = 0 THEN
    RAISE EXCEPTION 'FAIL: Mediador A no puede ver sus propios reportes — revisar seed o RLS';
  END IF;

  RAISE NOTICE 'PASS: Test 1 superado';
END $$;

-- ── Test 2: Mediador A no puede ver alumnos del Tenant B ─────────────────────
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM students
  WHERE tenant_id = 'a0000000-0000-0000-0000-000000000002';

  RAISE NOTICE '── Test 2: Mediador A ve alumnos ajenos: % (esperado 0)', v_count;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'FAIL: Mediador A puede ver alumnos del Tenant B — revisar RLS en students';
  END IF;

  RAISE NOTICE 'PASS: Test 2 superado';
END $$;

-- ── Test 3: Mediador A no puede modificar reportes ajenos ────────────────────
DO $$
BEGIN
  BEGIN
    UPDATE reports
    SET status = 'en_investigacion'
    WHERE id = 'd0000000-0000-0000-0000-000000000002'; -- reporte Tenant B

    IF FOUND THEN
      RAISE EXCEPTION 'FAIL: Mediador A pudo modificar un reporte del Tenant B — RLS roto';
    ELSE
      RAISE NOTICE 'PASS: Test 3 — UPDATE sobre reporte ajeno devuelve 0 filas (correcto)';
    END IF;
  END;
END $$;

-- ── Test 4: audit_log — solo lectura, no se puede borrar ─────────────────────
DO $$
BEGIN
  BEGIN
    DELETE FROM audit_log WHERE id IS NOT NULL;
    RAISE EXCEPTION 'FAIL: Se pudo borrar de audit_log — revisar REVOKE DELETE';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: Test 4 — DELETE en audit_log bloqueado correctamente';
  END;
END $$;

ROLLBACK; -- Nunca commitear los cambios de test

-- ============================================================
-- Resultado esperado en el panel de mensajes de Supabase:
--   PASS: Test 1 superado
--   PASS: Test 2 superado
--   PASS: Test 3 — UPDATE sobre reporte ajeno devuelve 0 filas (correcto)
--   PASS: Test 4 — DELETE en audit_log bloqueado correctamente
-- ============================================================
