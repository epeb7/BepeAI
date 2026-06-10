import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';

export const errorMiddleware = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  // Erros do multer (upload) — sempre erro do cliente (400)
  if (err?.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'Arquivo excede o limite de 20 MB.'
      : 'Falha no envio do arquivo.';
    return res.status(400).json({ error: msg });
  }

  const status  = err.status || err.statusCode || 500;
  const isProd  = process.env.NODE_ENV === 'production';

  if (isProd) {
    // Produção: loga internamente, nunca expõe stack ao cliente
    logger.error({ err, status }, '[Error] Erro não capturado');
    res.status(status).json({ error: 'Erro interno do servidor' });
  } else {
    // Dev: stack completo para facilitar debug
    logger.error({ err }, '[Error] Erro não capturado');
    res.status(status).json({
      error: err.message || 'Erro interno do servidor',
      stack: err.stack,
    });
  }
};