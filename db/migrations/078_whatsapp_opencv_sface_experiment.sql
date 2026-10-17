-- SFace paralelo para evaluación; no cambia embeddings ni asignaciones ArcFace.
CREATE TABLE whatsapp_capture.face_sface_embeddings (
  face_id      uuid NOT NULL REFERENCES whatsapp_capture.faces(id) ON DELETE CASCADE,
  model_name   text NOT NULL DEFAULT 'opencv_sface',
  model_version text NOT NULL,
  embedding    vector(128) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (face_id, model_name, model_version)
);
CREATE INDEX idx_face_sface_embeddings_model
  ON whatsapp_capture.face_sface_embeddings (model_name, model_version);

CREATE TABLE whatsapp_capture.face_sface_suggestions (
  face_id            uuid PRIMARY KEY REFERENCES whatsapp_capture.faces(id) ON DELETE CASCADE,
  identity_id        uuid NOT NULL REFERENCES whatsapp_capture.face_identities(id) ON DELETE CASCADE,
  best_similarity    real NOT NULL CHECK (best_similarity BETWEEN -1 AND 1),
  second_similarity  real CHECK (second_similarity IS NULL OR second_similarity BETWEEN -1 AND 1),
  accepted           boolean NOT NULL DEFAULT false,
  model_version      text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_face_sface_suggestions_identity
  ON whatsapp_capture.face_sface_suggestions (identity_id, accepted);

COMMENT ON TABLE whatsapp_capture.face_sface_embeddings IS
  'Embeddings experimentales OpenCV SFace de 128 dimensiones; no sustituyen los embeddings buffalo_l de 512 dimensiones.';
COMMENT ON TABLE whatsapp_capture.face_sface_suggestions IS
  'Candidatos de identidad experimentales de SFace, derivados solo de asignaciones faciales confirmadas manualmente.';

GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_capture.face_sface_embeddings TO whatsapp_capture_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_capture.face_sface_suggestions TO whatsapp_capture_writer;
