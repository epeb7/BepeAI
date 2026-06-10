import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { createInvite, listInvites } from '../controllers/register.controller';
import { adminResetPassword } from '../controllers/password-reset.controller';

const router = Router();

router.post('/invites',                  authMiddleware, createInvite);
router.get( '/invites',                  authMiddleware, listInvites);
router.post('/users/:userId/reset-password', authMiddleware, adminResetPassword);

export default router;
