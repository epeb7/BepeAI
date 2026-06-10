-- ================================================================
-- BepeAI — Migração: tabela files (upload de arquivos Fase 1)
-- Executar no Supabase SQL Editor de DEV e de PROD
-- ================================================================

-- ── 1. Criar tabela files ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS files (
  id                TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id           TEXT        NOT NULL,
  conversation_id   TEXT,                              -- conversa onde foi anexado (pode ser null)
  original_filename TEXT        NOT NULL,
  storage_path      TEXT        NOT NULL,              -- caminho no bucket Supabase Storage
  mime_type         TEXT        NOT NULL,
  size_bytes        BIGINT      NOT NULL,
  extracted_text    TEXT,                              -- texto extraído (null se extração falhar)
  status            TEXT        NOT NULL DEFAULT 'ready', -- ready | extract_failed
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_conversation
  ON files (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_files_user
  ON files (user_id, created_at DESC);

-- ── 2. RLS — bloqueia acesso via anon key ─────────────────────
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_files" ON files FOR ALL USING (false);

-- ── 3. Bucket de Storage ──────────────────────────────────────
-- Criar o bucket "uploads" como PRIVADO no Dashboard:
--   Supabase Dashboard → Storage → New bucket → nome: "uploads", Public: OFF
-- O backend acessa via service_role key (bypassa as policies do bucket).

-- ── 4. Verificar ──────────────────────────────────────────────
SELECT id, user_id, conversation_id, original_filename, mime_type, size_bytes, status, created_at
  FROM files ORDER BY created_at DESC LIMIT 10;
