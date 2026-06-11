import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { supabase, supabaseEnabled } from '../lib/supabase';

export const adminMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!supabaseEnabled || !supabase || !req.userId) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', req.userId)
    .single();

  if (error || !data || data.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }

  next();
};
