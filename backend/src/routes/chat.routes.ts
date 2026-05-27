import { Router } from 'express';
import { sendMessage } from '../controllers/chat.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { resetState } from '../services/conversation.service';
import { AuthRequest } from '../middlewares/auth.middleware';

const router = Router();

router.post('/', authMiddleware, sendMessage);
router.post('/reset', authMiddleware, (req: AuthRequest, res) => {
  resetState(req.userId!);
  res.json({ success: true });
});

export default router;