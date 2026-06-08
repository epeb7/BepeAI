import 'dotenv/config';
import app from './app';
import { env } from './lib/env';
import logger from './lib/logger';

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, '🚀 BepeAI backend iniciado');
});

// ── Graceful shutdown ─────────────────────────────────────────
// Aguarda conexões ativas terminarem antes de fechar (máx 10s).
// Garante que PDFs em geração e writes no Supabase não sejam cortados.
function shutdown(signal: string) {
  logger.info({ signal }, '[Server] Sinal recebido — iniciando graceful shutdown');

  server.close((err) => {
    if (err) {
      logger.error({ err }, '[Server] Erro ao fechar servidor');
      process.exit(1);
    }
    logger.info('[Server] Servidor fechado com sucesso');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('[Server] Timeout de shutdown — forçando encerramento');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, '[Server] Uncaught exception — encerrando');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, '[Server] Unhandled rejection — encerrando');
  process.exit(1);
});
