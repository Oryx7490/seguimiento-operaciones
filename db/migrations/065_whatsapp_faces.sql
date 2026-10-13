-- 065_whatsapp_faces.sql
-- Reconocimiento facial (V49): detección + embeddings por foto, identidades
-- (enlazadas a técnicos/usuarios), asignaciones revisables y versiones de modelo.
-- Requiere la extensión pgvector en PostgreSQL.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE whatsapp_capture.faces (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256        char(64) NOT NULL REFERENCES whatsapp_capture.media_objects(sha256) ON DELETE CASCADE,
  media_id      uuid,
  bbox          jsonb NOT NULL,
  bbox_key      text NOT NULL,
  det_score     real,
  embedding     vector(512) NOT NULL,
  model_name    text NOT NULL DEFAULT 'buffalo_l',
  model_version text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sha256, model_name, bbox_key)
);
CREATE INDEX idx_faces_sha ON whatsapp_capture.faces (sha256);
CREATE INDEX idx_faces_embedding ON whatsapp_capture.faces USING hnsw (embedding vector_cosine_ops);

CREATE TABLE whatsapp_capture.face_identities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  text NOT NULL,
  technician_id uuid REFERENCES technicians(id) ON DELETE SET NULL,
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  centroid      vector(512),
  face_count    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_face_identities_technician ON whatsapp_capture.face_identities (technician_id) WHERE technician_id IS NOT NULL;
CREATE UNIQUE INDEX idx_face_identities_user ON whatsapp_capture.face_identities (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE whatsapp_capture.face_assignments (
  face_id     uuid PRIMARY KEY REFERENCES whatsapp_capture.faces(id) ON DELETE CASCADE,
  identity_id uuid NOT NULL REFERENCES whatsapp_capture.face_identities(id) ON DELETE CASCADE,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'model')),
  confidence  real,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_face_assignments_identity ON whatsapp_capture.face_assignments (identity_id);

-- Versiones de modelo (centroides y cabeza clasificadora entrenada de noche).
CREATE TABLE whatsapp_capture.face_models (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN ('centroids', 'classifier')),
  version    integer NOT NULL,
  params     jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics    jsonb NOT NULL DEFAULT '{}'::jsonb,
  active     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_face_models_kind ON whatsapp_capture.face_models (kind, created_at DESC);

COMMENT ON TABLE whatsapp_capture.faces IS
  'Rostros detectados por foto (sha256), con embedding ArcFace de 512 dimensiones.';
COMMENT ON TABLE whatsapp_capture.face_identities IS
  'Identidades faciales; se enlazan a un técnico o usuario del sistema para enrolamiento.';
COMMENT ON TABLE whatsapp_capture.face_assignments IS
  'Asignación revisable de un rostro a una identidad (manual o sugerida por el modelo).';
COMMENT ON TABLE whatsapp_capture.face_models IS
  'Versiones del modelo: centroides por identidad y cabeza clasificadora reentrenada.';
