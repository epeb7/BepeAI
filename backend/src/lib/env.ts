/**
 * Environment Configuration — validação na startup.
 *
 * Falha rápido se variável crítica ausente. Expõe valores tipados
 * para o resto da aplicação (sem process.env espalhado pelo código).
 */

interface Env {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  GROQ_API_KEY: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  FRONTEND_URL: string;
  ALLOWED_ORIGINS: string[];
  // Fallback de autenticação (usado quando tabela users não está disponível)
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD_HASH: string | null;
  ADMIN_PASSWORD: string | null;
  SUPABASE_URL: string | null;
  SUPABASE_SERVICE_ROLE_KEY: string | null;
  SUPABASE_ANON_KEY: string | null;
  LOG_LEVEL: string;
}

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`[ENV] Variável obrigatória ausente: ${name}`);
  return val;
}

function optional(name: string): string | null {
  return process.env[name] ?? null;
}

function validateJwtSecret(secret: string): void {
  const isProd = process.env.NODE_ENV === 'production';

  if (secret.length < 32) {
    throw new Error(
      `[ENV] JWT_SECRET muito curto (${secret.length} chars). Mínimo: 32 caracteres. ` +
      'Gere um seguro com: openssl rand -hex 32'
    );
  }

  // Detecta qualquer padrão óbvio de valor padrão/inseguro
  const padroesFracos = ['mudar', 'change', 'secret', 'example', 'test', 'dev', 'default', '1234', 'bepeai'];
  const isFraco = padroesFracos.some(p => secret.toLowerCase().includes(p));

  if (isFraco) {
    const msg = '[ENV] JWT_SECRET parece ser um valor padrão inseguro. Troque antes de usar em produção. Use: openssl rand -hex 32';
    if (isProd) throw new Error(msg);
    console.warn('⚠️  ' + msg);
  }

  // Em produção, exige entropia mínima: pelo menos 48 chars ou 64 hex chars
  if (isProd && secret.length < 48) {
    throw new Error(
      `[ENV] JWT_SECRET em produção deve ter no mínimo 48 caracteres (atual: ${secret.length}). ` +
      'Gere com: openssl rand -hex 32'
    );
  }
}

function parseOrigins(raw: string): string[] {
  return raw.split(',').map(o => o.trim()).filter(Boolean);
}

function load(): Env {
  const jwtSecret = required('JWT_SECRET');
  validateJwtSecret(jwtSecret);

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  const allowedOriginsRaw = process.env.ALLOWED_ORIGINS ?? frontendUrl;

  return {
    PORT: parseInt(process.env.PORT ?? '3001', 10),
    NODE_ENV: (process.env.NODE_ENV ?? 'development') as Env['NODE_ENV'],
    GROQ_API_KEY: required('GROQ_API_KEY'),
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '7d',
    FRONTEND_URL: frontendUrl,
    ALLOWED_ORIGINS: parseOrigins(allowedOriginsRaw),
    ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? 'admin@bepeai.com',
    ADMIN_PASSWORD_HASH: optional('ADMIN_PASSWORD_HASH'),
    ADMIN_PASSWORD: optional('ADMIN_PASSWORD'),
    SUPABASE_URL: optional('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: optional('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_ANON_KEY: optional('SUPABASE_ANON_KEY'),
    LOG_LEVEL: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  };
}

export const env = load();
