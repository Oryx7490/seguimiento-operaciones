CREATE TABLE IF NOT EXISTS presence_sessions (
  id           text PRIMARY KEY,
  user_id      text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presence_sessions_last_seen ON presence_sessions (last_seen_at);