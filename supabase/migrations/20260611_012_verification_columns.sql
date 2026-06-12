-- Columnas para guardar resultados de verificación anti-IA
-- reports.text_verification: resultado del análisis del relato del alumno
-- evidence_files.verification: resultado del análisis de cada imagen/archivo

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS text_verification jsonb DEFAULT NULL;

ALTER TABLE evidence_files
  ADD COLUMN IF NOT EXISTS verification jsonb DEFAULT NULL;
