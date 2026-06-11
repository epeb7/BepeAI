/**
 * Tenant Service — configuração por usuário empresarial.
 *
 * Cada usuário pode ter:
 *  - logo_base64: logo da empresa, usada em todos os PDFs
 *  - brand_color: cor primária em hex (ex: "#3D5A80")
 *  - company_name: nome da empresa exibido no rodapé do PDF
 *  - template_overrides: mapa de tipo_documento → caminho do template alternativo
 *    ex: { "contrato": "clients/leticiaabreu/contrato",
 *           "proposta_comercial": "clients/leticiaabreu/proposta_comercial" }
 *
 * O campo template_overrides permite que cada tenant use um template
 * diferente para o mesmo tipo de workflow sem criar novos tipos.
 * Templates de clientes ficam em src/templates/clients/<slug>/.
 */

import { supabase, supabaseEnabled } from '../lib/supabase';
import logger from '../lib/logger';

export interface TenantConfig {
  logoBase64:        string | null;
  brandColor:        string | null;
  companyName:       string | null;
  templateOverrides: Record<string, string>;
}

const DEFAULT_CONFIG: TenantConfig = {
  logoBase64:        null,
  brandColor:        null,
  companyName:       null,
  templateOverrides: {},
};

// Cache em memória por processo — TTL 5 min (evita N queries por conversa)
const configCache = new Map<string, { config: TenantConfig; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getTenantConfig(userId: string): Promise<TenantConfig> {
  // Verifica cache
  const cached = configCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.config;

  if (!supabaseEnabled || !supabase) return DEFAULT_CONFIG;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('logo_base64, brand_color, company_name, template_overrides')
      .eq('id', userId)
      .single();

    if (error || !data) return DEFAULT_CONFIG;

    const config: TenantConfig = {
      logoBase64:        data.logo_base64        ?? null,
      brandColor:        data.brand_color        ?? null,
      companyName:       data.company_name       ?? null,
      templateOverrides: (data.template_overrides as Record<string, string>) ?? {},
    };

    configCache.set(userId, { config, expiresAt: Date.now() + CACHE_TTL_MS });
    return config;
  } catch (err) {
    logger.warn({ err, userId }, '[Tenant] Falha ao carregar config do tenant');
    return DEFAULT_CONFIG;
  }
}

// Invalida cache após upload de logo ou mudança de config
export function invalidateTenantCache(userId: string): void {
  configCache.delete(userId);
}

// Resolve qual template usar, aplicando overrides do tenant
export function resolveTemplate(tipoDocumento: string, overrides: Record<string, string>): string {
  return overrides[tipoDocumento] ?? tipoDocumento;
}
