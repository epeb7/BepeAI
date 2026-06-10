/**
 * Session Store — abstração de armazenamento de sessão.
 *
 * Implementação atual: InMemory com TTL e limpeza automática.
 * Para produção com múltiplas instâncias: substituir por RedisSessionStore
 * implementando a mesma interface SessionStore<T>, sem alterar o código chamador.
 *
 * Interface Redis-ready:
 *   import { createClient } from 'redis';
 *   class RedisSessionStore<T> implements SessionStore<T> { ... }
 */

import logger from './logger';

export interface SessionStore<T> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

interface SessionEntry<T> {
  value: T;
  expiresAt: number;
}

class InMemorySessionStore<T> implements SessionStore<T> {
  private readonly store = new Map<string, SessionEntry<T>>();
  private readonly defaultTTLMs: number;

  constructor(defaultTTLSeconds = 86_400) {
    this.defaultTTLMs = defaultTTLSeconds * 1_000;
    // Limpeza de sessões expiradas a cada 10 minutos
    setInterval(() => this.cleanup(), 600_000).unref();
  }

  async get(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttlMs = ttlSeconds != null ? ttlSeconds * 1_000 : this.defaultTTLMs;
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}

/**
 * ResilientSessionStore — Supabase como primário + memória como rede de proteção.
 *
 * - set: escreve no Supabase E espelha na memória (write-through).
 * - get: tenta Supabase; se falhar (rede/instabilidade) OU não encontrar,
 *   usa a cópia em memória. Isso evita que uma queda momentânea do Supabase
 *   apague o workflow ativo do usuário (que seria tratado como "nova conversa").
 * - delete: remove dos dois.
 */
class ResilientSessionStore<T> implements SessionStore<T> {
  constructor(
    private readonly primary: SessionStore<T>,
    private readonly fallback: SessionStore<T>,
  ) {}

  async get(key: string): Promise<T | null> {
    try {
      const fromPrimary = await this.primary.get(key);
      if (fromPrimary !== null) {
        // mantém o espelho aquecido para uma eventual queda futura
        this.fallback.set(key, fromPrimary).catch(() => {});
        return fromPrimary;
      }
    } catch {
      // Supabase indisponível — cai para a memória sem derrubar a sessão
      const fromFallback = await this.fallback.get(key);
      if (fromFallback !== null) {
        logger.warn({ key }, '[Session] Supabase falhou no get — usando fallback em memória');
        return fromFallback;
      }
      return null;
    }
    // primário respondeu null: confirma na memória antes de considerar "sem estado"
    return this.fallback.get(key);
  }

  async set(key: string, value: T, ttlSeconds?: number): Promise<void> {
    // espelho em memória sempre (síncrono e infalível)
    await this.fallback.set(key, value, ttlSeconds);
    try {
      await this.primary.set(key, value, ttlSeconds);
    } catch (err) {
      logger.warn({ err, key }, '[Session] Supabase falhou no set — estado mantido em memória');
    }
  }

  async delete(key: string): Promise<void> {
    await this.fallback.delete(key);
    try {
      await this.primary.delete(key);
    } catch { /* o espelho já foi limpo */ }
  }
}

export function createSessionStore<T>(defaultTTLSeconds?: number): SessionStore<T> {
  // Supabase disponível → primário persistente + memória como fallback;
  // caso contrário, só memória.
  try {
    const { supabaseEnabled } = require('./supabase') as { supabaseEnabled: boolean };
    if (supabaseEnabled) {
      const { SupabaseSessionStore } = require('./supabase.session.store') as {
        SupabaseSessionStore: new (ttl?: number) => SessionStore<T>;
      };
      return new ResilientSessionStore<T>(
        new SupabaseSessionStore(defaultTTLSeconds),
        new InMemorySessionStore<T>(defaultTTLSeconds),
      );
    }
  } catch {
    // supabase não configurado — sem problema
  }
  return new InMemorySessionStore<T>(defaultTTLSeconds);
}
