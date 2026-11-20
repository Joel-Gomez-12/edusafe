-- ============================================================
-- EduSafe · Seguridad (parte 2 de 2) — restricciones
-- ============================================================
-- Aplicar DESPUÉS de desplegar el frontend que usa los objetos de la parte 1
-- (get_case_messages y reports_director).

-- ─── 1. Mensajes cifrados en reposo ─────────────────────────────────────────
-- Todo INSERT/UPDATE de contenido se cifra en la BD, venga del mediador (cliente)
-- o del alumno (edge function). Idempotente: no vuelve a cifrar lo ya cifrado.
CREATE OR REPLACE FUNCTION private.messages_encrypt_trg() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  NEW.content_encrypted := private.encrypt_message(NEW.content_encrypted);
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION private.messages_encrypt_trg() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_messages_encrypt ON public.messages;
CREATE TRIGGER trg_messages_encrypt
  BEFORE INSERT OR UPDATE OF content_encrypted ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.messages_encrypt_trg();

-- Cifrar los mensajes que ya existían en claro
UPDATE public.messages
   SET content_encrypted = private.encrypt_message(content_encrypted)
 WHERE content_encrypted NOT LIKE 'enc:v1:%';

-- ─── 2. Dirección: métricas, no contenidos ──────────────────────────────────
-- messages: solo el mediador que lleva el caso (antes también Dirección).
DROP POLICY IF EXISTS messages_mediator_read ON public.messages;
CREATE POLICY messages_mediator_read ON public.messages
  FOR SELECT TO authenticated
  USING (
    public.auth_role() = 'mediador'
    AND EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = messages.report_id
        AND r.tenant_id = public.auth_tenant_id()
        AND r.assigned_mediator = public.auth_staff_id()
    )
  );

-- reports: solo mediadores del tenant. Dirección usa la vista reports_director.
DROP POLICY IF EXISTS reports_staff_read ON public.reports;
CREATE POLICY reports_staff_read ON public.reports
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND public.auth_role() = 'mediador');

-- Dirección no modifica casos (ninguna pantalla lo hacía).
DROP POLICY IF EXISTS reports_director_update ON public.reports;

-- report_involved: sigue legible por mediación y Dirección (reincidencia), ahora
-- sin depender de que el lector pueda ver la tabla reports.
DROP POLICY IF EXISTS involved_staff_read ON public.report_involved;
CREATE POLICY involved_staff_read ON public.report_involved
  FOR SELECT TO authenticated
  USING (
    public.auth_role() IN ('mediador', 'director')
    AND public.report_in_my_tenant(report_id)
  );

-- evidence_files: solo mediación (las capturas son contenido del caso).
DROP POLICY IF EXISTS evidence_staff_read ON public.evidence_files;
CREATE POLICY evidence_staff_read ON public.evidence_files
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND public.auth_role() = 'mediador');

-- ─── 3. reports: columnas que el personal NO debe poder leer ni tocar ───────
-- device_token y emoji_pattern_hash identifican el dispositivo del denunciante y
-- protegen su acceso; solo los usan las edge functions (service_role). Antes
-- cualquier mediador o director podía leerlos por la API, y un mediador podía
-- reescribirlos en sus casos.
REVOKE ALL ON public.reports FROM anon, authenticated;

GRANT SELECT (
  id, tenant_id, centro_id, case_code, category, zone,
  severity_score, severity_level, status, assigned_mediator, description,
  created_at, last_activity_at, closed_at,
  previ_steps, flagged_as_crime, text_verification
) ON public.reports TO authenticated;

GRANT UPDATE (
  status, assigned_mediator, previ_steps, flagged_as_crime, closed_at
) ON public.reports TO authenticated;
