import rateLimit from 'express-rate-limit';

export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de mensagens atingido. Aguarde 1 minuto.' },
  keyGenerator: (req) =>
    req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.ip ?? 'unknown',
});

export const pdfLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de geração de PDFs atingido. Aguarde 1 minuto.' },
  keyGenerator: (req) =>
    req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.ip ?? 'unknown',
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de uploads atingido. Aguarde 1 minuto.' },
  keyGenerator: (req) =>
    req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.ip ?? 'unknown',
});

// 3 cadastros por IP a cada 60 minutos — evita criação em massa
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: { error: 'Limite de cadastros atingido. Aguarde 1 hora antes de tentar novamente.' },
  keyGenerator: (req) =>
    req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.ip ?? 'unknown',
});
