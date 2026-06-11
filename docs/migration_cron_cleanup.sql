-- ================================================================
-- migration_cron_cleanup.sql
-- Configura pg_cron para limpeza automática de dados expirados.
--
-- PRÉ-REQUISITO:
--   Ativar a extensão pg_cron no Supabase Dashboard antes de rodar:
--   Database → Extensions → pg_cron → Enable
--
-- COMO RODAR:
--   Supabase Dashboard → SQL Editor → colar e executar
-- ================================================================

-- Remove entradas antigas da blacklist de tokens JWT (tokens expirados)
-- Roda todo dia às 03:00 UTC
SELECT cron.schedule(
  'cleanup-token-blacklist',
  '0 3 * * *',
  $$DELETE FROM token_blacklist WHERE expires_at < NOW()$$
);

-- Remove sessões de workflow expiradas
-- Roda todo dia às 03:05 UTC
SELECT cron.schedule(
  'cleanup-workflow-sessions',
  '5 3 * * *',
  $$DELETE FROM workflow_sessions WHERE expires_at < NOW()$$
);

-- Remove tokens de reset de senha expirados ou já utilizados (> 24h)
-- Roda todo dia às 03:10 UTC
SELECT cron.schedule(
  'cleanup-password-reset-tokens',
  '10 3 * * *',
  $$DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR (used_at IS NOT NULL AND used_at < NOW() - INTERVAL '24 hours')$$
);

-- ── Verificação ───────────────────────────────────────────────
-- Após executar, confirme os jobs com:
-- SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;
