-- 005_gantt_phase_kinds.sql
-- Tipo máquina por fase del catálogo, para colorear/filtrar barras en el Gantt.
ALTER TABLE phase_catalog ADD COLUMN IF NOT EXISTS kind text;

UPDATE phase_catalog SET kind = CASE name
  WHEN 'Planeación'             THEN 'planning'
  WHEN 'Compra'                 THEN 'purchase'
  WHEN 'Fabricación'            THEN 'manufacture'
  WHEN 'Envío por barco'        THEN 'ship_sea'
  WHEN 'Envío cargo aéreo'      THEN 'ship_air'
  WHEN 'Envío por paquetería'   THEN 'ship_courier'
  WHEN 'Importación (aduana)'   THEN 'customs'
  WHEN 'Armado'                 THEN 'assembly'
  WHEN 'Instalación'            THEN 'install'
  WHEN 'Cierre'                 THEN 'close'
  ELSE NULL
END WHERE kind IS NULL;