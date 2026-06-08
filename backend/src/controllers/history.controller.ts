import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import {
  listConversations,
  getConversationDetail,
  renameConversation,
  deleteConversation,
} from '../services/conversation.logger';
import logger from '../lib/logger';

export const getHistory = async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const conversations = await listConversations(userId);
  res.json({ success: true, conversations });
};

export const getConversation = async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;

  const detail = await getConversationDetail(id, userId);
  if (!detail) return res.status(404).json({ error: 'Conversa não encontrada' });

  res.json({ success: true, conversation: detail });
};

export const renameConversationHandler = async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;
  const { title } = req.body;

  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'Título inválido' });
  }

  const ok = await renameConversation(id, userId, title);
  if (!ok) return res.status(404).json({ error: 'Conversa não encontrada' });

  logger.info({ userId, conversationId: id, title }, '[History] Conversa renomeada');
  res.json({ success: true });
};

export const deleteConversationHandler = async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;

  const ok = await deleteConversation(id, userId);
  if (!ok) return res.status(404).json({ error: 'Conversa não encontrada' });

  logger.info({ userId, conversationId: id }, '[History] Conversa excluída');
  res.json({ success: true });
};
