-- Fase de un proyecto puede marcarse como no aplicable
-- (p. ej. "Envío por barco" no aplica a un proyecto que no importa mercancía).
ALTER TYPE project_phase_status ADD VALUE IF NOT EXISTS 'not_applicable';