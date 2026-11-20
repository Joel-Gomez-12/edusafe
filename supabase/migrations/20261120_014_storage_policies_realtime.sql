-- ============================================================
-- EduSafe · Storage policies + realtime del chat
-- ============================================================
-- 1) Los buckets 'actas' y 'evidence' son privados y no tenían ninguna policy,
--    así que el mediador no podía generar enlaces firmados desde el cliente
--    (archivo de actas → "No se pudo generar el enlace de descarga").
--    Se permite SOLO lectura, SOLO al mediador y SOLO dentro de la carpeta de
--    su tenant (la ruta de cada objeto es <tenant_id>/<report_id>/<archivo>).
--    Dirección queda fuera a propósito: ve métricas, no contenidos.
--    Las subidas siguen siendo exclusivas de las edge functions (service_role).

DROP POLICY IF EXISTS "actas_mediador_read" ON storage.objects;
CREATE POLICY "actas_mediador_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'actas'
    AND public.auth_role() = 'mediador'
    AND (storage.foldername(name))[1] = public.auth_tenant_id()::text
  );

DROP POLICY IF EXISTS "evidence_mediador_read" ON storage.objects;
CREATE POLICY "evidence_mediador_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidence'
    AND public.auth_role() = 'mediador'
    AND (storage.foldername(name))[1] = public.auth_tenant_id()::text
  );

-- 2) El chat del mediador ya se suscribe a los INSERT de messages, pero la tabla
--    no estaba en la publicación de realtime y nunca recibía nada (solo polling).
--    Realtime respeta RLS: cada mediador recibe únicamente lo que puede leer.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
