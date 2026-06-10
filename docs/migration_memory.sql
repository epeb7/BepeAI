-- ================================================================
-- BepeAI — Memória adaptativa por usuário + personalização de tom
-- Executar no Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ================================================================

-- ── 1. Memória de campos recorrentes por usuário ──────────────
-- Armazena valores que o usuário repete com frequência entre documentos.
-- Ex: empresa_padrao, cnpj_padrao, endereco_padrao.
-- confidence = contagem de vezes que o valor apareceu — quanto maior, mais confiável.
CREATE TABLE IF NOT EXISTS user_memory (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     TEXT        NOT NULL,
  key         TEXT        NOT NULL,             -- ex: "empresa_contratante", "foro_comarca"
  value       TEXT        NOT NULL,             -- ex: "Tech Soluções Ltda"
  confidence  INTEGER     NOT NULL DEFAULT 1,   -- contagem de aparições
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_user_memory_user_id
  ON user_memory (user_id, confidence DESC);

-- RLS: cada usuário vê apenas sua própria memória
ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_memory_own" ON user_memory
  FOR ALL USING (user_id = auth.uid()::text);

-- Service role bypassa RLS — backend usa service role key
CREATE POLICY "user_memory_service" ON user_memory
  FOR ALL TO service_role USING (true);

-- ── 2. Tom preferido na tabela users ─────────────────────────
-- Permite ao usuário escolher o estilo de resposta da IA.
-- Valores: 'formal' | 'executivo' | 'direto'
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_tone TEXT NOT NULL DEFAULT 'executivo'
  CHECK (preferred_tone IN ('formal', 'executivo', 'direto'));
