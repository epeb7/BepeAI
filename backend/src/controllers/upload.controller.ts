import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { processUpload, deleteFile, getConversationFiles, FileValidationError } from '../services/file.service';
import { ensureConversation } from '../services/conversation.logger';
import logger from '../lib/logger';

// ── POST /api/upload ──────────────────────────────────────────
// Recebe um arquivo via multipart/form-data (campo "file").
export const uploadFile = async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const file = (req as AuthRequest & { file?: Express.Multer.File }).file;

  if (!file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  let conversationId =
    (req.body?.conversationId as string | undefined) ??
    (req.headers['x-conversation-id'] as string | undefined) ??
    null;

  // Se o usuário anexa antes de iniciar a conversa, cria uma conversa agora
  // para que o arquivo fique vinculado e o chat consiga recuperá-lo depois.
  if (!conversationId) {
    try {
      conversationId = await ensureConversation(userId, null);
    } catch (err) {
      logger.warn({ err, userId }, '[Upload] Falha ao criar conversa para o anexo');
    }
  }

  try {
    const record = await processUpload({
      userId,
      conversationId,
      originalname: file.originalname,
      mimetype: file.mimetype,
      buffer: file.buffer,
    });
    return res.status(201).json({ success: true, file: record, conversationId });
  } catch (err) {
    if (err instanceof FileValidationError) {
      return res.status(err.status).json({ error: err.message });
    }
    logger.error({ err, userId }, '[Upload] Erro ao processar upload');
    return res.status(500).json({ error: 'Erro ao processar o arquivo.' });
  }
};

// ── GET /api/upload/conversation/:conversationId ──────────────
export const listConversationFiles = async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { conversationId } = req.params;
  const files = await getConversationFiles(userId, conversationId);
  return res.json({
    files: files.map((f) => ({
      id: f.id,
      originalFilename: f.originalFilename,
      status: f.status,
      createdAt: f.createdAt,
    })),
  });
};

// ── DELETE /api/upload/:fileId ────────────────────────────────
export const removeFile = async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { fileId } = req.params;
  const ok = await deleteFile(userId, fileId);
  if (!ok) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  return res.json({ success: true });
};
