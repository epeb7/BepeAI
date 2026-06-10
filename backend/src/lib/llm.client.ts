/**
 * LLM Client — roteamento inteligente com cadeia de fallback completa
 *
 * Cada tipo de tarefa tem sua própria cadeia de modelos, ordenada por:
 *   1. Qualidade (melhor modelo primeiro)
 *   2. Velocidade de tokens/s medida em benchmark real
 *   3. Provider (Groq prioritário por latência; fallbacks externos no fim)
 *
 * Quando um modelo falha (429 rate-limit, timeout, 5xx), o sistema tenta
 * o próximo da cadeia automaticamente — sem intervenção manual.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CADEIA DE EXTRAÇÃO (JSON estruturado, temperatura 0)                     │
 * │  1. groq  openai/gpt-oss-20b           346 tok/s  578ms  — mais veloz   │
 * │  2. groq  llama-3.3-70b-versatile      188 tok/s  298ms  — mais rápido  │
 * │  3. groq  llama-3.1-8b-instant         321 tok/s  624ms  — backup       │
 * │  4. groq  openai/gpt-oss-120b          222 tok/s  573ms  — reason=low   │
 * │  5. cerebras  llama-3.3-70b             —  tok/s    —ms  — externo      │
 * │  6. openai    gpt-4.1-mini              —  tok/s    —ms  — reserve      │
 * │  7. openrouter meta-llama/llama-3.3-70b —  tok/s    —ms  — last resort  │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │ CADEIA CONVERSACIONAL (texto natural, temperatura ~0.55)                 │
 * │  1. groq  llama-4-scout-17b            287 tok/s  698ms  — melhor       │
 * │  2. groq  groq/compound-mini           228 tok/s 1196ms  — mais rico    │
 * │  3. groq  llama-3.3-70b-versatile      188 tok/s  298ms  — fallback     │
 * │  4. groq  llama-3.1-8b-instant         321 tok/s  624ms  — rápido       │
 * │  5. cerebras  llama-3.1-8b              —  tok/s    —ms  — externo      │
 * │  6. openai    gpt-4.1-mini              —  tok/s    —ms  — reserve      │
 * │  7. openrouter meta-llama/llama-4-scout —  tok/s    —ms  — last resort  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Provedores configurados via variáveis de ambiente:
 *   GROQ_API_KEY          — obrigatório
 *   CEREBRAS_API_KEY      — opcional
 *   OPENAI_API_KEY        — opcional
 *   OPENROUTER_API_KEY    — opcional
 */

import Groq from 'groq-sdk';
import type { ChatCompletionCreateParamsNonStreaming } from 'groq-sdk/resources/chat/completions';
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
  content:    string;
  provider:   string;
  model:      string;
  latencyMs?: number;
}

// ── Definição de um candidato na cadeia ──────────────────────
type ProviderName = 'groq' | 'cerebras' | 'openai' | 'openrouter';

interface ModelCandidate {
  provider:         ProviderName;
  model:            string;
  // reasoning_effort só é enviado quando definido — exclusivo de modelos que suportam
  reasoning_effort?: 'low' | 'medium' | 'high';
}

// ── Cadeias de fallback por task ──────────────────────────────
// Ordenadas por benchmark real (2025-06-10): tok/s e latência medidos na Groq API
const CHAINS: Record<TaskType, ModelCandidate[]> = {
  extraction: [
    { provider: 'groq',       model: 'openai/gpt-oss-20b' },                                    // 346 tok/s
    { provider: 'groq',       model: 'llama-3.3-70b-versatile' },                               // 298ms latência
    { provider: 'groq',       model: 'llama-3.1-8b-instant' },                                  // 321 tok/s
    { provider: 'groq',       model: 'openai/gpt-oss-120b', reasoning_effort: 'low' },          // 320ms c/ reasoning=low
    { provider: 'cerebras',   model: 'llama-3.3-70b' },
    { provider: 'openai',     model: 'gpt-4.1-mini' },
    { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct' },
  ],
  conversational: [
    { provider: 'groq',       model: 'meta-llama/llama-4-scout-17b-16e-instruct' },             // 287 tok/s, melhor qualidade
    { provider: 'groq',       model: 'groq/compound-mini' },                                    // 228 tok/s, respostas mais ricas
    { provider: 'groq',       model: 'llama-3.3-70b-versatile' },                               // 188 tok/s, confiável
    { provider: 'groq',       model: 'llama-3.1-8b-instant' },                                  // 321 tok/s, backup rápido
    { provider: 'cerebras',   model: 'llama-3.1-8b' },
    { provider: 'openai',     model: 'gpt-4.1-mini' },
    { provider: 'openrouter', model: 'meta-llama/llama-4-scout' },
  ],
};

// ── Defaults de temperatura por task ─────────────────────────
const DEFAULT_TEMP: Record<TaskType, number> = {
  extraction:     0,
  conversational: 0.55,
};

// ── Clientes (Groq SDK aceita baseURL customizado — compatível com qualquer API OpenAI) ──
const groqClient = new Groq({ apiKey: env.GROQ_API_KEY });

const cerebrasClient = env.CEREBRAS_API_KEY
  ? new Groq({ apiKey: env.CEREBRAS_API_KEY, baseURL: 'https://api.cerebras.ai/v1' })
  : null;

const openaiClient = env.OPENAI_API_KEY
  ? new Groq({ apiKey: env.OPENAI_API_KEY, baseURL: 'https://api.openai.com/v1' })
  : null;

const openrouterClient = env.OPENROUTER_API_KEY
  ? new Groq({
      apiKey:         env.OPENROUTER_API_KEY,
      baseURL:        'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://bepeai.com',
        'X-Title':      'BepeAI',
      },
    })
  : null;

function getClient(provider: ProviderName): Groq | null {
  switch (provider) {
    case 'groq':       return groqClient;
    case 'cerebras':   return cerebrasClient;
    case 'openai':     return openaiClient;
    case 'openrouter': return openrouterClient;
  }
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

  const t0 = Date.now();

  // Parâmetros base — válidos para todos os modelos
  const baseParams: ChatCompletionCreateParamsNonStreaming = {
    messages:    req.messages,
    model:       candidate.model,
    temperature: req.temperature ?? DEFAULT_TEMP[req.taskType],
    max_tokens:  req.max_tokens ?? (req.taskType === 'extraction' ? 600 : 350),
    stream:      false,
  };

  // reasoning_effort: exclusivo dos modelos gpt-oss-120b na Groq
  // Esses modelos usam max_completion_tokens em vez de max_tokens e ignoram temperature
  const params = candidate.reasoning_effort
    ? {
        ...baseParams,
        reasoning_effort:     candidate.reasoning_effort,
        max_completion_tokens: baseParams.max_tokens,
        max_tokens:            undefined,
        temperature:           undefined,
      } as unknown as ChatCompletionCreateParamsNonStreaming
    : baseParams;

  const completion = await withTimeout(
    client.chat.completions.create(params),
    TIMEOUT_MS,
    `${label}@${candidate.provider}/${candidate.model}`
  );

  const content   = (completion as Groq.Chat.ChatCompletion).choices[0]?.message?.content?.trim() ?? '';
  const latencyMs = Date.now() - t0;

  return { content, provider: candidate.provider, model: candidate.model, latencyMs };
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
    if (c.provider === 'cerebras'   && !cerebrasClient)   return false;
    if (c.provider === 'openai'     && !openaiClient)     return false;
    if (c.provider === 'openrouter' && !openrouterClient) return false;
    return true;
  });

  let lastError: unknown;

  for (let i = 0; i < chain.length; i++) {
    const candidate = chain[i];
    const isLast    = i === chain.length - 1;

    try {
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
          { label, provider: candidate.provider, model: candidate.model, chainIndex: i, latencyMs: result.latencyMs },
          '[LLM] Fallback bem-sucedido'
        );
      } else {
        logger.debug(
          { label, provider: candidate.provider, model: candidate.model, latencyMs: result.latencyMs },
          '[LLM] Chamada concluída'
        );
      }

      return result;

    } catch (err: unknown) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      const msg    = (err as Error)?.message ?? '';

      if (isLast) break;

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
