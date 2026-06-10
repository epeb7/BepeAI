import { Router } from 'express';
import multer from 'multer';
import { uploadFile, listConversationFiles, removeFile } from '../controllers/upload.controller';
import { uploadLimiter } from '../lib/rate-limiters';
import { MAX_FILE_SIZE } from '../services/file.service';

const router = Router();

// Armazenamento em memória — o buffer vai direto ao Supabase Storage.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

// authMiddleware já aplicado em app.ts para /api/upload
router.post('/', uploadLimiter, upload.single('file'), uploadFile);
router.get('/conversation/:conversationId', listConversationFiles);
router.delete('/:fileId', removeFile);

export default router;
