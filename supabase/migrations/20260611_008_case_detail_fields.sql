-- Campos adicionales para el detalle del caso (mediador)
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS previ_steps     INTEGER[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS flagged_as_crime BOOLEAN   DEFAULT FALSE;
