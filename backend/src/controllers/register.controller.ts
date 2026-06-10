import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../lib/env';
import logger from '../lib/logger';
import { supabase } from '../lib/supabase';
import { AuthRequest } from '../middlewares/auth.middleware';

// ── Helpers ────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Senha forte: ≥8 chars, ao menos 1 maiúscula, 1 minúscula, 1 dígito, 1 especial */
const STRONG_PW_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

function sanitizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 80);
}

// ── Validate invite token ──────────────────────────────────────

/**
 * GET /api/auth/invite/validate?token=xxx
 * Verifica se o token é válido e não foi usado, sem consumi-lo.
 * Usado pelo frontend antes de mostrar o formulário de cadastro.
 */
export const validateInvite = async (req: Request, res: Response) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token de convite obrigatório' });
  }

  if (!supabase) {
    return res.status(503).json({ error: 'Serviço indisponível' });
  }

  const { data, error } = await supabase
    .from('invite_tokens')
    .select('id, email, expires_at, used_at')
    .eq('token', token)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Convite inválido ou não encontrado' });
  }

  if (data.used_at) {
    return res.status(410).json({ error: 'Este convite já foi utilizado' });
  }

  if (new Date(data.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Este convite expirou' });
  }

  // Registra visualização: incremento atômico via SQL direto (fire-and-forget)
  void supabase.rpc('increment_invite_view', { p_id: data.id });

  return res.json({
    valid: true,
    email: data.email ?? null,
  });
};

// ── Register ───────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Cria uma conta nova usando um token de convite válido.
 * O token é marcado como usado (uso único + idempotente).
 */
export const register = async (req: Request, res: Response) => {
  const { token, name, email, password } = req.body;

  // ── Validações de input ──────────────────────────────────────
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token de convite obrigatório' });
  }
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Nome deve ter ao menos 2 caracteres' });
  }
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 255) {
    return res.status(400).json({ error: 'E-mail inválido' });
  }
  if (!password || typeof password !== 'string' || !STRONG_PW_RE.test(password)) {
    return res.status(400).json({
      error: 'Senha fraca. Use ao menos 8 caracteres com maiúscula, minúscula, número e símbolo',
    });
  }

  if (!supabase) {
    return res.status(503).json({ error: 'Serviço indisponível' });
  }

  // ── Verificar convite ────────────────────────────────────────
  const { data: invite, error: invErr } = await supabase
    .from('invite_tokens')
    .select('id, email, expires_at, used_at')
    .eq('token', token)
    .single();

  if (invErr || !invite) {
    logger.warn({ token: token.slice(0, 8) }, '[Register] Token de convite inválido');
    return res.status(400).json({ error: 'Convite inválido ou não encontrado' });
  }

  if (invite.used_at) {
    return res.status(410).json({ error: 'Este convite já foi utilizado' });
  }

  if (new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Este convite expirou' });
  }

  // Se o convite foi criado para um e-mail específico, garante correspondência
  if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
    return res.status(403).json({ error: 'Este convite é destinado a outro e-mail' });
  }

  // ── Verificar duplicata de e-mail ────────────────────────────
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ error: 'Este e-mail já está cadastrado' });
  }

  // ── Criar usuário ────────────────────────────────────────────
  const userId       = uuidv4();
  const password_hash = await bcrypt.hash(password, 12);
  const cleanName    = sanitizeName(name);

  const { error: insertErr } = await supabase
    .from('users')
    .insert({
      id: userId,
      email: email.toLowerCase(),
      password_hash,
      name: cleanName,
      role: 'user',
      active: true,
    });

  if (insertErr) {
    logger.error({ error: insertErr, email }, '[Register] Erro ao criar usuário');
    return res.status(500).json({ error: 'Erro interno ao criar conta. Tente novamente.' });
  }

  // ── Marcar convite como usado — grava auditoria completa ─────
  const clientIp = (req.headers['x-forwarded-for'] as string | undefined)
    ?.split(',')[0].trim() ?? req.socket?.remoteAddress ?? null;
  const userAgent = (req.headers['user-agent'] as string | undefined)?.slice(0, 512) ?? null;

  await supabase
    .from('invite_tokens')
    .update({
      used_by:        userId,
      used_at:        new Date().toISOString(),
      used_by_name:   cleanName,
      used_by_email:  email.toLowerCase(),
      used_ip:        clientIp,
      used_user_agent: userAgent,
    })
    .eq('id', invite.id);

  // ── Emitir JWT ───────────────────────────────────────────────
  const jti   = uuidv4();
  const jwtToken = jwt.sign(
    { userId, email: email.toLowerCase(), role: 'user', jti },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as `${number}${'s'|'m'|'h'|'d'}` }
  );

  logger.info({ email, userId }, '[Register] Conta criada com sucesso');

  return res.status(201).json({ success: true, token: jwtToken });
};

// ── Create invite (admin only) ─────────────────────────────────

/**
 * POST /api/admin/invite
 * Cria um token de convite. Requer role=admin no JWT.
 *
 * Body (todos opcionais):
 *   email:      string  — restringe o convite a este e-mail
 *   expiresIn:  number  — dias até expirar (padrão: 7)
 */
export const createInvite = async (req: AuthRequest, res: Response) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Serviço indisponível' });
  }

  // Verificar se o usuário autenticado é admin
  const { data: caller } = await supabase
    .from('users')
    .select('role')
    .eq('id', req.userId)
    .single();

  if (!caller || caller.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }

  const emailTarget: string | null = typeof req.body?.email === 'string'
    ? req.body.email.toLowerCase()
    : null;
  const expiresInDays: number = Number(req.body?.expiresIn) > 0
    ? Math.min(Number(req.body.expiresIn), 30)
    : 7;
  const note: string | null = typeof req.body?.note === 'string' && req.body.note.trim()
    ? req.body.note.trim().slice(0, 200)
    : null;

  if (emailTarget && !EMAIL_RE.test(emailTarget)) {
    return res.status(400).json({ error: 'E-mail inválido' });
  }

  const token     = uuidv4();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('invite_tokens')
    .insert({
      token,
      created_by: req.userId!,
      email:      emailTarget,
      expires_at: expiresAt,
      note,
    })
    .select('id, token, email, expires_at, note')
    .single();

  if (error || !data) {
    logger.error({ error }, '[Admin] Erro ao criar convite');
    return res.status(500).json({ error: 'Erro ao gerar convite' });
  }

  logger.info({ createdBy: req.userId, email: emailTarget, expiresAt }, '[Admin] Convite criado');

  const registerUrl = `${env.FRONTEND_URL}/register?token=${token}`;

  return res.status(201).json({
    id:          data.id,
    token:       data.token,
    email:       data.email,
    note:        data.note ?? null,
    expires_at:  data.expires_at,
    registerUrl,
  });
};

/**
 * GET /api/admin/invites
 * Lista todos os convites. Requer role=admin.
 */
export const listInvites = async (req: AuthRequest, res: Response) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Serviço indisponível' });
  }

  const { data: caller } = await supabase
    .from('users')
    .select('role')
    .eq('id', req.userId)
    .single();

  if (!caller || caller.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }

  const { data, error } = await supabase
    .from('invite_tokens')
    .select('id, token, email, note, used_at, used_by, used_by_name, used_by_email, used_ip, used_user_agent, view_count, last_viewed_at, expires_at, created_at, created_by')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return res.status(500).json({ error: 'Erro ao listar convites' });
  }

  return res.json(data ?? []);
};
