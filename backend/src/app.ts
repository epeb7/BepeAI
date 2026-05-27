import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import path from 'path';

import chatRoutes from './routes/chat.routes';
import pdfRoutes from './routes/pdf.routes';
import customerRoutes from './routes/customer.routes';
import authRoutes from './routes/auth.routes';
import { errorMiddleware } from './middlewares/error.middleware';

dotenv.config();

const app = express();

// ⚠️ IMPORTANTE: parse JSON antes de qualquer rota
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security
app.use(helmet());

// CORS - permite o frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Muitas requisições deste IP, tente novamente mais tarde.'
});
app.use('/api', limiter);

// Arquivos estáticos (uploads)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/customers', customerRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'BepeAI Backend' });
});

// Middleware de erro (deve ser o último)
app.use(errorMiddleware);

export default app;