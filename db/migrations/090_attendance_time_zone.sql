-- 090_attendance_time_zone.sql
-- Zona horaria del lugar de la foto (V88). La hora de la marca de agua es local al
-- lugar; Cancún (UTC-5) y el norte (UTC-7/-8) no siguen la hora del centro.
ALTER TABLE attendance_candidates ADD COLUMN IF NOT EXISTS time_zone text;
ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS time_zone text;

-- Backfill de candidatos existentes a partir de la ubicación detectada.
UPDATE attendance_candidates
   SET time_zone = CASE
     WHEN location ~* '(cancun|quintana roo|chetumal|playa del carmen|tulum|bacalar|isla mujeres|cozumel)' THEN 'America/Cancun'
     WHEN location ~* '(baja california sur|la paz|cabo san lucas|san jos[eé] del cabo|mazatlan|sinaloa|culiacan|los mochis)' THEN 'America/Mazatlan'
     WHEN location ~* '(tijuana|mexicali|ensenada|tecate|rosarito|baja california)' THEN 'America/Tijuana'
     WHEN location ~* '(ciudad ju[aá]rez|ju[aá]rez)' THEN 'America/Ciudad_Juarez'
     WHEN location ~* '(chihuahua|delicias|cuauht[eé]moc)' THEN 'America/Chihuahua'
     WHEN location ~* '(hermosillo|sonora|nogales|obreg[oó]n|guaymas)' THEN 'America/Hermosillo'
     WHEN location ~* '(monterrey|nuevo le[oó]n|saltillo|coahuila|tamaulipas|reynosa|matamoros|torre[oó]n)' THEN 'America/Monterrey'
     ELSE 'America/Mexico_City'
   END
 WHERE time_zone IS NULL;

COMMENT ON COLUMN attendance_candidates.time_zone IS 'Zona horaria inferida de la ubicación de la foto (IANA).';
