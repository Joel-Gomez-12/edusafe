-- ============================================================
-- SEED: Datos de prueba para Sprint 1 — aislamiento cross-tenant
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ⚠️  SOLO para entorno de desarrollo. No ejecutar en producción.
-- ============================================================

-- ----------------------------------------------------------
-- Tenant A: IES Cervantes (Madrid)
-- ----------------------------------------------------------
INSERT INTO tenants (id, display_name, slug, type, plan, contact_email, active) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'IES Cervantes',
  'ies-cervantes',
  'centro_individual',
  'pilot',
  'admin@ies-cervantes.test',
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO centros (id, tenant_id, nombre, direccion, municipio, provincia, active) VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'IES Cervantes — Sede Central',
  'Calle Alcalá 42',
  'Madrid',
  'Madrid',
  true
) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------
-- Tenant B: CEIP Machado (Sevilla)
-- ----------------------------------------------------------
INSERT INTO tenants (id, display_name, slug, type, plan, contact_email, active) VALUES (
  'a0000000-0000-0000-0000-000000000002',
  'CEIP Machado',
  'ceip-machado',
  'centro_individual',
  'pilot',
  'admin@ceip-machado.test',
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO centros (id, tenant_id, nombre, direccion, municipio, provincia, active) VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000002',
  'CEIP Machado — Sevilla',
  'Avenida de la Constitución 15',
  'Sevilla',
  'Sevilla',
  true
) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------
-- Alumnos de prueba (Tenant A)
-- ----------------------------------------------------------
INSERT INTO students (id, centro_id, tenant_id, external_id, full_name, curso, grupo, active) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'EST001', 'Ana García López', '3ºESO', 'A', true),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'EST002', 'Carlos Martín Ruiz', '3ºESO', 'A', true),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'EST003', 'Laura Sánchez Pérez', '4ºESO', 'B', true)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------
-- Alumnos de prueba (Tenant B)
-- ----------------------------------------------------------
INSERT INTO students (id, centro_id, tenant_id, external_id, full_name, curso, grupo, active) VALUES
  ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'EST001', 'Pedro Jiménez Torres', '5ºPRIM', 'A', true),
  ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'EST002', 'María Rodríguez Vega', '5ºPRIM', 'B', true)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------
-- Reporte de prueba en Tenant A
-- ----------------------------------------------------------
INSERT INTO reports (
  id, tenant_id, centro_id, case_code,
  device_token, emoji_pattern_hash,
  category, description,
  status, severity_score, severity_level,
  assigned_mediator
) VALUES (
  'd0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'MA0001',
  'dev-token-test-001',
  'hashed-emoji-test',
  'verbal',
  'Un compañero me insulta todos los días en el recreo y me quita el bocadillo.',
  'nuevo',
  65,
  'alta',
  NULL
) ON CONFLICT (id) DO NOTHING;

-- Reporte de prueba en Tenant B
INSERT INTO reports (
  id, tenant_id, centro_id, case_code,
  device_token, emoji_pattern_hash,
  category, description,
  status, severity_score, severity_level,
  assigned_mediator
) VALUES (
  'd0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000002',
  'CM0001',
  'dev-token-test-002',
  'hashed-emoji-test-2',
  'exclusion',
  'Me dejan fuera del grupo en los trabajos de clase.',
  'nuevo',
  40,
  'media',
  NULL
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Después de ejecutar este seed:
-- 1. Crea los usuarios staff en Supabase Auth → Users → Add user
--    mediador_a@test.edusafe.app  (Tenant A, rol mediador)
--    director_a@test.edusafe.app  (Tenant A, rol director)
--    mediador_b@test.edusafe.app  (Tenant B, rol mediador)
-- 2. Copia sus UUIDs y ejecuta 002_test_staff.sql
-- ============================================================
