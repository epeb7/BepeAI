import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
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
