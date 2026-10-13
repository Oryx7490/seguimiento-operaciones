-- 066_attendance_candidates.sql
-- Asistencia derivada de fotos de WhatsApp (V51): candidatos pendientes de revisión
-- humana y segmentos de trabajo que permiten dobles/triples turnos en un mismo día.

CREATE TABLE attendance_candidates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256              char(64) NOT NULL,
  message_id          uuid,
  message_media_id    uuid,
  conversation_id     uuid,
  sender_id           text,
  sender_display_name text,
  technician_id       uuid REFERENCES technicians(id) ON DELETE SET NULL,
  match_status        text NOT NULL DEFAULT 'unknown' CHECK (match_status IN ('matched', 'ambiguous', 'unknown')),
  match_source        text,
  event_type          text CHECK (event_type IN ('entrada', 'salida')),
  event_date          date,
  event_time          time,
  shift_in            time,
  shift_out           time,
  worked_hours        numeric(6,2),
  location            text,
  app                 text,
  code                text,
  confidence          numeric(4,3),
  ambiguity           jsonb NOT NULL DEFAULT '[]'::jsonb,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'registered')),
  reviewed_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sha256)
);
CREATE INDEX idx_attendance_candidates_status ON attendance_candidates (status, event_date DESC);
CREATE INDEX idx_attendance_candidates_tech ON attendance_candidates (technician_id, event_date);

CREATE TABLE attendance_segments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  date          date NOT NULL,
  started_at    time,
  ended_at      time,
  hours         numeric(6,2),
  source        text NOT NULL DEFAULT 'whatsapp',
  candidate_id  uuid REFERENCES attendance_candidates(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attendance_segments_tech_date ON attendance_segments (technician_id, date);

COMMENT ON TABLE attendance_candidates IS
  'Candidatos de asistencia (entrada/salida) derivados de fotos de WhatsApp, pendientes de revisión.';
COMMENT ON TABLE attendance_segments IS
  'Segmentos de trabajo (entrada–salida) por técnico/día; permiten dobles/triples turnos.';
