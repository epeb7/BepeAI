/**
 * LLM Client — roteamento inteligente com cadeia de fallback completa
 *
 * Cada tipo de tarefa tem sua própria cadeia de modelos, ordenada por:
 *   1. Qualidade (melhor modelo primeiro)
 *   2. Limite de tokens/min (mais alto = aguenta mais carga)
 *   3. Provider (Groq prioritário por latência; Cerebras como último recurso)
 *
 * Quando um modelo falha (429 rate-limit, timeout, 5xx), o sistema tenta
 * o próximo da cadeia automaticamente — sem intervenção manual.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ CADEIA DE EXTRAÇÃO (JSON estruturado, 0 temperatura)            │
 * │  1. groq   llama-3.3-70b-versatile     6k  tok/min  — melhor   │
 * │  2. groq   llama-3.1-70b-versatile     6k  tok/min  — fallback │
 * │  3. groq   llama-3.1-8b-instant       30k  tok/min  — rápido   │
 * │  4. groq   gemma2-9b-it               15k  tok/min  — robusto  │
 * │  5. cerebras llama-3.3-70b             —   tok/min  — externo  │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ CADEIA CONVERSACIONAL (texto natural, temperatura ~0.6)         │
 * │  1. groq   llama-4-scout-17b          30k  tok/min  — melhor   │
 * │  2. groq   llama-3.3-70b-versatile     6k  tok/min  — fallback │
 * │  3. groq   gemma2-9b-it               15k  tok/min  — rápido   │
 * │  4. groq   llama-3.1-8b-instant       30k  tok/min  — backup   │
 * │  5. cerebras llama-3.1-8b              —   tok/min  — externo  │
 * └─────────────────────────────────────────────────────────────────┘
 */

import Groq from 'groq-sdk';
import { env } from './env';
import logger from './logger';

// ── Tipos ─────────────────────────────────────────────────────
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type TaskType = 'extraction' | 'conversational';

export interface LLMRequest {
  messages:    ChatMessage[];
  taskType:    TaskType;
  temperature?: number;
  max_tokens?:  number;
}

export interface LLMResponse {
  content:  string;
  provider: string;
  model:    string;
}

// ── Definição de um candidato na cadeia ──────────────────────
interface ModelCandidate {
  provider: 'groq' | 'cerebras';
  model:    string;
}

// ── Cadeias de fallback por task ──────────────────────────────
const CHAINS: Record<TaskType, ModelCandidate[]> = {
  extraction: [
    { provider: 'groq',     model: 'llama-3.3-70b-versatile' },
    { provider: 'groq',     model: 'llama-3.1-70b-versatile' },
    { provider: 'groq',     model: 'llama-3.1-8b-instant' },
    { provider: 'groq',     model: 'gemma2-9b-it' },
    { provider: 'cerebras', model: 'llama-3.3-70b' },
  ],
  conversational: [
    { provider: 'groq',     model: 'meta-llama/llama-4-scout-17b-16e-instruct' },
    { provider: 'groq',     model: 'llama-3.3-70b-versatile' },
    { provider: 'groq',     model: 'gemma2-9b-it' },
    { provider: 'groq',     model: 'llama-3.1-8b-instant' },
    { provider: 'cerebras', model: 'llama-3.1-8b' },
  ],
};

// ── Defaults de temperatura por task ─────────────────────────
const DEFAULT_TEMP: Record<TaskType, number> = {
  extraction:     0,
  conversational: 0.55,
};

// ── Clientes ──────────────────────────────────────────────────
const groqClient = new Groq({ apiKey: env.GROQ_API_KEY });

const cerebrasClient = env.CEREBRAS_API_KEY
  ? new Groq({
      apiKey:  env.CEREBRAS_API_KEY,
      baseURL: 'https://api.cerebras.ai/v1',
    })
  : null;

function getClient(provider: 'groq' | 'cerebras'): Groq | null {
  if (provider === 'groq')     return groqClient;
  if (provider === 'cerebras') return cerebrasClient;
  return null;
}

// ── Helpers ───────────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`[LLM] Timeout (${ms}ms): ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const TIMEOUT_MS = 22_000;

function isRetryableSameModel(status: number | undefined): boolean {
  return status === 502 || status === 503 || status === 500;
}

function shouldAdvanceChain(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const msg    = (err as Error)?.message ?? '';
  // Rate-limit, timeout, modelo indisponível → avança na cadeia imediatamente
  return status === 429 || status === 503 || msg.includes('Timeout') || msg.includes('model');
}

// ── Chamada única a um modelo ─────────────────────────────────
async function callModel(
  candidate: ModelCandidate,
  req: LLMRequest,
  label: string
): Promise<LLMResponse> {
  const client = getClient(candidate.provider);
  if (!client) throw new Error(`[LLM] Provider ${candidate.provider} não configurado`);

  const completion = await withTimeout(
    client.chat.completions.create({
      messages:    req.messages,
      model:       candidate.model,
      temperature: req.temperature ?? DEFAULT_TEMP[req.taskType],
      max_tokens:  req.max_tokens ?? (req.taskType === 'extraction' ? 600 : 350),
    }),
    TIMEOUT_MS,
    `${label}@${candidate.provider}/${candidate.model}`
  );

  const content = completion.choices[0]?.message?.content?.trim() ?? '';
  return { content, provider: candidate.provider, model: candidate.model };
}

// ── Ponto de entrada principal ────────────────────────────────
/**
 * Executa a chamada LLM percorrendo a cadeia de fallback até obter resposta.
 *
 * Para cada candidato:
 *   - Tenta 1 vez (erros 5xx passageiros têm 1 retry com backoff curto)
 *   - Se falhar por rate-limit/timeout → avança para o próximo imediatamente
 *   - Se falhar por erro transitório   → 1 retry rápido, depois avança
 *   - Se chegar ao fim da cadeia sem sucesso → lança o último erro
 */
export async function llmCall(req: LLMRequest, label: string): Promise<LLMResponse> {
  const chain = CHAINS[req.taskType].filter(c => {
    // Remove candidatos Cerebras se não houver chave configurada
    if (c.provider === 'cerebras' && !cerebrasClient) return false;
    return true;
  });

  let lastError: unknown;

  for (let i = 0; i < chain.length; i++) {
    const candidate = chain[i];
    const isLast    = i === chain.length - 1;

    try {
      // Para erros 5xx transitórios: 1 retry rápido antes de avançar na cadeia
      let result: LLMResponse;
      try {
        result = await callModel(candidate, req, label);
      } catch (firstErr: unknown) {
        const status = (firstErr as { status?: number })?.status;
        if (isRetryableSameModel(status) && !isLast) {
          await new Promise(r => setTimeout(r, 800));
          result = await callModel(candidate, req, label);
        } else {
          throw firstErr;
        }
      }

      if (i > 0) {
        logger.info(
          { label, provider: candidate.provider, model: candidate.model, chainIndex: i },
          '[LLM] Fallback bem-sucedido'
        );
      } else {
        logger.debug(
          { label, provider: candidate.provider, model: candidate.model },
          '[LLM] Chamada concluída'
        );
      }

      return result;

    } catch (err: unknown) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      const msg    = (err as Error)?.message ?? '';

      if (isLast) break; // sem mais candidatos

      if (shouldAdvanceChain(err)) {
        logger.warn(
          {
            label,
            failedProvider: candidate.provider,
            failedModel:    candidate.model,
            nextModel:      chain[i + 1].model,
            status,
            reason: msg.slice(0, 80),
          },
          '[LLM] Avançando cadeia de fallback'
        );
        continue;
      }

      // Erro não-retentável e não é caso de avançar (ex: 400 bad request) → lança imediatamente
      logger.error(
        { label, provider: candidate.provider, model: candidate.model, status, err: msg },
        '[LLM] Erro não-retentável'
      );
      throw err;
    }
  }

  logger.error(
    { label, taskType: req.taskType, chainLength: chain.length },
    '[LLM] Toda a cadeia de fallback esgotada'
  );
  throw lastError;
}
