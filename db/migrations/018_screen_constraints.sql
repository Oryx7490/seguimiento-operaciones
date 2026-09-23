ALTER TABLE project_screens
  ADD CONSTRAINT screen_dims_regular
  CHECK (
    (is_irregular = false AND width_m IS NOT NULL AND height_m IS NOT NULL)
    OR (is_irregular = true AND area_m2 IS NOT NULL)
  );

COMMENT ON CONSTRAINT screen_dims_regular ON project_screens IS
  'Regular: width_m + height_m requeridos. Irregular: area_m2 requerido.';