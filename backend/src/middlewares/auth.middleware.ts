import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env';
import { isRevoked } from '../lib/token-blacklist';

export interface AuthRequest extends Request {
  userId?: string;
  tokenJti?: string;
  tokenExp?: number;
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const token = authHeader.split(' ')[1];

  let decoded: { userId: string; jti?: string; exp?: number };
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as typeof decoded;
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }

  // Checa blacklist — tokens revogados via logout são rejeitados
  if (decoded.jti && await isRevoked(decoded.jti)) {
    return res.status(401).json({ error: 'Sessão encerrada. Faça login novamente.' });
  }

  req.userId   = decoded.userId;
  req.tokenJti = decoded.jti;
  req.tokenExp = decoded.exp;
  next();
};
