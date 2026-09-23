ALTER TABLE project_screens
  ADD COLUMN width_m      numeric,
  ADD COLUMN height_m     numeric,
  ADD COLUMN is_irregular boolean NOT NULL DEFAULT false,
  ADD COLUMN area_m2      numeric;

UPDATE project_screens SET
  width_m  = NULLIF(regexp_replace(split_part(dimensions, 'x', 1), '[^0-9.]', '', 'g'), '')::numeric,
  height_m = NULLIF(regexp_replace(split_part(dimensions, 'x', 2), '[^0-9.]', '', 'g'), '')::numeric
WHERE dimensions IS NOT NULL AND dimensions <> ''
  AND split_part(dimensions, 'x', 2) <> '';

ALTER TABLE project_screens DROP COLUMN dimensions;

ALTER TABLE attachments ADD COLUMN screen_id uuid REFERENCES project_screens(id) ON DELETE CASCADE;

ALTER TABLE attachments DROP CONSTRAINT attachment_exactly_one_entity;

ALTER TABLE attachments ADD CONSTRAINT attachment_exactly_one_entity
  CHECK (
    (project_id IS NOT NULL)::int
    + (ticket_id IS NOT NULL)::int
    + (screen_id IS NOT NULL)::int = 1
  );

CREATE INDEX IF NOT EXISTS idx_attachments_screen ON attachments(screen_id) WHERE screen_id IS NOT NULL;

COMMENT ON TABLE attachments IS 'attachment_type incluye delivery_sheet, digital_signature, finiquito, fiscal_complement para el cierre; screen_id liga documentos (fichas técnicas PDF) a una pantalla del proyecto.';