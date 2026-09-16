-- 003_logistics_phases.sql
-- Etapas adicionales de proyectos: compra, fabricación, envío e importación.
-- El proveedor puede estar fuera de inventario (compra) y la mercancía suele
-- fabricarse en China y enviarse por barco, aéreo o paquetería (aduana).

INSERT INTO phase_catalog (name, sort_order) VALUES
  ('Compra',                 2),
  ('Fabricación',            3),
  ('Envío por barco',        4),
  ('Envío cargo aéreo',      5),
  ('Envío por paquetería',   6),
  ('Importación (aduana)',   7);

UPDATE phase_catalog SET sort_order = 8  WHERE name = 'Armado'      AND sort_order = 2;
UPDATE phase_catalog SET sort_order = 9  WHERE name = 'Instalación' AND sort_order = 3;
UPDATE phase_catalog SET sort_order = 10 WHERE name = 'Cierre'      AND sort_order = 4;

DELETE FROM phase_catalog WHERE name = 'Prueba Fase X';
DELETE FROM priorities   WHERE name = 'Prueba Prioridad';
DELETE FROM internal_activity_types WHERE name = 'Prueba interna';