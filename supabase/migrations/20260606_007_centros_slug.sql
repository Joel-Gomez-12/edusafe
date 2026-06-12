-- ============================================================
-- Añade slug a centros — necesario para resolver el centro
-- desde el header X-Centro-Slug enviado por el frontend.
-- El slug se genera a partir del slug del tenant + sufijo numérico
-- si hay varios centros por tenant.
-- ============================================================

ALTER TABLE centros ADD COLUMN IF NOT EXISTS slug TEXT;

-- Índice único para búsqueda rápida
CREATE UNIQUE INDEX IF NOT EXISTS idx_centros_slug ON centros(slug) WHERE slug IS NOT NULL;

-- Rellenar el seed de prueba
UPDATE centros SET slug = 'ies-cervantes-central'
  WHERE id = 'b0000000-0000-0000-0000-000000000001';

UPDATE centros SET slug = 'ceip-machado-sevilla'
  WHERE id = 'b0000000-0000-0000-0000-000000000002';
