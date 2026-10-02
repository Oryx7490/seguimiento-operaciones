-- La procedencia (propio/cliente/tercero) deja de ser atributo del catálogo.
-- Se anota en los comentarios de planeación de cada proyecto.
ALTER TABLE controller_catalog DROP CONSTRAINT IF EXISTS controller_catalog_ownership_check;
ALTER TABLE controller_catalog DROP COLUMN IF EXISTS ownership;
