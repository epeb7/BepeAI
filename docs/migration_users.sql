-- ================================================================
-- BepeAI — Migração: tabela users + usuários iniciais
-- Executar no Supabase SQL Editor de DEV e de PROD
-- ================================================================

-- ── 1. Criar tabela users ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  name          TEXT,
  role          TEXT        NOT NULL DEFAULT 'user',  -- user | admin
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ── 2. RLS — bloqueia acesso via anon key ─────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_users" ON users FOR ALL USING (false);

-- ── 3. Inserir usuários iniciais ──────────────────────────────
-- Admin principal
INSERT INTO users (id, email, password_hash, name, role, active)
VALUES (
  'admin-1',
  'admin@bepeai.com',
  '$2a$12$1n/XHjnhQpfDmwgY71YNme3q8RRQc.fyYCpC6udgwIrAab14tEt4u',
  'Admin BepeAI',
  'admin',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Usuário de teste (senha: Teste@2025!)
INSERT INTO users (email, password_hash, name, role, active)
VALUES (
  'teste@bepeai.com',
  '$2a$12$NJX1fyLpCzrFxJ2G7QaYLelVoxU3DnpgUGjpQIJmvsuzK0D2C3z.2',
  'Usuário Teste',
  'user',
  true
)
ON CONFLICT (email) DO NOTHING;

-- ── 4. Verificar ──────────────────────────────────────────────
SELECT id, email, name, role, active, created_at FROM users ORDER BY created_at;
