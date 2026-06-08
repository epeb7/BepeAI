import { Router } from 'express';
import { generatePDF } from '../controllers/pdf.controller';
import { pdfLimiter } from '../lib/rate-limiters';

const router = Router();

// authMiddleware já aplicado em app.ts para todas as rotas /api/pdf
router.post('/generate', pdfLimiter, generatePDF);

export default router;
