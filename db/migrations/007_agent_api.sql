-- 007_agent_api.sql
-- Fase 7: API autenticada para agentes/CLI.
-- Tokens con hash (nunca se guarda el token en claro) y usuario de sistema
-- para atribuir las acciones del agente en el historial.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_agent boolean NOT NULL DEFAULT false;

CREATE TABLE agent_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  token_hash   text NOT NULL UNIQUE,
  active       boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE agent_tokens IS 'Credenciales de agentes/CLI. Se guarda el sha256 del token; el valor en claro sólo se muestra al crearlo.';

-- Usuario de sistema que firma las acciones del agente.
INSERT INTO users (name, email, role, is_agent)
VALUES ('Agente CLI', 'agente@seguimiento.local', 'admin', true)
ON CONFLICT (email) DO UPDATE SET is_agent = true;
