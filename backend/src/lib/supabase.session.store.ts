/**
 * SupabaseSessionStore — implementação de SessionStore<T> usando Supabase.
 * Substitui o InMemorySessionStore, adicionando persistência real.
 * TTL é controlado pela coluna expires_at.
 */

import { SessionStore } from './session.store';
import { supabase } from './supabase';
import logger from './logger';

export class SupabaseSessionStore<T> implements SessionStore<T> {
  constructor(private readonly defaultTTLSeconds = 86_400) {}

  async get(key: string): Promise<T | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('workflow_sessions')
        .select('state, expires_at')
        .eq('id', key)
        .single();

      if (error || !data) return null;

      if (new Date(data.expires_at) < new Date()) {
        await this.delete(key);
        return null;
      }

      return data.state as T;
    } catch (err) {
      logger.error({ err, key }, '[SupabaseStore] Erro em get');
      return null;
    }
  }

  async set(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (!supabase) return;
    const ttl = ttlSeconds ?? this.defaultTTLSeconds;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    try {
      const { error } = await supabase
        .from('workflow_sessions')
        .upsert(
          { id: key, state: value, expires_at: expiresAt, updated_at: new Date().toISOString() },
          { onConflict: 'id' }
        );

      if (error) logger.error({ error, key }, '[SupabaseStore] Erro em set');
    } catch (err) {
      logger.error({ err, key }, '[SupabaseStore] Erro em set (exception)');
    }
  }

  async delete(key: string): Promise<void> {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('workflow_sessions')
        .delete()
        .eq('id', key);

      if (error) logger.error({ error, key }, '[SupabaseStore] Erro em delete');
    } catch (err) {
      logger.error({ err, key }, '[SupabaseStore] Erro em delete (exception)');
    }
  }
}
