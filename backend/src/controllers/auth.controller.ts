import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../lib/env';
import logger from '../lib/logger';
import { revokeToken } from '../lib/token-blacklist';
import { AuthRequest } from '../middlewares/auth.middleware';

const ADMIN_EMAIL = env.ADMIN_EMAIL;

const ADMIN_PASSWORD_HASH: string = (() => {
  if (env.ADMIN_PASSWORD_HASH) return env.ADMIN_PASSWORD_HASH;
  if (env.ADMIN_PASSWORD) {
    const hash = bcrypt.hashSync(env.ADMIN_PASSWORD, 12);
    logger.warn('[Auth] ADMIN_PASSWORD_HASH não definido — hash gerado em runtime. Use ADMIN_PASSWORD_HASH em produção.');
    return hash;
  }
  throw new Error('[Auth] Configure ADMIN_PASSWORD_HASH ou ADMIN_PASSWORD no .env');
})();

// ── Login ──────────────────────────────────────────────────────

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  // Timing-safe: sempre executa bcrypt.compare mesmo com email errado
  const emailMatch   = email === ADMIN_EMAIL;
  const passwordValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);

  if (!emailMatch || !passwordValid) {
    logger.warn({ email }, '[Auth] Tentativa de login inválida');
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  // jti (JWT ID) único por sessão — permite revogar token individualmente no logout
  const jti = uuidv4();

  const token = jwt.sign(
    { userId: 'admin-1', email, jti },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as `${number}${'s'|'m'|'h'|'d'}` }
  );

  logger.info({ email, jti }, '[Auth] Login bem-sucedido');
  return res.json({ success: true, token });
};

// ── Logout ─────────────────────────────────────────────────────

export const logout = async (req: AuthRequest, res: Response) => {
  const jti = req.tokenJti;
  const exp = req.tokenExp;

  if (jti && exp) {
    await revokeToken(jti, exp);
    logger.info({ userId: req.userId, jti }, '[Auth] Logout — token revogado');
  }

  return res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
};
