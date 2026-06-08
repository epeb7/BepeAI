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
