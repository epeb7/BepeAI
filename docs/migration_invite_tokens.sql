-- ================================================================
-- BepeAI — Migração: tabela invite_tokens
-- Sistema de convites por token para self-service de cadastro
-- Executar no Supabase SQL Editor de DEV e de PROD
-- ================================================================

-- ── 1. Criar tabela invite_tokens ─────────────────────────────
CREATE TABLE IF NOT EXISTS invite_tokens (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  token       TEXT        NOT NULL UNIQUE,
  created_by  TEXT        NOT NULL REFERENCES users(id),
  email       TEXT,                          -- opcional: convite para e-mail específico
  used_by     TEXT        REFERENCES users(id),
  used_at     TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_token      ON invite_tokens (token);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_expires_at ON invite_tokens (expires_at);

-- ── 2. RLS — só service_role acessa ──────────────────────────
ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'invite_tokens' AND policyname = 'deny_anon_invite_tokens'
  ) THEN
    CREATE POLICY "deny_anon_invite_tokens" ON invite_tokens FOR ALL USING (false);
  END IF;
END $$;

-- ── 3. Verificar ─────────────────────────────────────────────
SELECT id, token, email, used_at, expires_at, created_at
FROM invite_tokens
ORDER BY created_at DESC;
