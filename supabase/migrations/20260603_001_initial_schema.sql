-- ============================================================
-- EduSafe · Schema inicial · Sprint 1
-- Supabase Postgres (region: eu-central-1 / Frankfurt)
-- ============================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─────────────────────────────────────────────────────────────
-- TABLA: tenants
-- Una fila por organización cliente
-- ─────────────────────────────────────────────────────────────
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('centro_individual','grupo_escolar','ayuntamiento')),
  plan          TEXT NOT NULL DEFAULT 'pilot'
                CHECK (plan IN ('pilot','basic','pro','premium')),
  contact_email TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  active        BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_tenants_slug ON tenants(slug);

-- ─────────────────────────────────────────────────────────────
-- TABLA: centros
-- Centros educativos. Un tenant tiene 1..N centros.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE centros (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  codigo_oficial  TEXT,
  direccion       TEXT,
  municipio       TEXT,
  provincia       TEXT,
  tipo            TEXT CHECK (tipo IN ('publico','concertado','privado')),
  num_alumnos     INTEGER,
  zona_horaria    TEXT DEFAULT 'Europe/Madrid',
  csv_uploaded_at TIMESTAMPTZ,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_centros_tenant ON centros(tenant_id);
CREATE INDEX idx_centros_slug   ON centros(tenant_id, nombre);

-- ─────────────────────────────────────────────────────────────
-- TABLA: mediators
-- Staff con rol mediador — autenticado con Supabase Auth
-- ─────────────────────────────────────────────────────────────
CREATE TABLE mediators (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  centro_id  UUID NOT NULL REFERENCES centros(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL UNIQUE,          -- auth.users(id)
  full_name  TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  phone      TEXT,
  active     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mediators_tenant ON mediators(tenant_id);
CREATE INDEX idx_mediators_centro ON mediators(centro_id);

-- ─────────────────────────────────────────────────────────────
-- TABLA: directors
-- Staff con rol director — autenticado con Supabase Auth
-- ─────────────────────────────────────────────────────────────
CREATE TABLE directors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  centro_id  UUID NOT NULL REFERENCES centros(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL UNIQUE,
  full_name  TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  active     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_directors_tenant ON directors(tenant_id);

-- ─────────────────────────────────────────────────────────────
-- TABLA: students
-- Censo del centro. Espejo del SIS. Sin Supabase Auth.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE students (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  centro_id     UUID NOT NULL REFERENCES centros(id) ON DELETE CASCADE,
  external_id   TEXT,
  full_name     TEXT NOT NULL,
  curso         TEXT NOT NULL,
  grupo         TEXT NOT NULL,
  nacido_en     DATE,
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('spanish', full_name)
  ) STORED
);

CREATE INDEX idx_students_search ON students USING GIN (search_vector);
CREATE INDEX idx_students_centro ON students(centro_id);
CREATE UNIQUE INDEX idx_students_external ON students(centro_id, external_id)
  WHERE external_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- TABLA: reports
-- La denuncia. Tabla más sensible. RLS ultra-restrictivo.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE reports (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  centro_id          UUID NOT NULL REFERENCES centros(id) ON DELETE CASCADE,
  case_code          TEXT UNIQUE NOT NULL,
  device_token       TEXT NOT NULL,
  emoji_pattern_hash TEXT NOT NULL,
  category           TEXT CHECK (category IN
    ('verbal','fisico','exclusion','ciberacoso','sexual','otros')),
  zone               TEXT,
  severity_score     SMALLINT CHECK (severity_score BETWEEN 0 AND 100),
  severity_level     TEXT CHECK (severity_level IN ('baja','media','alta','critica')),
  status             TEXT NOT NULL DEFAULT 'nuevo'
                     CHECK (status IN
    ('nuevo','asignado','en_investigacion','resuelto','derivado','archivado')),
  assigned_mediator  UUID REFERENCES mediators(id),
  description        TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  last_activity_at   TIMESTAMPTZ DEFAULT now(),
  closed_at          TIMESTAMPTZ
);

CREATE INDEX idx_reports_centro       ON reports(centro_id, status);
CREATE INDEX idx_reports_case_code    ON reports(case_code);
CREATE INDEX idx_reports_device_token ON reports(device_token);
CREATE INDEX idx_reports_mediator     ON reports(assigned_mediator) WHERE assigned_mediator IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- TABLA: report_involved
-- Triángulo de identidades. El denunciante NUNCA aparece aquí.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE report_involved (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('victima','agresor','testigo')),
  added_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (report_id, student_id, role)
);

CREATE INDEX idx_involved_student ON report_involved(student_id);
CREATE INDEX idx_involved_report  ON report_involved(report_id);

-- ─────────────────────────────────────────────────────────────
-- TABLA: messages
-- Chat anónimo. Cifrado AES-256-GCM via Supabase Vault.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  sender_type       TEXT NOT NULL CHECK (sender_type IN ('alumno','mediador','sistema')),
  sender_id         UUID,                -- NULL si alumno (anonimato)
  content_encrypted BYTEA NOT NULL,      -- AES-256-GCM
  created_at        TIMESTAMPTZ DEFAULT now(),
  read_at           TIMESTAMPTZ
);

CREATE INDEX idx_messages_report ON messages(report_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- TABLA: evidence_files
-- Evidencias subidas por el alumno o el mediador
-- ─────────────────────────────────────────────────────────────
CREATE TABLE evidence_files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_id    UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  size_bytes   BIGINT NOT NULL,
  sha256_hash  TEXT NOT NULL,
  uploaded_by  UUID,   -- NULL si alumno anónimo
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_evidence_report ON evidence_files(report_id);

-- ─────────────────────────────────────────────────────────────
-- TABLA: actas
-- Documentos generados al cerrar un caso.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE actas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_id        UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('borrador','final')),
  csv_code         TEXT UNIQUE NOT NULL,   -- Código Seguro de Verificación (8 chars)
  sha256_hash      TEXT NOT NULL,
  pdf_storage_path TEXT NOT NULL,
  generated_by     UUID NOT NULL REFERENCES mediators(id),
  generated_at     TIMESTAMPTZ DEFAULT now(),
  snapshot         JSONB NOT NULL           -- estado del reporte al firmarse
);

CREATE INDEX idx_actas_csv    ON actas(csv_code);
CREATE INDEX idx_actas_report ON actas(report_id);

-- ─────────────────────────────────────────────────────────────
-- TABLA: audit_log
-- Append-only — UPDATE y DELETE bloqueados a nivel DB.
-- Esta tabla blinda al director ante cualquier inspección.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  actor_type    TEXT NOT NULL CHECK (actor_type IN ('mediador','director','sistema','alumno')),
  actor_id      UUID,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   UUID NOT NULL,
  details       JSONB,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_resource   ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_tenant_time ON audit_log(tenant_id, created_at DESC);

-- Bloquear UPDATE y DELETE — audit_log es inmutable
REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

-- Solo INSERT permitido en audit_log
CREATE POLICY audit_log_insert_only ON audit_log
  FOR INSERT WITH CHECK (true);

CREATE POLICY audit_log_select_director ON audit_log
  FOR SELECT USING (
    tenant_id = (auth.jwt() ->> 'app_tenant_id')::uuid
    AND auth.jwt() ->> 'role' IN ('director','mediador')
  );
