import { Router } from 'express';
import {
  getHistory,
  getConversation,
  renameConversationHandler,
  deleteConversationHandler,
} from '../controllers/history.controller';

const router = Router();

// authMiddleware aplicado em app.ts para /api/history
router.get('/',         getHistory);
router.get('/:id',      getConversation);
router.patch('/:id',    renameConversationHandler);
router.delete('/:id',   deleteConversationHandler);

export default router;
