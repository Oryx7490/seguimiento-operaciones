ALTER TABLE project_screens
  ADD COLUMN voltage text;

ALTER TABLE project_screens
  ADD CONSTRAINT screen_voltage_check CHECK (voltage IS NULL OR voltage IN ('110ac', '220ac'));