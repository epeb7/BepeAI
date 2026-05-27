import { Router } from 'express';
import { generatePDF } from '../controllers/pdf.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.post('/generate', authMiddleware, generatePDF);

export default router;