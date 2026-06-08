import { Router } from 'express';
import { sendMessage } from '../controllers/chat.controller';
import { deleteState } from '../services/conversation.service';
import { AuthRequest } from '../middlewares/auth.middleware';
import { chatLimiter } from '../lib/rate-limiters';

const router = Router();

// authMiddleware já aplicado em app.ts para todas as rotas /api/chat
router.post('/', chatLimiter, sendMessage);

router.post('/reset', async (req: AuthRequest, res) => {
  await deleteState(req.userId!);
  res.json({ success: true });
});

export default router;
