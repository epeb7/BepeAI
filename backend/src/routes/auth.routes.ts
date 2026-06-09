import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, logout } from '../controllers/auth.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Rate limiter dedicado para login — proteção contra brute-force
// 5 tentativas por IP a cada 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // não conta tentativas bem-sucedidas
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos antes de tentar novamente.' },
  keyGenerator: (req) =>
    req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.ip ?? 'unknown',
});

router.post('/login',  loginLimiter, login);
router.post('/logout', authMiddleware, logout);

export default router;
