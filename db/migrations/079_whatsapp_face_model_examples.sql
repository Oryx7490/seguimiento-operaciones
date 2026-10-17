-- Conserva la lista exacta de rostros humanos usados por cada versión entrenada.
CREATE TABLE whatsapp_capture.face_model_examples (
  model_id     uuid NOT NULL REFERENCES whatsapp_capture.face_models(id) ON DELETE CASCADE,
  face_id      uuid NOT NULL REFERENCES whatsapp_capture.faces(id) ON DELETE CASCADE,
  identity_id  uuid NOT NULL REFERENCES whatsapp_capture.face_identities(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (model_id, face_id)
);
CREATE INDEX idx_face_model_examples_identity
  ON whatsapp_capture.face_model_examples (identity_id, model_id);

COMMENT ON TABLE whatsapp_capture.face_model_examples IS
  'Instantánea de los ejemplos faciales confirmados que se usaron en cada versión de centroides o clasificador.';

GRANT SELECT, INSERT ON whatsapp_capture.face_model_examples TO whatsapp_capture_writer;
