-- ============================================================
-- EduSafe · Row Level Security — Políticas obligatorias
-- Sprint 1 · CRÍTICO: sin esto la app es insegura por diseño
-- ============================================================

-- ─── Helpers ────────────────────────────────────────────────
-- Devuelve el tenant_id del JWT del usuario autenticado
CREATE OR REPLACE FUNCTION auth_tenant_id() RETURNS UUID
  LANGUAGE sql STABLE AS $$
    SELECT (auth.jwt() ->> 'app_tenant_id')::uuid
  $$;

-- Devuelve el staff_id del JWT
CREATE OR REPLACE FUNCTION auth_staff_id() RETURNS UUID
  LANGUAGE sql STABLE AS $$
    SELECT (auth.jwt() ->> 'staff_id')::uuid
  $$;

-- Devuelve el role del JWT
CREATE OR REPLACE FUNCTION auth_role() RETURNS TEXT
  LANGUAGE sql STABLE AS $$
    SELECT auth.jwt() ->> 'role'
  $$;

-- ─── tenants ────────────────────────────────────────────────
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Solo super-admin (service_role) puede leer/editar tenants
-- El staff normal no tiene acceso directo a esta tabla

-- ─── centros ────────────────────────────────────────────────
ALTER TABLE centros ENABLE ROW LEVEL SECURITY;

CREATE POLICY centros_staff_read ON centros
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_role() IN ('mediador','director')
  );

-- ─── mediators ──────────────────────────────────────────────
ALTER TABLE mediators ENABLE ROW LEVEL SECURITY;

CREATE POLICY mediators_self_read ON mediators
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_role() IN ('mediador','director')
  );

-- ─── directors ──────────────────────────────────────────────
ALTER TABLE directors ENABLE ROW LEVEL SECURITY;

CREATE POLICY directors_self_read ON directors
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_role() = 'director'
  );

-- ─── students ───────────────────────────────────────────────
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Mediador y director pueden ver el censo de su tenant
CREATE POLICY students_staff_read ON students
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_role() IN ('mediador','director')
  );
-- INSERTs solo vía edge function centros.sync (service_role)

-- ─── reports ────────────────────────────────────────────────
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Mediador y director leen reportes de su tenant
CREATE POLICY reports_staff_read ON reports
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_role() IN ('mediador','director')
  );

-- Mediador puede actualizar solo sus casos asignados
CREATE POLICY reports_mediator_update ON reports
  FOR UPDATE USING (
    tenant_id = auth_tenant_id()
    AND assigned_mediator = auth_staff_id()
    AND auth_role() = 'mediador'
  );

-- Director puede actualizar cualquier reporte de su tenant
CREATE POLICY reports_director_update ON reports
  FOR UPDATE USING (
    tenant_id = auth_tenant_id()
    AND auth_role() = 'director'
  );

-- Alumnos crean reportes SOLO vía edge function (service_role)
-- No se da policy INSERT directa a anon

-- ─── report_involved ────────────────────────────────────────
ALTER TABLE report_involved ENABLE ROW LEVEL SECURITY;

CREATE POLICY involved_staff_read ON report_involved
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_involved.report_id
        AND r.tenant_id = auth_tenant_id()
        AND auth_role() IN ('mediador','director')
    )
  );

CREATE POLICY involved_mediator_write ON report_involved
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_involved.report_id
        AND r.tenant_id = auth_tenant_id()
        AND r.assigned_mediator = auth_staff_id()
    )
  );

-- ─── messages ───────────────────────────────────────────────
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Solo el mediador asignado puede leer mensajes del reporte
CREATE POLICY messages_mediator_read ON messages
  FOR SELECT USING (
    auth_role() IN ('mediador','director')
    AND EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = messages.report_id
        AND r.tenant_id = auth_tenant_id()
        AND (
          r.assigned_mediator = auth_staff_id()
          OR auth_role() = 'director'
        )
    )
  );

-- Mediador puede insertar mensajes en sus casos
CREATE POLICY messages_mediator_insert ON messages
  FOR INSERT WITH CHECK (
    auth_role() = 'mediador'
    AND sender_type = 'mediador'
    AND sender_id = auth_staff_id()
    AND EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = messages.report_id
        AND r.tenant_id = auth_tenant_id()
        AND r.assigned_mediator = auth_staff_id()
    )
  );

-- Alumno inserta mensajes SOLO vía edge function (service_role)

-- ─── evidence_files ─────────────────────────────────────────
ALTER TABLE evidence_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY evidence_staff_read ON evidence_files
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_role() IN ('mediador','director')
  );

-- ─── actas ──────────────────────────────────────────────────
ALTER TABLE actas ENABLE ROW LEVEL SECURITY;

-- Mediador lee actas de su tenant
CREATE POLICY actas_mediator_read ON actas
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_role() IN ('mediador','director')
  );

-- El INSERT lo hace la edge function actas.generate (service_role)

-- ─── Trigger: last_activity_at en reports ───────────────────
CREATE OR REPLACE FUNCTION update_report_activity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.last_activity_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_report_activity
  BEFORE UPDATE ON reports
  FOR EACH ROW
  EXECUTE FUNCTION update_report_activity();

-- ─── Trigger: auto audit_log en cambios de reports ──────────
CREATE OR REPLACE FUNCTION log_report_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO audit_log (
    tenant_id, actor_type, actor_id, action,
    resource_type, resource_id, details
  ) VALUES (
    NEW.tenant_id,
    COALESCE(auth_role(), 'sistema'),
    auth_staff_id(),
    CASE TG_OP
      WHEN 'INSERT' THEN 'report.created'
      WHEN 'UPDATE' THEN 'report.updated'
    END,
    'report',
    NEW.id,
    jsonb_build_object(
      'old_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      'new_status', NEW.status,
      'assigned_mediator', NEW.assigned_mediator
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_reports
  AFTER INSERT OR UPDATE ON reports
  FOR EACH ROW
  EXECUTE FUNCTION log_report_changes();

-- ─── Trigger: auto audit_log en mensajes leídos ─────────────
CREATE OR REPLACE FUNCTION log_message_read()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.read_at IS NULL AND NEW.read_at IS NOT NULL THEN
    INSERT INTO audit_log (
      tenant_id, actor_type, actor_id, action,
      resource_type, resource_id
    )
    SELECT
      r.tenant_id,
      COALESCE(auth_role(), 'sistema'),
      auth_staff_id(),
      'message.read',
      'message',
      NEW.id
    FROM reports r WHERE r.id = NEW.report_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_message_read
  AFTER UPDATE OF read_at ON messages
  FOR EACH ROW
  EXECUTE FUNCTION log_message_read();
