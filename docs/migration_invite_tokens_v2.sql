-- ================================================================
-- BepeAI — Migração v2: enriquecimento de invite_tokens
-- Adiciona campos de auditoria e rastreabilidade completa
-- Executar no Supabase SQL Editor de DEV e de PROD
-- ================================================================

-- ── 1. Adicionar colunas de auditoria (idempotente) ───────────

-- Número sequencial do usuário que usou o convite (join com users)
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS
  used_by_name    TEXT;                     -- nome do usuário que usou

ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS
  used_by_email   TEXT;                     -- e-mail do usuário que usou (desnormalizado para auditoria)

-- IP e user-agent de quem usou o convite
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS
  used_ip         TEXT;                     -- endereço IP de quem se registrou

ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS
  used_user_agent TEXT;                     -- browser/device de quem se registrou

-- Nota opcional do admin ao criar o convite
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS
  note            TEXT;                     -- ex: "convite para cliente Acme Corp"

-- Número de vezes que o link foi acessado (validações sem uso)
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS
  view_count      INTEGER NOT NULL DEFAULT 0;  -- quantas vezes /validate foi chamado

ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS
  last_viewed_at  TIMESTAMPTZ;              -- última vez que o link foi aberto

-- ── 2. View de auditoria completa (JOIN com users) ────────────
CREATE OR REPLACE VIEW invite_tokens_audit AS
SELECT
  it.id,
  it.token,
  it.note,

  -- Quem criou
  it.created_by                       AS created_by_id,
  uc.name                             AS created_by_name,
  uc.email                            AS created_by_email,
  it.created_at,

  -- Destino do convite
  it.email                            AS target_email,
  it.expires_at,

  -- Uso
  it.used_at,
  it.used_by                          AS used_by_id,
  it.used_by_name,
  it.used_by_email,
  it.used_ip,
  it.used_user_agent,

  -- Acessos
  it.view_count,
  it.last_viewed_at,

  -- Status calculado
  CASE
    WHEN it.used_at IS NOT NULL     THEN 'usado'
    WHEN it.expires_at < NOW()      THEN 'expirado'
    ELSE                                 'ativo'
  END                                 AS status

FROM invite_tokens it
LEFT JOIN users uc ON uc.id = it.created_by
ORDER BY it.created_at DESC;

-- ── 3. Função de incremento atômico de visualizações ─────────
CREATE OR REPLACE FUNCTION increment_invite_view(p_id TEXT)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE invite_tokens
  SET view_count     = view_count + 1,
      last_viewed_at = NOW()
  WHERE id = p_id;
$$;

-- ── 4. Verificar ─────────────────────────────────────────────
SELECT
  id, note, target_email, status,
  created_by_name, created_at,
  used_by_name, used_by_email, used_ip, used_at,
  view_count
FROM invite_tokens_audit;
