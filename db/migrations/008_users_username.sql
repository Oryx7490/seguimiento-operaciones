-- 008_users_username.sql
-- El correo deja de ser obligatorio: algunos técnicos no tienen.
-- Se agrega `username` como identificador alternativo de la cuenta.
-- Toda cuenta debe conservar al menos uno de los dos (correo o usuario).

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key
  ON users (lower(username)) WHERE username IS NOT NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_or_username;
ALTER TABLE users ADD CONSTRAINT users_email_or_username
  CHECK (email IS NOT NULL OR username IS NOT NULL);
