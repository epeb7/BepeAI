import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../lib/env';
import logger from '../lib/logger';
import { revokeToken } from '../lib/token-blacklist';
import { AuthRequest } from '../middlewares/auth.middleware';
import { supabase } from '../lib/supabase';

interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  active: boolean;
}

async function findUserByEmail(email: string): Promise<DbUser | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('users')
    .select('id, email, password_hash, role, active')
    .eq('email', email)
    .single();
  if (error || !data) return null;
  return data as DbUser;
}

// ── Login ──────────────────────────────────────────────────────

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }
  if (email.length > 255 || password.length > 128) {
    return res.status(400).json({ error: 'Credenciais inválidas' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Credenciais inválidas' });
  }

  let userId: string;
  let passwordHash: string;

  const dbUser = await findUserByEmail(email);

  if (dbUser) {
    // Usuário encontrado na tabela users
    if (!dbUser.active) {
      logger.warn({ email }, '[Auth] Login bloqueado — usuário inativo');
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    userId = dbUser.id;
    passwordHash = dbUser.password_hash;
  } else {
    // Fallback: admin via env vars (compatibilidade durante migração)
    const adminEmail = env.ADMIN_EMAIL;
    const adminHash  = env.ADMIN_PASSWORD_HASH
      ?? (env.ADMIN_PASSWORD ? bcrypt.hashSync(env.ADMIN_PASSWORD, 12) : null);

    if (!adminHash) {
      logger.warn({ email }, '[Auth] Tentativa de login inválida — sem usuário e sem fallback env');
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Timing-safe: bcrypt roda mesmo com email errado
    const emailMatch = email === adminEmail;
    const valid      = await bcrypt.compare(password, adminHash);
    if (!emailMatch || !valid) {
      logger.warn({ email }, '[Auth] Tentativa de login inválida');
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    userId       = 'admin-1';
    passwordHash = adminHash;
  }

  const passwordValid = dbUser
    ? await bcrypt.compare(password, passwordHash)
    : true; // já validado acima no fallback

  if (dbUser && !passwordValid) {
    logger.warn({ email }, '[Auth] Tentativa de login inválida');
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const role = dbUser?.role ?? 'admin'; // fallback env = admin

  const jti = uuidv4();
  const token = jwt.sign(
    { userId, email, role, jti },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as `${number}${'s'|'m'|'h'|'d'}` }
  );

  logger.info({ email, userId, role, jti }, '[Auth] Login bem-sucedido');
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
