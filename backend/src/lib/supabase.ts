/**
 * Supabase client — backend usa service_role key que bypassa RLS legitimamente.
 * NUNCA expor service_role key no frontend.
 *
 * Fallback para anon key se service_role não estiver configurada (dev/test).
 */

import { createClient } from '@supabase/supabase-js';
import logger from './logger';

const url  = process.env.SUPABASE_URL;
// Preferência: service_role (produção) → anon (dev fallback)
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  logger.warn('[Supabase] Credenciais não configuradas — persistência desativada');
} else if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  logger.warn(
    '[Supabase] Usando ANON KEY — adequado apenas para desenvolvimento. ' +
    'Configure SUPABASE_SERVICE_ROLE_KEY para produção.'
  );
}

export const supabase = url && key
  ? createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export const supabaseEnabled = !!supabase;
