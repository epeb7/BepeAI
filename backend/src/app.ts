import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { chatLimiter, pdfLimiter } from './lib/rate-limiters';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { env } from './lib/env';
import chatRoutes from './routes/chat.routes';
import pdfRoutes from './routes/pdf.routes';
import authRoutes from './routes/auth.routes';
import historyRoutes from './routes/history.routes';
import { errorMiddleware } from './middlewares/error.middleware';
import { authMiddleware } from './middlewares/auth.middleware';
import logger from './lib/logger';
import { supabaseEnabled } from './lib/supabase';

const app = express();

// ── Request correlation ID ────────────────────────────────────
app.use((req: express.Request & { requestId?: string }, _res, next) => {
  req.requestId = uuidv4();
  next();
});

// ── Request logging ──────────────────────────────────────────
app.use((req: express.Request & { requestId?: string }, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      status: res.statusCode,
      ms: Date.now() - start,
    }, '[HTTP]');
  });
  next();
});

// ── Compressão gzip ───────────────────────────────────────────
app.use(compression());

// ── Body parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ── Security headers ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
}));

// ── CORS — suporta múltiplas origens ─────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Permite requests sem origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (env.ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    logger.warn({ origin }, '[CORS] Origem bloqueada');
    callback(new Error(`Origem não permitida: ${origin}`));
  },
  credentials: true,
  optionsSuccessStatus: 200,
}));

// ── Rate limiting global por IP ───────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.ip ?? 'unknown';
  },
});
app.use('/api', globalLimiter);

// ── Arquivos estáticos ────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'BepeAI Backend',
    version: process.env.npm_package_version ?? '1.0.0',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    dependencies: {
      supabase: supabaseEnabled ? 'connected' : 'disabled',
      groq: env.GROQ_API_KEY ? 'configured' : 'missing',
    },
  });
});

// Alias público sem auth
app.get('/api/health', (_req, res) => res.redirect('/health'));

// ── Rotas ─────────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/chat',    authMiddleware, chatRoutes);
app.use('/api/pdf',     authMiddleware, pdfRoutes);
app.use('/api/history', authMiddleware, historyRoutes);

// ── Error handler ─────────────────────────────────────────────
app.use(errorMiddleware);

export default app;
