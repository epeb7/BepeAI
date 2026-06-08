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

export function createSessionStore<T>(defaultTTLSeconds?: number): SessionStore<T> {
  // Supabase disponível → usa persistência real; caso contrário, fallback para memória
  try {
    const { supabaseEnabled } = require('./supabase') as { supabaseEnabled: boolean };
    if (supabaseEnabled) {
      const { SupabaseSessionStore } = require('./supabase.session.store') as {
        SupabaseSessionStore: new (ttl?: number) => SessionStore<T>;
      };
      return new SupabaseSessionStore(defaultTTLSeconds);
    }
  } catch {
    // supabase não configurado — sem problema
  }
  return new InMemorySessionStore<T>(defaultTTLSeconds);
}
