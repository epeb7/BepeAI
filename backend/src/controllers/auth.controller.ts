import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const MOCK_USER = {
  email: 'admin@bepeai.com',
  password: '123456'
};

export const login = async (req: Request, res: Response) => {
  console.log('[Auth] Body recebido:', req.body);
  console.log('[Auth] Headers content-type:', req.headers['content-type']);

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  if (email === MOCK_USER.email && password === MOCK_USER.password) {
    const token = jwt.sign(
      { userId: '1', email },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );
    return res.json({ success: true, token });
  }

  return res.status(401).json({ error: 'Credenciais inválidas' });
};