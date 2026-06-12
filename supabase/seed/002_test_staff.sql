-- ============================================================
-- SEED: Staff de prueba — ejecutar DESPUÉS de crear usuarios en Auth
-- ============================================================

DO $$
DECLARE
  v_mediador_a_id UUID := '3941292d-1809-451e-8690-ad1471b69f3c';
  v_director_a_id UUID := '83e3ab76-7d8f-4770-bc22-6c7e59e9edcc';
  v_mediador_b_id UUID := 'f73c915c-4264-4485-b3da-06c3b1fc3830';
BEGIN

  -- Mediador del Tenant A (IES Cervantes)
  INSERT INTO mediators (id, tenant_id, centro_id, user_id, full_name, email, active)
  VALUES (
    'e0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    v_mediador_a_id,
    'Sofía Mediadora Cervantes',
    'mediador_a@test.edusafe.app',
    true
  ) ON CONFLICT (user_id) DO NOTHING;

  -- Director del Tenant A
  INSERT INTO directors (id, tenant_id, centro_id, user_id, full_name, email, active)
  VALUES (
    'e0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    v_director_a_id,
    'Director Cervantes',
    'director_a@test.edusafe.app',
    true
  ) ON CONFLICT (user_id) DO NOTHING;

  -- Mediador del Tenant B (CEIP Machado)
  INSERT INTO mediators (id, tenant_id, centro_id, user_id, full_name, email, active)
  VALUES (
    'e0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000002',
    v_mediador_b_id,
    'Ramón Mediador Machado',
    'mediador_b@test.edusafe.app',
    true
  ) ON CONFLICT (user_id) DO NOTHING;

  RAISE NOTICE 'Staff insertado correctamente.';
END $$;
