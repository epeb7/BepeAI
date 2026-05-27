import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';

export const getCustomers = async (req: AuthRequest, res: Response) => {
  res.json({ customers: [] });
};