import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../lib/env';
import logger from '../lib/logger';

/**
 * Auth Controller — fase dev: usuário único via variáveis de ambiente.
 *
 * Migração para multi-tenant (P3):
 *  - Substituir MOCK_USER por UserRepository com Supabase
 *  - Adicionar endpoint POST /auth/register
 *  - JWT payload passa a incluir { userId, email, orgId, plan }
 */

// Hash gerado uma única vez na startup — sem re-hashing a cada requisição
const ADMIN_EMAIL = env.ADMIN_EMAIL;
const ADMIN_PASSWORD_HASH: string = (() => {
  if (env.ADMIN_PASSWORD_HASH) return env.ADMIN_PASSWORD_HASH;
  if (env.ADMIN_PASSWORD) {
    const hash = bcrypt.hashSync(env.ADMIN_PASSWORD, 12);
    logger.warn(
      '[Auth] ADMIN_PASSWORD_HASH não definido — hash gerado em runtime. ' +
      'Para produção, use ADMIN_PASSWORD_HASH pré-gerado.'
    );
    return hash;
  }
  throw new Error('[Auth] Configure ADMIN_PASSWORD_HASH ou ADMIN_PASSWORD no .env');
})();

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  // Timing-safe: sempre executa bcrypt.compare, mesmo com email errado
  // Evita timing attack que revela quais emails existem
  const emailMatch = email === ADMIN_EMAIL;
  const passwordValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);

  if (!emailMatch || !passwordValid) {
    logger.warn({ email }, '[Auth] Tentativa de login inválida');
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const token = jwt.sign(
    { userId: 'admin-1', email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as `${number}${'s'|'m'|'h'|'d'}` }
  );

  logger.info({ email }, '[Auth] Login bem-sucedido');
  return res.json({ success: true, token });
};
