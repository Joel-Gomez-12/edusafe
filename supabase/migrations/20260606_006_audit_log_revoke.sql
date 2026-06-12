-- ============================================================
-- EduSafe · Fix audit_log — revocar DELETE y UPDATE de authenticated/anon
-- Supabase otorga ALL a authenticated/anon por defecto vía ALTER DEFAULT
-- PRIVILEGES, por eso REVOKE FROM PUBLIC no era suficiente.
-- ============================================================

REVOKE UPDATE, DELETE ON audit_log FROM authenticated, anon, public;
