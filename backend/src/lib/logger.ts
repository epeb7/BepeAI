import pino from 'pino';
import { AsyncLocalStorage } from 'async_hooks';

const isDev = process.env.NODE_ENV !== 'production';

// Contexto por request — permite correlacionar logs de negócio com o request HTTP
// que os originou, sem precisar passar requestId manualmente em cada log.
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  // Injeta o requestId do contexto atual em todo log emitido durante o request.
  mixin() {
    const ctx = requestContext.getStore();
    return ctx ? { requestId: ctx.requestId } : {};
  },
  redact: {
    paths: [
      'req.headers.authorization',
      '*.password',
      '*.token',
      '*.cpf',
      '*.cnpj',
      '*.rg',
      '*.apiKey',
    ],
    censor: '[REDACTED]',
  },
});

export default logger;
