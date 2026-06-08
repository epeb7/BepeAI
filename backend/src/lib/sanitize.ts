/**
 * Sanitiza entrada do usuário antes de incluir em prompts de LLM.
 * Previne prompt injection e outros vetores de ataque.
 */

const MAX_INPUT_LENGTH = 500;

const INJECTION_PATTERNS: RegExp[] = [
  /\b(sistema|system)\s*:/gi,
  /\b(instrução|instrucao|instruction)\s*:/gi,
  /ignore\s+(all|everything|above|previous|prior|tudo|instruções)/gi,
  /esqueça\s+(tudo|as\s+instruções|o\s+contexto)/gi,
  /\bprompt\s*:/gi,
  /\brole\s*:\s*(system|user|assistant)/gi,
  /```[\s\S]*?```/g,
  /<\|?(im_start|im_end|system|endoftext)\|?>/gi,
];

export function sanitizePromptInput(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text
    .slice(0, MAX_INPUT_LENGTH)
    .replace(/\r\n/g, '\n')          // normaliza line endings
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[^\S\n]{3,}/g, '  ')  // colapsa espaços excessivos, preserva \n
    .trim();

  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[filtrado]');
  }

  return sanitized;
}

export function sanitizeFieldName(field: string): string {
  return field.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 100);
}
