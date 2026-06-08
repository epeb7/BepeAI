/**
 * Groq Extraction Engine
 *
 * Responsabilidade única: extrair dados de mensagens do usuário.
 *
 * Estratégia em duas camadas:
 *  1. Regex determinístico (zero latência, zero custo)
 *  2. LLM multi-campo (uma única chamada extrai N campos simultâneos)
 *
 * A extração multi-campo reduz de 30 chamadas individuais para 3–6
 * chamadas por documento completo.
 */

import Groq from 'groq-sdk';
import { WorkflowStep } from '../workflows/definitions';
import { sanitizePromptInput } from '../lib/sanitize';
import logger from '../lib/logger';
import { env } from '../lib/env';

const groq = new Groq({ apiKey: env.GROQ_API_KEY });

// Modelos por responsabilidade:
// 70B → extração multi-campo (maior precisão, menos alucinação)
// 8B  → campo único e tarefas simples (baixa latência)
const MODEL_EXTRACTION = 'llama-3.3-70b-versatile';
const MODEL_INTENT     = 'llama-3.1-8b-instant';

// ── Retry com backoff exponencial ────────────────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      const retryable = status === 429 || status === 503 || status === 502;
      if (!retryable || attempt === maxAttempts) throw err;
      const delay = Math.pow(2, attempt) * 500; // 1s, 2s, 4s
      logger.warn({ label, attempt, delay, status }, '[Groq] Retry após erro transitório');
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`[Groq] ${label} falhou após ${maxAttempts} tentativas`);
}

// ============================================================
// Detecção de falhas de extração
// ============================================================

const FRASES_FALHA = [
  'não consegui encontrar',
  'não foi possível',
  'aguardo o texto',
  'não entendi',
  'não identifiquei',
  'não sei',
  'não informado',
  'não foi fornecida',
];

function isExtracaoFalha(valor: string): boolean {
  const lower = valor.toLowerCase();
  return FRASES_FALHA.some(f => lower.includes(f)) || valor.length > 150;
}

// ============================================================
// Extração determinística por regex (layer 1 — sem IA)
// ============================================================

function extrairCampoManual(texto: string, campo: string): string | null {
  switch (campo) {
    // ── Empresa (só extrai se o input É a razão social, i.e. texto curto sem outros dados) ──
    case 'empresa':
    case 'contratante_empresa':
    case 'contratado_empresa': {
      // Procura por "Razão social: X" ou "Empresa: X"
      const labelMatch = texto.match(/(?:raz[aã]o\s+social|empresa)\s*:\s*([^,\n]+)/i);
      if (labelMatch) return labelMatch[1].trim();
      // Texto simples sem números/vírgulas: trata como nome direto
      if (/^[A-Za-zÀ-ÿ\s.&'"]+$/.test(texto.trim()) && texto.trim().length >= 2) return texto.trim();
      return null;
    }

    // ── Documentos numéricos — extração determinística confiável ──
    case 'cnpj':
    case 'contratante_cnpj':
    case 'contratado_cnpj': {
      const m = texto.replace(/\D/g, '').match(/\d{14}/);
      return m ? m[0] : null;
    }

    case 'cpf':
    case 'contratante_cpf':
    case 'contratado_cpf': {
      // Prefere match após label "CPF:" para evitar capturar dígitos do RG
      const labeled = texto.match(/\bcpf\s*:?\s*([\d.\-\/]+)/i);
      if (labeled) return labeled[1].replace(/\D/g, '').slice(0, 11);
      // Fallback: procura sequência de 11 dígitos isolada
      const m = texto.match(/(?<!\d)(\d{11})(?!\d)/);
      return m ? m[1] : null;
    }

    case 'contratante_rg':
    case 'contratado_rg': {
      // Prefere match após "RG" ou "rg:"
      const labeled = texto.match(/\brg\s*:?\s*(\d[\d.\-]{6,10})/i);
      if (labeled) return labeled[1].replace(/\D/g, '');
      const m = texto.replace(/\D/g, '').match(/\d{7,9}/);
      return m ? m[0] : null;
    }

    // ── Datas ──
    case 'data_inicio': {
      // Em textos multi-campo, pega a PRIMEIRA data
      const m = texto.match(/(?:in[íi]cio\s*:?\s*)?(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i);
      if (m) {
        let [, dia, mes, ano] = m;
        if (ano.length === 2) ano = '20' + ano;
        return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano}`;
      }
      return null;
    }

    case 'data_fim': {
      // Em textos multi-campo, pega a SEGUNDA data (ignora a primeira)
      const allDates = [...texto.matchAll(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g)];
      if (allDates.length >= 2) {
        let [, dia, mes, ano] = allDates[1];
        if (ano.length === 2) ano = '20' + ano;
        return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano}`;
      }
      return null;
    }

    case 'data_assinatura':
    case 'dataInicio':
    case 'dataFim': {
      const m = texto.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      if (m) {
        let [, dia, mes, ano] = m;
        if (ano.length === 2) ano = '20' + ano;
        return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano}`;
      }
      return null;
    }

    // ── Valores monetários ──
    case 'valor_total':
    case 'valor': {
      // Prefere match após "R$", "valor:" ou "total:"
      const labeled = texto.match(/(?:r\$|valor\s*:?|total\s*:?)\s*([\d.,]+)/i);
      if (labeled) return labeled[1].replace(',', '.');
      const m = texto.replace(/R\$\s?/g, '').match(/\b([\d]{2,}(?:[.,]\d+)?)\b/);
      if (m) return m[1].replace(',', '.');
      return null;
    }

    // ── Prazos em dias ──
    case 'aviso_previo':
    case 'prazo': {
      const m = texto.match(/(\d+)\s*(dia|dias|mês|mes|meses|semana|semanas)/i);
      return m ? m[1] : null;
    }

    // ── Estado/UF ──
    case 'contratante_estado':
    case 'contratado_estado': {
      // Prefere match após "estado:" ou ", [UF]" no final
      const labeled = texto.match(/estado\s*:?\s*([A-Z]{2})\b/i);
      if (labeled) return labeled[1].toUpperCase();
      const m = texto.match(/\b([A-Z]{2})\b/);
      return m ? m[1] : null;
    }

    // ── Dia de pagamento ──
    case 'dia_pagamento': {
      const m = texto.match(/\bdia\s+(\d{1,2})\b/i) || texto.match(/vencimento\s*:?\s*(\d{1,2})/i);
      return m ? m[1] : null;
    }

    // ── Foro e cidade de assinatura ──
    case 'foro_comarca': {
      const m = texto.match(/foro\s*:?\s*([A-Za-zÀ-ÿ\s]+?)(?:,|$|\n|assinatura)/i)
               || texto.match(/comarca\s+(?:de\s+)?([A-Za-zÀ-ÿ\s]+?)(?:,|$|\n)/i);
      return m ? m[1].trim() : null;
    }

    case 'cidade_assinatura': {
      const m = texto.match(/(?:assinatura\s+em|cidade\s+(?:de\s+)?assinatura\s*:)\s*([A-Za-zÀ-ÿ\s]+?)(?:,|$|\n|em\s+\d)/i)
               || texto.match(/assinatura\s*:?\s*([A-Za-zÀ-ÿ\s]+?)(?:,|$|\n)/i);
      return m ? m[1].trim() : null;
    }

    // ── Endereço ──
    case 'contratante_endereco':
    case 'contratado_endereco': {
      const labeled = texto.match(/endere[çc]o\s*:?\s*([^,\n]{5,}?)(?:,\s*[A-Za-zÀ-ÿ]+\s*,\s*[A-Z]{2}|$|\n)/i);
      if (labeled) return labeled[1].trim();
      return null;
    }

    // ── Cidade ──
    case 'contratante_cidade':
    case 'contratado_cidade': {
      const labeled = texto.match(/cidade\s*:?\s*([A-Za-zÀ-ÿ\s]+?)(?:,|\n|$)/i);
      if (labeled) return labeled[1].trim();
      return null;
    }

    // ── Cargo do representante ──
    case 'contratante_cargo':
    case 'contratado_cargo': {
      const labeled = texto.match(/cargo\s*:?\s*([A-Za-zÀ-ÿ\s]+?)(?:,|\n|$)/i);
      if (labeled) return labeled[1].trim();
      return null; // deixa para o LLM
    }

    // ── Nome do representante ──
    case 'contratante_nome':
    case 'contratado_nome': {
      const labeled = texto.match(/nome\s*:?\s*([A-Za-zÀ-ÿ\s]+?)(?:,|\n|$)/i);
      if (labeled) return labeled[1].trim();
      return null; // deixa para o LLM
    }

    // ── Forma de pagamento ──
    case 'forma_pagamento': {
      const labeled = texto.match(/pagamento\s*:?\s*([A-Za-zÀ-ÿ\s]+?)(?:,|\n|$)/i);
      if (labeled) return labeled[1].trim();
      return null;
    }

    // ── Objeto dos serviços ──
    case 'objeto_servicos': {
      const labeled = texto.match(/objeto\s*:?\s*([^,\n]{3,}?)(?:\n|$)/i);
      if (labeled) return labeled[1].trim();
      // Texto curto sem outros dados → provavelmente é o objeto
      if (texto.length < 100 && !texto.match(/\d{2}\/\d{2}\/\d{4}/) && !texto.match(/cnpj|cpf/i)) {
        return texto.trim();
      }
      return null;
    }

    // ── Todos os outros campos: deixa o LLM decidir ──
    default:
      return null;
  }
}

// ============================================================
// Extração multi-campo via LLM (layer 2 — chamada única)
// ============================================================

const SYSTEM_PROMPT_MULTI = `# MOTOR DE EXTRAÇÃO DOCUMENTAL — BEPEAI

Você é um extrator de dados documentais de precisão enterprise.
Sua ÚNICA função: extrair campos INDIVIDUAIS de uma mensagem, retornando JSON puro.

## REGRAS ABSOLUTAS
1. Retorne APENAS JSON válido. Sem texto, sem markdown, sem explicações.
2. Cada campo deve conter APENAS o valor daquele campo, não a frase inteira.
3. Se não encontrar o valor, retorne "".
4. NUNCA repita dados de outros campos no mesmo campo.

## EXTRAÇÃO DE CAMPOS DE TEXTO (cargo, nome, nationalidade, etc.)
- Procure por labels explícitos: "Cargo: X", "Nome: X", "Profissão: X"
- Se a mensagem for uma lista separada por vírgulas, cada item mapeia para um campo na ordem da lista de campos.
- Exemplo: "Diretor, João Silva, Brasileiro, Casado, Empresário, RG 123456789, CPF 12345678901"
  extraído: cargo="Diretor", nome="João Silva", nacionalidade="Brasileiro", estado_civil="Casado", profissao="Empresário"
- NUNCA coloque a frase completa em um campo de texto. Apenas o valor isolado.

## NORMALIZAÇÃO
- CNPJ: apenas 14 dígitos. Ex: "12.345.678/0001-99" → "12345678000199"
- CPF: apenas 11 dígitos. Ex: "123.456.789-01" → "12345678901"
- RG: apenas dígitos. Ex: "12.345.678-9" → "123456789"
- Datas: DD/MM/AAAA. Ex: "01-07-26" → "01/07/2026"
- Valores monetários: só o número. Ex: "R$ 50.000,00" → "50000.00", "50000" → "50000"
- Prazo em dias: só o número. Ex: "30 dias" → "30", "2 meses" → "60"
- Estado (UF): sigla 2 letras maiúsculas. Ex: "São Paulo" → "SP"
- Textos livres (cargo, nome, objeto, forma_pagamento): capitalize normalmente, sem truncar.

## ANTI-ALUCINAÇÃO
- Se ambíguo, retorne "".
- Se a mensagem for uma pergunta: retorne "" para todos.
- NÃO invente dados que não estão na mensagem.`;

export async function extrairMultiplosCampos(
  mensagem: string,
  campos: WorkflowStep[],
  groupLabel?: string
): Promise<Record<string, string>> {
  const texto = sanitizePromptInput(mensagem);
  const resultado: Record<string, string> = {};
  const camposParaLLM: WorkflowStep[] = [];

  // Layer 1: tenta regex para cada campo
  for (const campo of campos) {
    const valor = extrairCampoManual(texto, campo.field);
    if (valor && campo.validator ? campo.validator(valor) : valor) {
      resultado[campo.field] = valor!;
    } else {
      camposParaLLM.push(campo);
    }
  }

  if (camposParaLLM.length === 0) return resultado;

  // Layer 2: LLM para campos restantes
  const fieldDescriptions = camposParaLLM
    .map(c => {
      const parts = [`"${c.field}": ${c.question}`];
      if (c.example) parts.push(`(ex: ${c.example})`);
      return parts.join(' ');
    })
    .join('\n');

  const expectedKeys = camposParaLLM.map(c => `"${c.field}"`).join(', ');
  const contextLabel = groupLabel ? ` (contexto: ${groupLabel})` : '';

  const userPrompt = `Extraia os campos documentais abaixo da mensagem do usuário.
Contexto do grupo${contextLabel}.

CAMPOS (na ordem esperada, se a mensagem for uma lista):
${fieldDescriptions}

MENSAGEM DO USUÁRIO:
"${texto}"

INSTRUÇÕES:
- Procure por labels explícitos como "Cargo: X", "Nome: X", "RG: X" etc.
- Se for uma lista sem labels, associe cada item ao campo na ordem acima.
- Extraia APENAS o valor individual de cada campo (ex: "Diretor", não "Cargo: Diretor").
- Para campos não encontrados, retorne "".

Retorne JSON com exatamente estas chaves: { ${expectedKeys} }`;

  try {
    const completion = await withRetry(
      () => groq.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_MULTI },
          { role: 'user', content: userPrompt },
        ],
        model: MODEL_EXTRACTION,
        temperature: 0,
        max_tokens: 600,
      }),
      'extrairMultiplosCampos'
    );

    const content = completion.choices[0]?.message?.content?.trim() ?? '{}';

    // Extrai JSON mesmo se vier com texto ao redor
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Resposta sem JSON válido');

    const extracted: Record<string, unknown> = JSON.parse(jsonMatch[0]);

    for (const campo of camposParaLLM) {
      const val = extracted[campo.field];
      if (typeof val === 'string' && val.trim() && !isExtracaoFalha(val)) {
        resultado[campo.field] = val.trim();
      }
    }

    logger.debug(
      { fields: camposParaLLM.map(c => c.field), found: Object.keys(resultado).length },
      '[Groq] Extração multi-campo concluída'
    );
  } catch (err) {
    logger.error(
      { err, campos: camposParaLLM.map(c => c.field) },
      '[Groq] Erro na extração multi-campo'
    );
  }

  return resultado;
}

// ============================================================
// Extração de campo único — mantido para compatibilidade
// ============================================================

export async function extrairCampo(mensagem: string, campo: string): Promise<string | null> {
  const texto = sanitizePromptInput(mensagem);

  const manual = extrairCampoManual(texto, campo);
  if (manual) return manual;

  const systemPrompt = `Você é um extrator de dados documentais. Extraia APENAS o valor do campo solicitado da mensagem.
Retorne SOMENTE o valor, sem explicações. Se não encontrar, retorne string vazia.
Normalize: CNPJ/CPF sem pontuação, datas DD/MM/AAAA, valores sem R$ com ponto decimal.`;

  try {
    const completion = await withRetry(
      () => groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Campo: "${campo}"\nMensagem: "${texto}"` },
        ],
        model: MODEL_INTENT,
        temperature: 0,
        max_tokens: 100,
      }),
      'extrairCampo'
    );

    const valor = completion.choices[0]?.message?.content?.trim()
      .replace(/^["']|["']$/g, '') ?? '';

    if (!valor || isExtracaoFalha(valor)) return null;
    return valor;
  } catch (err) {
    logger.error({ err, campo }, '[Groq] Erro na extração de campo único');
    return null;
  }
}
