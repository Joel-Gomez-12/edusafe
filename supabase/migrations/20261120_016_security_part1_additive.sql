-- ============================================================
-- EduSafe · Seguridad (parte 1 de 2) — cambios aditivos
-- ============================================================
-- Esta parte solo AÑADE objetos y corrige el audit_log; es compatible con el
-- frontend anterior. La parte 2 (017) aplica las restricciones una vez que el
-- frontend nuevo ya usa estos objetos.

-- ─── 0. Esquema privado ─────────────────────────────────────────────────────
-- No está expuesto por la API: sus funciones no se pueden llamar vía /rest/v1/rpc.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- ─── 1. Funciones existentes: search_path fijo y sin EXECUTE innecesario ────
ALTER FUNCTION public.auth_tenant_id()         SET search_path = public;
ALTER FUNCTION public.auth_staff_id()          SET search_path = public;
ALTER FUNCTION public.auth_role()              SET search_path = public;
ALTER FUNCTION public.update_report_activity() SET search_path = public;
ALTER FUNCTION public.log_report_changes()     SET search_path = public;
ALTER FUNCTION public.log_message_read()       SET search_path = public;
-- Son funciones de trigger: nadie necesita llamarlas por RPC.
REVOKE EXECUTE ON FUNCTION public.log_report_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_message_read()   FROM PUBLIC, anon, authenticated;

-- ─── 2. audit_log: solo el servidor escribe; Dirección lee el de su tenant ──
-- Antes: cualquiera con la clave pública podía INSERTAR filas falsas (policy
-- WITH CHECK (true)) y nadie podía leerlo (la policy miraba el claim "role",
-- que siempre vale "authenticated").
-- Escriben: los triggers SECURITY DEFINER y las edge functions (service_role).
DROP POLICY IF EXISTS audit_log_insert_only     ON public.audit_log;
DROP POLICY IF EXISTS audit_log_select_director ON public.audit_log;
DROP POLICY IF EXISTS audit_log_director_read   ON public.audit_log;
CREATE POLICY audit_log_director_read ON public.audit_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND public.auth_role() = 'director');

REVOKE ALL ON public.audit_log FROM anon, authenticated;
GRANT SELECT ON public.audit_log TO authenticated;

-- ─── 3. Límite de intentos de la llave de emojis ────────────────────────────
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS access_failed_count SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS access_locked_until TIMESTAMPTZ;

-- ─── 4. Cifrado de mensajes (AES-256, clave en Supabase Vault) ──────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'edusafe_messages_key') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'edusafe_messages_key',
      'Clave AES-256 de messages.content_encrypted (EduSafe)'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.msg_key() RETURNS TEXT
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edusafe_messages_key' LIMIT 1
$$;

-- Formato almacenado: 'enc:v1:' + base64(OpenPGP simétrico con AES-256).
-- El prefijo permite convivir con filas antiguas en claro durante la transición.
CREATE OR REPLACE FUNCTION private.encrypt_message(p TEXT) RETURNS TEXT
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF p IS NULL OR p LIKE 'enc:v1:%' THEN RETURN p; END IF;
  RETURN 'enc:v1:' || encode(
    extensions.pgp_sym_encrypt(p, private.msg_key(), 'cipher-algo=aes256'), 'base64');
END $$;

CREATE OR REPLACE FUNCTION private.decrypt_message(p TEXT) RETURNS TEXT
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF p IS NULL OR p NOT LIKE 'enc:v1:%' THEN RETURN p; END IF;
  RETURN extensions.pgp_sym_decrypt(decode(substr(p, 8), 'base64'), private.msg_key());
END $$;

REVOKE EXECUTE ON FUNCTION private.msg_key()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.encrypt_message(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.decrypt_message(TEXT) FROM PUBLIC, anon, authenticated;

-- ─── 5. Lectura de mensajes por el mediador asignado (descifra y audita) ────
-- Marca como leídos los mensajes del alumno; el trigger trg_audit_message_read
-- deja en audit_log quién leyó cada mensaje, como exige el handoff.
CREATE OR REPLACE FUNCTION public.get_case_messages(p_report_id UUID)
RETURNS TABLE (id UUID, sender_type TEXT, content TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  -- Solo quien lleva el caso. Se comprueba por auth.uid(), sin depender de los claims.
  IF NOT EXISTS (
    SELECT 1
    FROM public.reports r
    JOIN public.mediators med ON med.id = r.assigned_mediator
    WHERE r.id = p_report_id AND med.user_id = auth.uid() AND med.active
  ) THEN
    RETURN;
  END IF;

  UPDATE public.messages m
     SET read_at = now()
   WHERE m.report_id = p_report_id AND m.sender_type = 'alumno' AND m.read_at IS NULL;

  RETURN QUERY
    SELECT m.id, m.sender_type, private.decrypt_message(m.content_encrypted), m.created_at
    FROM public.messages m
    WHERE m.report_id = p_report_id
    ORDER BY m.created_at;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_case_messages(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_case_messages(UUID) TO authenticated;

-- Variante para la edge function chat-access (alumno): solo service_role.
CREATE OR REPLACE FUNCTION public.get_case_messages_service(p_report_id UUID)
RETURNS TABLE (id UUID, sender_type TEXT, content TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.id, m.sender_type, private.decrypt_message(m.content_encrypted), m.created_at
  FROM public.messages m
  WHERE m.report_id = p_report_id
  ORDER BY m.created_at
$$;

REVOKE EXECUTE ON FUNCTION public.get_case_messages_service(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_case_messages_service(UUID) TO service_role;

-- ─── 6. Vista de reportes para Dirección: métricas, no contenidos ───────────
-- Dirección deja de leer la tabla reports (parte 2) y usa esta vista, que no
-- expone el relato salvo en casos escalados como posible delito, donde Dirección
-- sí debe actuar. Nunca expone device_token ni la llave.
CREATE OR REPLACE FUNCTION public.director_reports()
RETURNS TABLE (
  id UUID, tenant_id UUID, centro_id UUID, case_code TEXT, category TEXT, zone TEXT,
  severity_level TEXT, status TEXT, flagged_as_crime BOOLEAN,
  created_at TIMESTAMPTZ, closed_at TIMESTAMPTZ, description TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.id, r.tenant_id, r.centro_id, r.case_code, r.category, r.zone,
         r.severity_level, r.status, COALESCE(r.flagged_as_crime, FALSE),
         r.created_at, r.closed_at,
         CASE WHEN r.flagged_as_crime THEN r.description END
  FROM public.reports r
  WHERE r.tenant_id IN (
    SELECT d.tenant_id FROM public.directors d WHERE d.user_id = auth.uid() AND d.active
  )
$$;

REVOKE EXECUTE ON FUNCTION public.director_reports() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.director_reports() TO authenticated;

CREATE OR REPLACE VIEW public.reports_director
  WITH (security_invoker = true)
  AS SELECT * FROM public.director_reports();

REVOKE ALL ON public.reports_director FROM anon, authenticated;
GRANT SELECT ON public.reports_director TO authenticated;

-- ─── 7. Ayuda para policies: ¿el reporte es de mi tenant? ───────────────────
-- Permite que report_involved siga siendo legible por Dirección cuando ya no
-- pueda leer reports directamente.
CREATE OR REPLACE FUNCTION public.report_in_my_tenant(p_report_id UUID) RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = p_report_id AND r.tenant_id = public.auth_tenant_id()
  )
$$;

REVOKE EXECUTE ON FUNCTION public.report_in_my_tenant(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.report_in_my_tenant(UUID) TO authenticated;
