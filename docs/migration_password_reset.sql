-- ================================================================
-- BepeAI — Migração: tabela password_reset_tokens
-- Tokens de uso único para redefinição de senha via e-mail
-- Executar no Supabase SQL Editor de DEV e de PROD
-- ================================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,   -- SHA-256 do token enviado por e-mail
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_prt_token_hash  ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user_id     ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_prt_expires_at  ON password_reset_tokens (expires_at);

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'password_reset_tokens' AND policyname = 'deny_anon_prt'
  ) THEN
    CREATE POLICY "deny_anon_prt" ON password_reset_tokens FOR ALL USING (false);
  END IF;
END $$;

-- ── Verificar ────────────────────────────────────────────────
SELECT id, user_id, expires_at, used_at, created_at FROM password_reset_tokens ORDER BY created_at DESC;
