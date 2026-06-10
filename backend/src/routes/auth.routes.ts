import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, logout } from '../controllers/auth.controller';
import { register, validateInvite } from '../controllers/register.controller';
import {
  requestReset, validateResetToken, confirmReset, changePassword,
} from '../controllers/password-reset.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { registerLimiter } from '../lib/rate-limiters';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos antes de tentar novamente.' },
  keyGenerator: (req) =>
    req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.ip ?? 'unknown',
});

// 3 solicitações de reset por IP por hora
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas solicitações de reset. Aguarde 1 hora.' },
  keyGenerator: (req) =>
    req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.ip ?? 'unknown',
});

router.post('/login',                    loginLimiter,   login);
router.post('/logout',                   authMiddleware, logout);
router.get( '/invite/validate',                          validateInvite);
router.post('/register',                 registerLimiter, register);

router.post('/password-reset/request',   resetLimiter,   requestReset);
router.get( '/password-reset/validate',                  validateResetToken);
router.post('/password-reset/confirm',                   confirmReset);
router.post('/password-reset/change',    authMiddleware, changePassword);

export default router;
