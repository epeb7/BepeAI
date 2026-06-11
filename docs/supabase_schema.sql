-- ================================================================
-- BepeAI — Schema SQL completo
-- Executar no Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Aplicar tanto no projeto DEV quanto no projeto PROD
-- ================================================================

-- ── 1. Sessões de workflow (estado do chatbot por usuário) ─────
CREATE TABLE IF NOT EXISTS workflow_sessions (
  id          TEXT        PRIMARY KEY,            -- userId do JWT
  state       JSONB       NOT NULL,               -- WorkflowState serializado
  expires_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Limpeza automática de sessões expiradas (roda diariamente)
CREATE INDEX IF NOT EXISTS idx_workflow_sessions_expires
  ON workflow_sessions (expires_at);

-- ── 2. Conversas (cada sessão de geração de documento) ────────
CREATE TABLE IF NOT EXISTS conversations (
  id            TEXT        PRIMARY KEY,
  user_id       TEXT        NOT NULL,
  workflow_type TEXT,                             -- contrato | proposta_comercial | etc
  title         TEXT,
  status        TEXT        NOT NULL DEFAULT 'in_progress', -- in_progress | completed
  final_data    JSONB,                            -- dados finais do documento gerado
  completed_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id
  ON conversations (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_status
  ON conversations (status);

-- ── 3. Turnos de conversa (cada par pergunta/resposta) ─────────
CREATE TABLE IF NOT EXISTS conversation_turns (
  id               BIGSERIAL   PRIMARY KEY,
  conversation_id  TEXT        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id          TEXT        NOT NULL,
  turn_number      INTEGER     NOT NULL,
  user_message     TEXT        NOT NULL,
  ai_response      TEXT        NOT NULL,
  group_id         TEXT,                          -- grupo do workflow sendo preenchido
  extracted_fields JSONB,                         -- campos extraídos da mensagem
  saved_fields     TEXT[],                        -- campos efetivamente salvos
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_turns_conversation_id
  ON conversation_turns (conversation_id, turn_number);

CREATE INDEX IF NOT EXISTS idx_turns_user_id
  ON conversation_turns (user_id);

-- ── 4. Documentos gerados (registro de cada PDF emitido) ───────
CREATE TABLE IF NOT EXISTS generated_documents (
  id               BIGSERIAL   PRIMARY KEY,
  conversation_id  TEXT        REFERENCES conversations(id) ON DELETE SET NULL,
  document_type    TEXT        NOT NULL,
  field_data       JSONB       NOT NULL,          -- snapshot dos dados no momento da geração
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_docs_conversation
  ON generated_documents (conversation_id);

CREATE INDEX IF NOT EXISTS idx_generated_docs_type
  ON generated_documents (document_type, created_at DESC);

-- ── 5. Usuários da aplicação ──────────────────────────────────
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

-- ── 6. Blacklist de tokens JWT (logout e revogação) ───────────
CREATE TABLE IF NOT EXISTS token_blacklist (
  jti         TEXT        PRIMARY KEY,            -- JWT ID único por token
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires
  ON token_blacklist (expires_at);

-- ── 7. Limpeza automática via pg_cron ────────────────────────
-- Ver: docs/migration_cron_cleanup.sql
-- Ativar a extensão pg_cron primeiro:
--   Supabase Dashboard → Database → Extensions → pg_cron → Enable

-- ── 8. Row Level Security (RLS) ───────────────────────────────
-- Como o backend usa a service_role key, o RLS não bloqueia as
-- queries do servidor. Habilitar RLS nas tabelas para bloquear
-- acesso direto via anon key (ex: alguém chamando a API Supabase
-- diretamente sem passar pelo backend).

ALTER TABLE workflow_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_turns   ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_blacklist      ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;

-- Bloqueia TUDO via anon key — acesso só pelo backend (service_role bypassa RLS)
CREATE POLICY "deny_anon_workflow_sessions"   ON workflow_sessions   FOR ALL USING (false);
CREATE POLICY "deny_anon_conversations"       ON conversations       FOR ALL USING (false);
CREATE POLICY "deny_anon_conversation_turns"  ON conversation_turns  FOR ALL USING (false);
CREATE POLICY "deny_anon_generated_documents" ON generated_documents FOR ALL USING (false);
CREATE POLICY "deny_anon_token_blacklist"     ON token_blacklist     FOR ALL USING (false);
CREATE POLICY "deny_anon_users"               ON users               FOR ALL USING (false);

-- ================================================================
-- Verificação: rode após executar para confirmar as tabelas
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' ORDER BY table_name;
-- ================================================================
