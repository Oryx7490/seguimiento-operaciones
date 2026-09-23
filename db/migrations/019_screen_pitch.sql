ALTER TABLE project_screens
  ADD COLUMN pitch_mm numeric;

COMMENT ON COLUMN project_screens.pitch_mm IS 'Pixel pitch en milímetros (ej. 1.2, 1.5, 2.5, 3.9)';
