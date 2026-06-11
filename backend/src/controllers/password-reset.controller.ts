import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../lib/env';
import logger from '../lib/logger';
import { supabase } from '../lib/supabase';
import { sendPasswordResetEmail } from '../lib/mailer';
import { AuthRequest } from '../middlewares/auth.middleware';

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRONG_PW_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ── POST /api/auth/password-reset/request ─────────────────────
// Usuário informa o e-mail → recebe o link por e-mail.
// Sempre retorna 200 para não revelar se o e-mail existe.
export const requestReset = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 255) {
    return res.status(400).json({ error: 'E-mail inválido' });
  }

  if (!supabase) {
    return res.status(503).json({ error: 'Serviço indisponível' });
  }

  const clientIp = (req.headers['x-forwarded-for'] as string | undefined)
    ?.split(',')[0].trim() ?? req.socket?.remoteAddress ?? null;

  // Busca usuário — silencia erro para não revelar existência do e-mail
  const { data: user } = await supabase
    .from('users')
    .select('id, email, active')
    .eq('email', email.toLowerCase())
    .single();

  // Resposta genérica independente de encontrar ou não o usuário
  const successMsg = { success: true, message: 'Se este e-mail estiver cadastrado, você receberá as instruções em breve.' };

  if (!user || !user.active) {
    logger.info({ email }, '[PasswordReset] E-mail não encontrado ou inativo — nenhuma ação');
    return res.json(successMsg);
  }

  // Invalida tokens anteriores não usados do mesmo usuário
  await supabase
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('used_at', null);

  // Gera token seguro (32 bytes = 64 chars hex)
  const rawToken  = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const { error: insertErr } = await supabase
    .from('password_reset_tokens')
    .insert({
      user_id:      user.id,
      token_hash:   tokenHash,
      expires_at:   expiresAt,
      requested_ip: clientIp,
    });

  if (insertErr) {
    logger.error({ error: insertErr }, '[PasswordReset] Erro ao inserir token');
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;
  const sent     = await sendPasswordResetEmail(user.email, resetUrl);

  if (!sent) {
    // Fallback de desenvolvimento: loga o link para testar sem RESEND configurado
    if (env.NODE_ENV !== 'production') {
      logger.info({ resetUrl }, '[PasswordReset] DEV — link de reset (sem e-mail configurado)');
    }
  }

  logger.info({ userId: user.id }, '[PasswordReset] Solicitação processada');
  return res.json(successMsg);
};

// ── GET /api/auth/password-reset/validate?token=xxx ───────────
// Frontend verifica se o token é válido antes de mostrar o formulário.
export const validateResetToken = async (req: Request, res: Response) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token obrigatório' });
  }

  if (!supabase) return res.status(503).json({ error: 'Serviço indisponível' });

  const tokenHash = hashToken(token);

  const { data } = await supabase
    .from('password_reset_tokens')
    .select('id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .single();

  if (!data)                                return res.status(404).json({ valid: false, error: 'Link inválido ou expirado' });
  if (data.used_at)                         return res.status(410).json({ valid: false, error: 'Este link já foi utilizado' });
  if (new Date(data.expires_at) < new Date()) return res.status(410).json({ valid: false, error: 'Este link expirou. Solicite um novo.' });

  return res.json({ valid: true });
};

// ── POST /api/auth/password-reset/confirm ─────────────────────
// Recebe token + nova senha, atualiza o hash no banco.
export const confirmReset = async (req: Request, res: Response) => {
  const { token, password } = req.body;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token obrigatório' });
  }
  if (!password || typeof password !== 'string' || !STRONG_PW_RE.test(password)) {
    return res.status(400).json({
      error: 'Senha fraca. Use ao menos 8 caracteres com maiúscula, minúscula, número e símbolo',
    });
  }

  if (!supabase) return res.status(503).json({ error: 'Serviço indisponível' });

  const tokenHash = hashToken(token);

  const { data: resetToken } = await supabase
    .from('password_reset_tokens')
    .select('id, user_id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .single();

  if (!resetToken)                                       return res.status(404).json({ error: 'Link inválido ou expirado' });
  if (resetToken.used_at)                               return res.status(410).json({ error: 'Este link já foi utilizado' });
  if (new Date(resetToken.expires_at) < new Date())     return res.status(410).json({ error: 'Este link expirou. Solicite um novo.' });

  const newHash = await bcrypt.hash(password, 12);

  // Atualiza senha
  const { error: updateErr } = await supabase
    .from('users')
    .update({ password_hash: newHash, updated_at: new Date().toISOString() })
    .eq('id', resetToken.user_id);

  if (updateErr) {
    logger.error({ error: updateErr }, '[PasswordReset] Erro ao atualizar senha');
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }

  // Marca token como usado (invalida reuso)
  await supabase
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', resetToken.id);

  logger.info({ userId: resetToken.user_id }, '[PasswordReset] Senha redefinida com sucesso');
  return res.json({ success: true, message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
};

// ── POST /api/admin/users/:userId/reset-password ──────────────
// Admin gera link de reset para qualquer usuário, sem precisar do e-mail deles.
export const adminResetPassword = async (req: AuthRequest, res: Response) => {
  if (!supabase) return res.status(503).json({ error: 'Serviço indisponível' });

  const { userId } = req.params;
  const { data: target } = await supabase
    .from('users')
    .select('id, email, name, active')
    .eq('id', userId)
    .single();

  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });

  // Invalida tokens anteriores
  await supabase
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('used_at', null);

  const rawToken  = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  await supabase
    .from('password_reset_tokens')
    .insert({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt });

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;

  // Também envia e-mail para o usuário se Resend estiver configurado
  void sendPasswordResetEmail(target.email, resetUrl);

  logger.info({ adminId: req.userId, targetUserId: userId }, '[PasswordReset] Admin gerou link de reset');

  return res.json({
    success: true,
    resetUrl,
    email:      target.email,
    name:       target.name,
    expires_at: expiresAt,
  });
};

// ── POST /api/auth/password-reset/change (usuário logado) ─────
// Usuário já autenticado troca a própria senha (sabe a atual).
export const changePassword = async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
  }
  if (!STRONG_PW_RE.test(newPassword)) {
    return res.status(400).json({
      error: 'Senha fraca. Use ao menos 8 caracteres com maiúscula, minúscula, número e símbolo',
    });
  }

  if (!supabase) return res.status(503).json({ error: 'Serviço indisponível' });

  const { data: user } = await supabase
    .from('users')
    .select('id, password_hash')
    .eq('id', req.userId)
    .single();

  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });

  const newHash = await bcrypt.hash(newPassword, 12);
  await supabase
    .from('users')
    .update({ password_hash: newHash, updated_at: new Date().toISOString() })
    .eq('id', req.userId);

  logger.info({ userId: req.userId }, '[PasswordReset] Senha alterada pelo próprio usuário');
  return res.json({ success: true, message: 'Senha alterada com sucesso.' });
};
