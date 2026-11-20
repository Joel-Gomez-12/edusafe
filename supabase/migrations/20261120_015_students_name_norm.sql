-- ============================================================
-- EduSafe · Búsqueda de alumnos sin tildes
-- ============================================================
-- El buscador del asistente de reporte comparaba con ILIKE sobre full_name, que
-- distingue tildes: escribir "Maria" no encontraba a "María". Desde el móvil es
-- lo habitual escribir sin tildes.
--
-- Se añade una columna generada con el nombre normalizado (minúsculas, sin tildes)
-- y un índice trigram para que el ILIKE '%texto%' siga siendo rápido con censos
-- grandes. La edge function students-search normaliza igual el texto buscado.

-- Función pura e inmutable (requisito para usarla en una columna generada).
CREATE OR REPLACE FUNCTION public.edusafe_norm(t TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT lower(translate(
    t,
    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
  ))
$$;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS name_norm TEXT
  GENERATED ALWAYS AS (public.edusafe_norm(full_name)) STORED;

CREATE INDEX IF NOT EXISTS idx_students_name_norm
  ON public.students USING GIN (name_norm gin_trgm_ops);
