import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { supabase, supabaseEnabled } from '../lib/supabase';
import { invalidateTenantCache } from '../services/tenant.service';
import logger from '../lib/logger';

// Tamanho máximo da logo em base64 (~2MB de imagem → ~2.7MB base64)
const MAX_LOGO_B64_LEN = 2_800_000;

// ── GET /api/user/profile ─────────────────────────────────────
export const getProfile = async (req: AuthRequest, res: Response) => {
  if (!supabaseEnabled || !supabase || !req.userId) {
    return res.status(503).json({ error: 'Serviço indisponível' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, company_name, brand_color, template_overrides, preferred_tone, logo_base64')
      .eq('id', req.userId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Usuário não encontrado' });

    return res.json(data);
  } catch (err) {
    logger.error({ err, userId: req.userId }, '[User] getProfile falhou');
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// ── PUT /api/user/logo ────────────────────────────────────────
// Body: { logoBase64: string }  (data URL ou raw base64)
export const uploadLogo = async (req: AuthRequest, res: Response) => {
  if (!supabaseEnabled || !supabase || !req.userId) {
    return res.status(503).json({ error: 'Serviço indisponível' });
  }

  const { logoBase64 } = req.body as { logoBase64?: string };
  if (!logoBase64 || typeof logoBase64 !== 'string') {
    return res.status(400).json({ error: 'logoBase64 obrigatório' });
  }
  if (logoBase64.length > MAX_LOGO_B64_LEN) {
    return res.status(400).json({ error: 'Logo muito grande. Máximo 2MB.' });
  }

  // Aceita apenas PNG e JPG
  const isPng = logoBase64.startsWith('data:image/png') || logoBase64.replace(/^data:[^;]+;base64,/, '').startsWith('iVBOR');
  const isJpg = logoBase64.startsWith('data:image/jpeg') || logoBase64.startsWith('data:image/jpg');
  if (!isPng && !isJpg) {
    return res.status(400).json({ error: 'Formato inválido. Use PNG ou JPG.' });
  }

  try {
    const { error } = await supabase
      .from('users')
      .update({ logo_base64: logoBase64 })
      .eq('id', req.userId);

    if (error) throw error;

    invalidateTenantCache(req.userId);
    logger.info({ userId: req.userId }, '[User] Logo atualizada');
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err, userId: req.userId }, '[User] uploadLogo falhou');
    return res.status(500).json({ error: 'Erro ao salvar logo' });
  }
};

// ── DELETE /api/user/logo ─────────────────────────────────────
export const removeLogo = async (req: AuthRequest, res: Response) => {
  if (!supabaseEnabled || !supabase || !req.userId) {
    return res.status(503).json({ error: 'Serviço indisponível' });
  }
  try {
    await supabase.from('users').update({ logo_base64: null }).eq('id', req.userId);
    invalidateTenantCache(req.userId);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err, userId: req.userId }, '[User] removeLogo falhou');
    return res.status(500).json({ error: 'Erro ao remover logo' });
  }
};

// ── PUT /api/user/settings ────────────────────────────────────
// Body: { companyName?, brandColor?, preferredTone? }
export const updateSettings = async (req: AuthRequest, res: Response) => {
  if (!supabaseEnabled || !supabase || !req.userId) {
    return res.status(503).json({ error: 'Serviço indisponível' });
  }

  const { companyName, brandColor, preferredTone } = req.body as {
    companyName?: string;
    brandColor?: string;
    preferredTone?: string;
  };

  const VALID_TONES = ['formal', 'executivo', 'direto'];
  if (preferredTone && !VALID_TONES.includes(preferredTone)) {
    return res.status(400).json({ error: `Tom inválido. Use: ${VALID_TONES.join(', ')}` });
  }

  const update: Record<string, string> = {};
  if (companyName  !== undefined) update['company_name']    = companyName.trim().slice(0, 120);
  if (brandColor   !== undefined) update['brand_color']     = brandColor.trim().slice(0, 20);
  if (preferredTone !== undefined) update['preferred_tone'] = preferredTone;

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo válido fornecido' });
  }

  try {
    const { error } = await supabase.from('users').update(update).eq('id', req.userId);
    if (error) throw error;
    invalidateTenantCache(req.userId);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err, userId: req.userId }, '[User] updateSettings falhou');
    return res.status(500).json({ error: 'Erro ao atualizar configurações' });
  }
};
