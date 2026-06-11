import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { adminMiddleware } from '../middlewares/admin.middleware';
import { createInvite, listInvites } from '../controllers/register.controller';
import { adminResetPassword } from '../controllers/password-reset.controller';

const router = Router();

// authMiddleware valida o JWT; adminMiddleware garante role=admin no banco
router.post('/invites',                      authMiddleware, adminMiddleware, createInvite);
router.get( '/invites',                      authMiddleware, adminMiddleware, listInvites);
router.post('/users/:userId/reset-password', authMiddleware, adminMiddleware, adminResetPassword);

export default router;
