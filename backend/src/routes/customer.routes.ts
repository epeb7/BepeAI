import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Placeholder para futura implementação com banco de dados
router.get('/', authMiddleware, (req, res) => {
  res.json({ message: 'Rota de customers - em desenvolvimento' });
});

export default router;