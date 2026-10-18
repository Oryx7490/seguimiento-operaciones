-- 092_overtime_9_45.sql
-- Jornada regular: 9 h/día (9:00–18:00 con 1 h de comida) y 45 h/semana (V91).
-- El bloque se recorre si el técnico entra más tarde; el sobrante es hora extra.
UPDATE app_settings SET value = '9'::jsonb, updated_at = now() WHERE key = 'overtime_daily_hours';
UPDATE app_settings SET value = '45'::jsonb, updated_at = now() WHERE key = 'overtime_weekly_hours';
