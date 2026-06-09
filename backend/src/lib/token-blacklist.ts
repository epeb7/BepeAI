/**
 * Token Blacklist — invalida JWTs antes do vencimento natural.
 *
 * Estratégia dual:
 *  - Supabase disponível → persiste na tabela token_blacklist (sobrevive a restarts)
 *  - Sem Supabase         → Set em memória com limpeza automática por expiração
 *
 * Tokens são identificados pelo campo `jti` (JWT ID) — UUID único por emissão.
 * Ao verificar um token, o middleware checa se o jti está bloqueado.
 */

import { supabase, supabaseEnabled } from './supabase';
import logger from './logger';

// ── Fallback: Set em memória com expiração ────────────────────
interface MemEntry { expiresAt: number }
const memBlacklist = new Map<string, MemEntry>();

// Limpa tokens já expirados a cada 10 minutos (evita memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [jti, entry] of memBlacklist) {
    if (entry.expiresAt <= now) memBlacklist.delete(jti);
  }
}, 10 * 60 * 1000).unref(); // .unref() não impede o processo de encerrar

// ── API pública ────────────────────────────────────────────────

/**
 * Adiciona um token à blacklist.
 * @param jti     Identificador único do JWT (campo `jti`)
 * @param exp     Timestamp de expiração em segundos (campo `exp` do JWT)
 */
export async function revokeToken(jti: string, exp: number): Promise<void> {
  const expiresAt = exp * 1000; // converte para ms

  if (supabaseEnabled && supabase) {
    const { error } = await supabase
      .from('token_blacklist')
      .insert({ jti, expires_at: new Date(expiresAt).toISOString() });

    if (error) {
      logger.warn({ err: error, jti }, '[TokenBlacklist] Falha ao persistir no Supabase — usando memória');
      memBlacklist.set(jti, { expiresAt });
    } else {
      logger.debug({ jti }, '[TokenBlacklist] Token revogado no Supabase');
    }
  } else {
    memBlacklist.set(jti, { expiresAt });
    logger.debug({ jti }, '[TokenBlacklist] Token revogado em memória');
  }
}

/**
 * Verifica se um token está na blacklist.
 * @returns true se o token foi revogado (deve rejeitar a requisição)
 */
export async function isRevoked(jti: string): Promise<boolean> {
  if (supabaseEnabled && supabase) {
    const { data, error } = await supabase
      .from('token_blacklist')
      .select('jti')
      .eq('jti', jti)
      .maybeSingle();

    if (error) {
      // Falha ao consultar Supabase — nega por segurança, cai no fallback de memória
      logger.warn({ err: error, jti }, '[TokenBlacklist] Falha ao consultar Supabase — verificando memória');
      return memBlacklist.has(jti);
    }
    return !!data;
  }

  const entry = memBlacklist.get(jti);
  if (!entry) return false;
  if (entry.expiresAt <= Date.now()) { memBlacklist.delete(jti); return false; }
  return true;
}
