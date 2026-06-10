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

import { WorkflowStep } from '../workflows/definitions';
import { sanitizePromptInput } from '../lib/sanitize';
import logger from '../lib/logger';
import { llmCall } from '../lib/llm.client';

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

// Campos de texto livre têm conteúdo longo por natureza — não rejeitar por tamanho
const CAMPOS_TEXTO_LONGO = new Set([
  'resumo_executivo', 'principais_resultados', 'recomendacoes',
  'objeto_servicos', 'descricao_servicos', 'escopo_detalhado',
  'descricao_itens', 'descricao_informacoes', 'finalidade_nda',
]);

function isExtracaoFalha(valor: string, campo?: string): boolean {
  const lower = valor.toLowerCase();
  if (FRASES_FALHA.some(f => lower.includes(f))) return true;
  // Para campos de texto longo, não rejeitar por tamanho
  if (campo && CAMPOS_TEXTO_LONGO.has(campo)) return false;
  return valor.length > 150;
}

// ============================================================
// Extração determinística por regex (layer 1 — sem IA)
// ============================================================

// ── Helpers internos do extrator ─────────────────────────────

function extrairEmpresa(texto: string, labels: string[]): string | null {
  // Tenta labels explícitos fornecidos
  for (const lbl of labels) {
    const m = texto.match(new RegExp(`${lbl}\\s*:?\\s*([^,\\n]{2,80})`, 'i'));
    if (m) return m[1].trim();
  }
  // Fallback: texto simples sem dígitos relevantes → nome da empresa
  if (/^[A-Za-zÀ-ÿ\s.&'"()-]+$/.test(texto.trim()) && texto.trim().length >= 2) return texto.trim();
  return null;
}

function extrairCNPJ(texto: string, preferLabel?: string): string | null {
  if (preferLabel) {
    const m = texto.match(new RegExp(`${preferLabel}\\s*:?\\s*([\\d.\\-/]{14,18})`, 'i'));
    if (m) { const d = m[1].replace(/\D/g, ''); if (d.length === 14) return d; }
  }
  // Tenta extrair CNPJ formatado (XX.XXX.XXX/XXXX-XX) primeiro
  const fmt = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  if (fmt) { const d = fmt[0].replace(/\D/g, ''); if (d.length === 14) return d; }
  // Sequência pura de 14 dígitos (só se não tiver 11 dígitos isolados antes/depois, para não confundir com CPF+3)
  const digits = texto.replace(/\D/g, '');
  if (digits.length === 14) return digits;
  // Busca 14 dígitos dentro de um texto maior
  const m = digits.match(/(\d{14})/);
  return m ? m[1] : null;
}

function extrairCPF(texto: string, preferLabel?: string): string | null {
  if (preferLabel) {
    const m = texto.match(new RegExp(`${preferLabel}\\s*:?\\s*([\\d.\\-]{11,14})`, 'i'));
    if (m) { const d = m[1].replace(/\D/g, '').slice(0, 11); if (d.length === 11) return d; }
  }
  const labeled = texto.match(/\bcpf\s*:?\s*([\d.\-]+)/i);
  if (labeled) { const d = labeled[1].replace(/\D/g, '').slice(0, 11); if (d.length === 11) return d; }
  // CPF formatado (XXX.XXX.XXX-XX)
  const fmt = texto.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  if (fmt) { const d = fmt[0].replace(/\D/g, ''); if (d.length === 11) return d; }
  // Sequência pura de 11 dígitos
  const digits = texto.replace(/\D/g, '');
  if (digits.length === 11) return digits;
  const m = texto.match(/(?<!\d)(\d{11})(?!\d)/);
  return m ? m[1] : null;
}

function extrairData(texto: string, labelRegex?: RegExp): string | null {
  const src = labelRegex
    ? (() => { const m = texto.match(labelRegex); return m ? texto.slice(m.index!) : texto; })()
    : texto;
  const m = src.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!m) return null;
  let [, dia, mes, ano] = m;
  if (ano.length === 2) ano = '20' + ano;
  return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano}`;
}

function extrairValorMonetario(texto: string, labelRegex?: RegExp): string | null {
  const src = labelRegex
    ? (() => { const m = texto.match(labelRegex); return m ? texto.slice(m.index!) : texto; })()
    : texto;
  const labeled = src.match(/(?:r\$|valor(?:\s+(?:total|unit[aá]rio|unitario))?\s*:?|total\s*:?|penalidade\s*:?|multa\s*:?)\s*([\d.,]+)/i);
  if (labeled) return labeled[1].replace(/\./g, '').replace(',', '.');
  const m = src.replace(/R\$\s?/g, '').match(/\b(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d{2,})\b/);
  if (m) return m[1].replace(/\./g, '').replace(',', '.');
  return null;
}

function extrairTextoLivre(texto: string, labels: string[], maxLen = 500): string | null {
  // Exige ":" após o label — evita capturar cabeçalhos de seção
  // (ex: "OBJETO E CONDICOES") ou o label embutido em prosa.
  for (const lbl of labels) {
    const m = texto.match(new RegExp(`\\b${lbl}\\s*:\\s*([^\\n]{2,${maxLen}})`, 'i'));
    if (m) return m[1].trim();
  }
  return null;
}

function extrairNumeroSimples(texto: string, labels: string[]): string | null {
  for (const lbl of labels) {
    const m = texto.match(new RegExp(`${lbl}\\s*:?\\s*(\\d+)`, 'i'));
    if (m) return m[1];
  }
  const m = texto.match(/\b(\d+)\b/);
  return m ? m[1] : null;
}

function extrairEndereco(texto: string): string | null {
  const labeled = texto.match(/endere[çc]o\s*:?\s*([^\n]{5,120})/i);
  if (labeled) return labeled[1].trim();
  return null;
}

// ─────────────────────────────────────────────────────────────
function extrairCampoManual(texto: string, campo: string): string | null {
  // ── Empresas / razões sociais ─────────────────────────────────
  // Todos os campos que representam nome de empresa: aceita labels variados
  if (campo.endsWith('_empresa') || campo === 'empresa' || campo === 'empresa_emitente' || campo === 'emitente_empresa') {
    return extrairEmpresa(texto, ['raz[aã]o\\s+social', 'empresa(?:\\s+emitente)?', 'emitente']);
  }
  if (campo === 'cliente_empresa' || campo === 'cliente_nome') {
    return extrairTextoLivre(texto, ['cliente', 'destinat[aá]rio', 'solicitante', 'raz[aã]o\\s+social']);
  }
  if (campo === 'divulgadora_empresa') {
    return extrairEmpresa(texto, ['raz[aã]o\\s+social', 'divulgadora', 'empresa']);
  }
  if (campo === 'receptora_empresa') {
    return extrairEmpresa(texto, ['raz[aã]o\\s+social', 'receptora', 'empresa']);
  }

  // ── CNPJ — 14 dígitos ──────────────────────────────────────
  if (campo.includes('cnpj') || campo === 'cliente_cnpj_cpf') {
    // cliente_cnpj_cpf pode ser CNPJ ou CPF — tenta os dois
    if (campo === 'cliente_cnpj_cpf') {
      const cnpj = extrairCNPJ(texto, 'cnpj');
      if (cnpj) return cnpj;
      return extrairCPF(texto, 'cpf');
    }
    return extrairCNPJ(texto, 'cnpj');
  }

  // ── CPF — 11 dígitos ───────────────────────────────────────
  if (campo.includes('cpf') && !campo.includes('cnpj')) {
    return extrairCPF(texto, 'cpf');
  }

  // ── RG ─────────────────────────────────────────────────────
  if (campo.includes('_rg')) {
    const labeled = texto.match(/\brg\s*:?\s*(\d[\d.\-]{6,10})/i);
    if (labeled) return labeled[1].replace(/\D/g, '');
    return null;
  }

  // ── Datas ──────────────────────────────────────────────────
  if (campo === 'data_inicio') {
    return extrairData(texto, /in[íi]cio\s*:?\s*/i) ?? extrairData(texto);
  }
  if (campo === 'data_fim') {
    // Segunda data no texto
    const allDates = [...texto.matchAll(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g)];
    if (allDates.length >= 2) {
      let [, dia, mes, ano] = allDates[1];
      if (ano.length === 2) ano = '20' + ano;
      return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano}`;
    }
    return null;
  }
  if (campo === 'data_assinatura' || campo === 'data_emissao' || campo === 'dataInicio' || campo === 'dataFim') {
    return extrairData(texto);
  }

  // ── Cidades e estados da proposta ─────────────────────────
  if (campo === 'emitente_cidade') {
    return extrairTextoLivre(texto, ['cidade(?:\\s+(?:do\\s+)?emitente)?', 'cidade']);
  }
  if (campo === 'emitente_estado') {
    const UFS = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
                         'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
                         'SP','SE','TO']);
    const labeled = texto.match(/(?:estado|uf)\s*[\(:]\s*([A-Za-z]{2})\b/i);
    if (labeled) { const uf = labeled[1].toUpperCase(); if (UFS.has(uf)) return uf; }
    return null;
  }

  // ── Endereço do emitente de orçamento ──────────────────────
  if (campo === 'endereco_emitente') {
    return extrairEndereco(texto);
  }

  // ── Valores monetários ─────────────────────────────────────
  if (campo === 'valor_total' || campo === 'valor') {
    return extrairValorMonetario(texto, /(?:valor\s*(?:total)?\s*:?|total\s*:?)/i);
  }
  if (campo === 'valor_total_proposta') {
    return extrairValorMonetario(texto, /(?:valor\s*(?:total)?\s*:?|total\s*:?)/i);
  }
  if (campo === 'valor_total_orcamento') {
    return extrairValorMonetario(texto, /(?:valor\s*(?:total)?\s*:?|total\s*:?)/i);
  }
  if (campo === 'valor_unitario') {
    return extrairValorMonetario(texto, /valor\s*unit[aá]rio\s*:?/i);
  }
  if (campo === 'penalidade_valor') {
    return extrairValorMonetario(texto, /(?:multa|penalidade)\s*:?/i);
  }

  // ── Endereços ──────────────────────────────────────────────
  if (campo.includes('endereco') || campo.includes('_endereco')) {
    return extrairEndereco(texto);
  }

  // ── Cidades ────────────────────────────────────────────────
  if (campo.includes('cidade') && !campo.includes('assinatura') && !campo.includes('emissao')) {
    return extrairTextoLivre(texto, ['cidade']);
  }
  if (campo === 'cidade_assinatura') {
    return extrairTextoLivre(texto, ['cidade\\s*(?:de\\s*)?assinatura', 'assinatura']) ?? extrairTextoLivre(texto, ['cidade']);
  }
  if (campo === 'cidade_emissao') {
    return extrairTextoLivre(texto, ['cidade\\s*(?:de\\s*)?emiss[aã]o', 'emiss[aã]o']) ?? extrairTextoLivre(texto, ['cidade']);
  }

  // ── Estado/UF ──────────────────────────────────────────────
  if (campo.includes('estado') && !campo.includes('civil')) {
    const UFS = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
                         'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
                         'SP','SE','TO']);
    const labeled = texto.match(/(?:estado|uf)\s*[\(:]\s*([A-Za-z]{2})\b/i);
    if (labeled) { const uf = labeled[1].toUpperCase(); if (UFS.has(uf)) return uf; }
    const all = [...texto.matchAll(/\b([A-Za-z]{2})\b/g)];
    for (const m of all) { const uf = m[1].toUpperCase(); if (UFS.has(uf)) return uf; }
    return null;
  }

  // ── Cargos (representantes legais) ────────────────────────
  if (campo.includes('cargo')) {
    return extrairTextoLivre(texto, ['cargo']);
  }

  // ── Nomes de representantes / responsáveis ─────────────────
  if (campo.endsWith('_nome') || campo.endsWith('_representante') || campo === 'responsavel' || campo === 'emitente_responsavel' || campo === 'responsavel_emitente' || campo === 'cliente_responsavel') {
    return extrairTextoLivre(texto, ['nome(?!\\s*(?:completo|da empresa|razão))?', 'representante', 'respons[aá]vel']);
  }

  // ── Objeto / Descrição de serviços ─────────────────────────
  if (campo === 'objeto_servicos') {
    return extrairTextoLivre(texto, ['objeto', 'servi[çc]o']) ?? (
      texto.length < 100 && !texto.match(/\d{2}\/\d{2}\/\d{4}/) && !texto.match(/cnpj|cpf/i)
        ? texto.trim() : null
    );
  }
  if (campo === 'descricao_servicos') {
    return extrairTextoLivre(texto, ['descri[çc][aã]o', 'servi[çc]os?', 'objeto']);
  }
  if (campo === 'escopo_detalhado') {
    return extrairTextoLivre(texto, ['escopo', 'entregas?', 'inclui']);
  }
  if (campo === 'descricao_itens') {
    return extrairTextoLivre(texto, ['descri[çc][aã]o', 'itens?', 'produtos?', 'servi[çc]os?']);
  }

  // ── Prazos numéricos ───────────────────────────────────────
  if (campo === 'aviso_previo' || campo === 'vigencia_meses') {
    return extrairNumeroSimples(texto, ['aviso\\s*pr[eé]vio', 'vig[eê]ncia']);
  }
  if (campo === 'prazo_confidencialidade') {
    return extrairNumeroSimples(texto, ['prazo\\s*(?:de\\s*)?sigilo', 'confidencialidade', 'prazo']);
  }
  if (campo === 'validade_proposta' || campo === 'validade_orcamento') {
    return extrairNumeroSimples(texto, ['validade']);
  }
  if (campo === 'prazo_entrega' || campo === 'prazo_execucao') {
    return extrairTextoLivre(texto, ['prazo\\s*(?:de\\s*)?(?:entrega|execu[çc][aã]o)', 'prazo']);
  }

  // ── Pagamento / Forma ──────────────────────────────────────
  if (campo === 'forma_pagamento') {
    return extrairTextoLivre(texto, ['pagamento', 'forma\\s*(?:de\\s*)?pagamento']);
  }
  if (campo === 'dia_pagamento') {
    const m = texto.match(/\bdia\s+(\d{1,2})\b/i) || texto.match(/vencimento\s*:?\s*(\d{1,2})/i);
    return m ? m[1] : null;
  }

  // ── Quantidade / Unidade ───────────────────────────────────
  if (campo === 'quantidade_unidade') {
    return extrairTextoLivre(texto, ['quantidade', 'qtd', 'unidade']);
  }

  // ── Foro ──────────────────────────────────────────────────
  if (campo === 'foro_comarca') {
    return extrairTextoLivre(texto, ['foro', 'comarca']);
  }

  // ── Contato: e-mail ────────────────────────────────────────
  if (campo.includes('email') || campo.includes('e_mail')) {
    const m = texto.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    return m ? m[0] : null;
  }

  // ── Contato: telefone ──────────────────────────────────────
  if (campo.includes('telefone')) {
    const m = texto.match(/(?:\+55\s?)?(?:\(?\d{2}\)?\s?)[\d\s\-]{8,11}/);
    return m ? m[0].trim() : null;
  }

  // ── Nacionalidade ──────────────────────────────────────────
  if (campo.includes('nacionalidade')) {
    return extrairTextoLivre(texto, ['nacionalidade']);
  }

  // ── Estado civil ──────────────────────────────────────────
  if (campo.includes('estado_civil')) {
    return extrairTextoLivre(texto, ['estado\\s+civil']);
  }

  // ── Profissão ─────────────────────────────────────────────
  if (campo.includes('profissao')) {
    return extrairTextoLivre(texto, ['profiss[aã]o']);
  }

  // ── Finalidade (NDA) ──────────────────────────────────────
  if (campo === 'finalidade_nda') {
    return extrairTextoLivre(texto, ['finalidade', 'objetivo', 'prop[oó]sito']);
  }

  // ── Informações confidenciais (NDA) ───────────────────────
  if (campo === 'descricao_informacoes') {
    return extrairTextoLivre(texto, ['informa[çc][oõ]es?', 'confidencial', 'tipo(?:\\s+de)?\\s+informa']);
  }

  // ── Campos de texto longo (título, resumo, resultados, recomendações) ──
  if (campo === 'titulo_relatorio') {
    return extrairTextoLivre(texto, ['t[íi]tulo', 'nome\\s+(?:do\\s+)?relat[oó]rio']);
  }
  if (campo === 'resumo_executivo') {
    return extrairTextoLivre(texto, ['resumo\\s*(?:executivo)?']);
  }
  if (campo === 'principais_resultados') {
    return extrairTextoLivre(texto, ['resultados?', 'principais?\\s+resultados?']);
  }
  if (campo === 'recomendacoes') {
    return extrairTextoLivre(texto, ['recomenda[çc][oõ]es?']);
  }

  // ── Todos os outros: deixa o LLM decidir ──────────────────
  return null;
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

## EXTRAÇÃO DE CAMPOS IDENTIFICADOS POR LABEL
Procure labels explícitos no formato "Label: Valor" ou "Label — Valor".
Labels aceitos (exemplos — não exaustivos):
- Empresa, Razão social, Emitente, Divulgadora, Receptora → campo de empresa
- CNPJ → 14 dígitos sem formatação
- CPF, CPF do representante → 11 dígitos sem formatação
- Representante, Nome, Responsável → nome da pessoa física
- Cargo, Função → cargo do representante
- Endereço → endereço completo incluindo número
- E-mail, Email → endereço de e-mail
- Telefone, Fone → número de telefone
- Finalidade, Objetivo → finalidade do documento (NDA)
- Informações, Confidencial → descrição de informações protegidas (NDA)
- Prazo de sigilo, Confidencialidade → número de anos de sigilo
- Vigência → número de meses de vigência
- Multa, Penalidade → valor monetário da multa
- Título, Nome do relatório → título do relatório
- Resumo, Resumo executivo → texto do resumo
- Resultados, Principais resultados → texto dos resultados
- Recomendações → texto das recomendações
- Descrição, Serviços → descrição dos serviços prestados
- Escopo, Entregas → escopo detalhado do projeto
- Itens, Produtos → itens do orçamento
- Quantidade, Qtd → quantidade e unidade
- Prazo de entrega, Prazo de execução → prazo em texto livre
- Validade → número de dias de validade
- Pagamento, Forma de pagamento → condição de pagamento em texto

## LISTA SEM LABELS
Se a mensagem for uma lista implícita (sem labels), associe cada item ao campo na ORDEM da lista de campos fornecida na instrução.

## NORMALIZAÇÃO
- CNPJ: apenas 14 dígitos. Ex: "12.345.678/0001-99" → "12345678000199"
- CPF: apenas 11 dígitos. Ex: "123.456.789-01" → "12345678901"
- RG: apenas dígitos. Ex: "12.345.678-9" → "123456789"
- Datas: DD/MM/AAAA. Ex: "01-07-26" → "01/07/2026"
- Valores monetários: só o número inteiro ou decimal. Ex: "R$ 50.000,00" → "50000", "R$ 25.500,50" → "25500.50"
- Prazos numéricos (anos, meses, dias): só o número. Ex: "5 anos" → "5", "24 meses" → "24"
- Estado (UF): sigla 2 letras maiúsculas. Ex: "São Paulo" → "SP"
- Textos livres (cargo, nome, objeto, descrição, resumo, recomendações): mantenha o texto completo, capitalize normalmente.

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
    const { content, provider } = await llmCall(
      {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_MULTI },
          { role: 'user',   content: userPrompt },
        ],
        taskType:    'extraction',
        temperature: 0,
        max_tokens:  900,
      },
      'extrairMultiplosCampos'
    );

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Resposta sem JSON válido');

    const extracted: Record<string, unknown> = JSON.parse(jsonMatch[0]);

    for (const campo of camposParaLLM) {
      const val = extracted[campo.field];
      if (typeof val === 'string' && val.trim() && !isExtracaoFalha(val, campo.field)) {
        resultado[campo.field] = val.trim();
      }
    }

    logger.debug(
      { fields: camposParaLLM.map(c => c.field), found: Object.keys(resultado).length, provider },
      '[LLM] Extração multi-campo concluída'
    );
  } catch (err) {
    logger.error(
      { err, campos: camposParaLLM.map(c => c.field) },
      '[LLM] Erro na extração multi-campo'
    );
  }

  return resultado;
}

// ============================================================
// Extração de campos a partir de um DOCUMENTO anexado (PDF/DOCX/etc)
// ============================================================

// Limite maior que o de chat — um documento tem muito mais texto.
const MAX_DOC_CHARS = 12_000;

/**
 * Extrai TODOS os campos de um workflow a partir do texto de um documento.
 * Diferente de extrairMultiplosCampos (que olha a mensagem de chat e um grupo),
 * aqui varremos o documento inteiro contra todos os campos de uma vez.
 * Campos não encontrados simplesmente não aparecem no resultado.
 */
// Limpeza de valor: remove "label do próximo campo" colado e rejeita lixo.
function limparValorCampo(raw: string, campo: WorkflowStep): string | null {
  let v = raw.trim();
  if (!v || isExtracaoFalha(v, campo.field)) return null;
  // Corta a partir de um "Label:" embutido — só uma ÚNICA palavra seguida de ":".
  v = v.replace(/\s+[A-Za-zÀ-ú]{3,15}:\s.*$/, '').trim();
  if (!v) return null;
  const ehLongo = ['objeto_servicos', 'escopo', 'resumo', 'resultados', 'recomendacoes', 'descricao_itens'].some(k => campo.field.includes(k));
  if (!ehLongo) {
    if (v.length > 120) return null;
    if ((v.match(/,/g) || []).length >= 3) return null;
  }
  if (campo.validator && !campo.validator(v)) return null;
  return v;
}

// Extrai um conjunto de campos de um trecho de texto (regex + LLM).
async function extrairBloco(
  texto: string,
  campos: WorkflowStep[],
  contexto: string
): Promise<Record<string, string>> {
  const resultado: Record<string, string> = {};
  const camposParaLLM: WorkflowStep[] = [];
  for (const campo of campos) {
    const valor = extrairCampoManual(texto, campo.field);
    const limpo = valor ? limparValorCampo(valor, campo) : null;
    if (limpo) resultado[campo.field] = limpo;
    else camposParaLLM.push(campo);
  }
  if (camposParaLLM.length === 0) return resultado;

  const fieldDescriptions = camposParaLLM
    .map(c => {
      const parts = [`"${c.field}": ${c.question}`];
      if (c.example) parts.push(`(ex: ${c.example})`);
      return parts.join(' ');
    })
    .join('\n');
  const expectedKeys = camposParaLLM.map(c => `"${c.field}"`).join(', ');

  const userPrompt = `Você recebeu o TEXTO DE UM DOCUMENTO${contexto ? ` (${contexto})` : ''}. Extraia dele os campos abaixo.

CAMPOS A EXTRAIR:
${fieldDescriptions}

TEXTO:
"""
${texto}
"""

INSTRUÇÕES (LEIA COM ATENÇÃO):
- Extraia um campo APENAS se o valor estiver CLARAMENTE e EXPLICITAMENTE no texto.
- Na dúvida, retorne "" — é MELHOR deixar vazio do que preencher errado.
- Extraia APENAS o valor (ex: "Tech Soluções Ltda", não "Razão social: Tech Soluções Ltda").
- NUNCA junte dados de campos diferentes num mesmo campo.
- NUNCA copie trechos de cláusulas, parágrafos ou frases inteiras para um campo.
- NUNCA use o título/cabeçalho de uma seção como valor (ex: "OBJETO E CONDICOES" NÃO é um objeto válido).
- Um campo de NOME recebe só um nome; CARGO só um cargo; ESTADO só a sigla (2 letras).
- Se houver placeholders genéricos (ex: "Nome / CPF"), trate como NÃO preenchido e retorne "".
- Quando dois campos estiverem na MESMA linha (ex: "Cidade: Sao Paulo  Estado: SP"), separe corretamente.
- Normalize: CNPJ/CPF só números, datas DD/MM/AAAA, valores sem "R$" com ponto decimal.
- Não invente, não deduza, não complete dados que não estejam escritos.

Retorne JSON com exatamente estas chaves: { ${expectedKeys} }`;

  try {
    const { content } = await llmCall(
      {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_MULTI },
          { role: 'user',   content: userPrompt },
        ],
        taskType:    'extraction',
        temperature: 0,
        max_tokens:  1200,
      },
      'extrairBloco'
    );
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Resposta sem JSON válido');
    const extracted: Record<string, unknown> = JSON.parse(jsonMatch[0]);
    for (const campo of camposParaLLM) {
      const val = extracted[campo.field];
      if (typeof val !== 'string') continue;
      const limpo = limparValorCampo(val, campo);
      if (limpo) resultado[campo.field] = limpo;
    }
  } catch (err) {
    logger.error({ err, contexto }, '[LLM] Erro na extração de bloco');
  }
  return resultado;
}

// Separa o texto na seção da CONTRATADA, se houver marcador claro.
// Retorna { contratante, contratado } com os trechos, ou null se não der pra separar.
function segmentarPartes(texto: string): { contratante: string; contratado: string } | null {
  // Procura o marcador de início da CONTRATADA (com ou sem acento, com variações)
  const m = texto.match(/\b(CONTRATAD[AO]|DADOS\s+DA\s+CONTRATAD[AO]|CONTRATAD[AO]\s*:)/i);
  if (!m || m.index === undefined || m.index < 30) return null;
  return {
    contratante: texto.slice(0, m.index),
    contratado: texto.slice(m.index),
  };
}

export async function extrairCamposDeDocumento(
  textoDocumento: string,
  todosCampos: WorkflowStep[]
): Promise<Record<string, string>> {
  const texto = textoDocumento.slice(0, MAX_DOC_CHARS);

  // Campos divididos por papel (contratante_*, contratado_*) e os demais (comuns)
  const camposContratante = todosCampos.filter(c => c.field.startsWith('contratante_'));
  const camposContratado  = todosCampos.filter(c => c.field.startsWith('contratado_'));
  const camposComuns      = todosCampos.filter(c => !c.field.startsWith('contratante_') && !c.field.startsWith('contratado_'));

  const seg = (camposContratante.length > 0 && camposContratado.length > 0)
    ? segmentarPartes(texto)
    : null;

  let resultado: Record<string, string> = {};

  if (seg) {
    // Extrai cada parte do SEU trecho — evita cruzar dados entre contratante/contratado
    const [rContratante, rContratado, rComuns] = await Promise.all([
      extrairBloco(seg.contratante, camposContratante, 'dados da CONTRATANTE'),
      extrairBloco(seg.contratado, camposContratado, 'dados da CONTRATADA'),
      extrairBloco(texto, camposComuns, 'condições gerais do contrato'),
    ]);
    resultado = { ...rContratante, ...rContratado, ...rComuns };
    logger.info(
      { modo: 'segmentado', totalCampos: todosCampos.length, extraidos: Object.keys(resultado).length },
      '[Groq] Extração de campos do documento concluída'
    );
  } else {
    // Documento sem seções claras de partes — extrai tudo de uma vez
    resultado = await extrairBloco(texto, todosCampos, 'documento');
    logger.info(
      { modo: 'unico', totalCampos: todosCampos.length, extraidos: Object.keys(resultado).length },
      '[Groq] Extração de campos do documento concluída'
    );
  }

  return resultado;
}

// ============================================================
// Geração de resposta conversacional — dá voz humana à IA
// ============================================================

export interface RespostaConversacionalInput {
  situacao: 'boas_vindas' | 'inicio_workflow' | 'campos_salvos' | 'campos_invalidos'
          | 'sem_extracao' | 'workflow_completo' | 'cancelado' | 'ajuda'
          | 'confirmado' | 'editando_campo' | 'campo_nao_encontrado' | 'chat_livre'
          | 'explicar_campo' | 'sugerir_padrao' | 'perguntas_sobre_plataforma';
  tipoDocumento?: string;
  camposSalvos?: string[];      // labels legíveis dos campos
  camposInvalidos?: string[];   // mensagens de erro
  camposFaltando?: string[];    // labels dos campos pendentes no grupo
  grupAtual?: string;           // label do grupo atual
  totalGrupos?: number;         // total de grupos do workflow (para informar ao usuário)
  nextQuestion?: string;        // TEXTO EXATO da próxima pergunta — a IA DEVE usar isso literalmente
  campoCorrendo?: string;       // label do campo que está sendo corrigido
  resumoFinal?: string;         // markdown do resumo dos dados
  mensagemUsuario?: string;     // mensagem original (para contexto)
  dadosDocumento?: Record<string, string>; // dados coletados, para responder perguntas livres
  clausulasDocumento?: string[];           // lista de cláusulas do documento (para chat pós-geração)
  historicoRecente?: Array<{ role: 'user' | 'assistant'; content: string }>; // últimos turns
  contextoArquivos?: Array<{ nome: string; conteudo: string }>; // arquivos anexados à conversa
}

const SYSTEM_CONVERSACIONAL = `Você é a BepeAI, especialista em automação documental jurídica para empresas brasileiras.

Seu papel duplo: (1) conduzir coleta de dados para documentos jurídicos profissionais e (2) atuar como consultora documental — explicando campos, cláusulas, obrigatoriedades e boas práticas, tanto durante quanto após a coleta.

═══════════════════════════════════════════
IDENTIDADE E FUNCIONAMENTO DA PLATAFORMA
═══════════════════════════════════════════

O QUE É O BEPEAI:
• Plataforma de automação documental jurídica via chat conversacional
• Você coleta dados através de uma conversa guiada e gera documentos jurídicos profissionais em PDF
• Atende empresas brasileiras que precisam formalizar relações comerciais sem precisar de advogado para cada documento padrão

COMO FUNCIONA (passo a passo que você deve saber explicar):
1. Usuário inicia dizendo o tipo de documento que quer criar
2. Você conduz a coleta de dados por etapas (grupos de campos relacionados)
3. Quando todos os dados estão preenchidos, o usuário clica em "Gerar PDF"
4. O PDF é gerado com layout profissional, cláusulas jurídicas completas e dados inseridos
5. O usuário baixa e usa imediatamente — assinatura digital pode ser feita externamente

DOCUMENTOS DISPONÍVEIS (o que você consegue criar hoje):
• **Contrato de Prestação de Serviços** — formaliza contratação de serviço ou profissional
• **Proposta Comercial** — oferta formal com escopo, prazo e valor; tem prazo de validade
• **Orçamento** — detalhamento de custos para aprovação ou cotação
• **Relatório Final** — consolidação de resultados de projeto ou período
• **Acordo de Confidencialidade (NDA)** — proteção de informações estratégicas antes de parcerias

CUSTOMIZAÇÃO E LIMITES (responda com honestidade):
• Layout de PDF: atualmente o sistema usa templates padrão profissionais; personalização com logo/cores da empresa do cliente NÃO está disponível ainda — é uma funcionalidade prevista para versões futuras
• Modelos personalizados por empresa: não disponível ainda; todos usam o mesmo template padrão BepeAI
• Campos adicionais fora do template: não é possível pelo chat — o template tem campos fixos por tipo de documento
• Exportação em DOCX: apenas PDF por enquanto
• Integração com sistemas externos (ERP, CRM): não disponível
• Assinatura digital integrada: não disponível — o PDF pode ser assinado externamente em DocuSign, ClickSign etc.
• Acesso: via convite — a plataforma não é aberta ao público geral; novos usuários precisam de token de convite

QUANDO UM USUÁRIO PERGUNTAR SOBRE FUNCIONALIDADES NÃO DISPONÍVEIS:
• Seja honesto: diga claramente que a funcionalidade ainda não existe
• Nunca prometa prazos que não foram confirmados
• Sugira alternativas quando houver (ex: "para logo na capa, você pode adicionar ao assinar externamente")
• Registre o interesse: "Anoto que essa funcionalidade seria útil para você — é um pedido válido para futuras versões"

═══════════════════════════════════════════
PERSONALIDADE E TOM
═══════════════════════════════════════════
• Profissional, direta, confiante — nunca robótica nem excessivamente formal
• Linguagem executiva brasileira: clara, precisa, sem jargão desnecessário
• Confirma recebimentos de forma natural e sucinta
• NUNCA começa com "Claro!", "Com certeza!", "Ótimo!" — use frases mais sofisticadas
• Mensagens curtas: 3–6 linhas no máximo durante a coleta; até 10 linhas para explicações
• Máximo 1 emoji por mensagem, apenas quando genuinamente agrega valor

═══════════════════════════════════════════
BASE DE CONHECIMENTO JURÍDICO
═══════════════════════════════════════════

CNPJ (Cadastro Nacional de Pessoas Jurídicas):
• 14 dígitos que identificam uma empresa perante a Receita Federal
• Formato: XX.XXX.XXX/XXXX-XX — mas você aceita qualquer formato e normaliza
• Por que é obrigatório: valida que a empresa existe legalmente; sem CNPJ o documento não tem valor probatório em disputas judiciais
• Se alguém perguntar "preciso mesmo do CNPJ?": sim, é essencial para qualquer documento B2B

CPF (Cadastro de Pessoas Físicas):
• 11 dígitos que identificam o representante legal que assina pelo CNPJ
• Por que é necessário: a assinatura no documento é de uma pessoa física em nome da empresa; sem CPF não há como identificar o signatário
• Se alguém não tiver em mãos: peça que consulte no cartão ou no gov.br

RG (Registro Geral):
• Documento de identidade estadual — pode ter formato variado por estado
• No contrato, identifica o representante legal com mais precisão que o CPF
• Se alguém perguntar "qual documento?": RG da carteira de identidade mesmo

OBJETO DO CONTRATO / OBJETO DOS SERVIÇOS:
• A cláusula mais importante do contrato — define exatamente o que foi contratado
• Se for vago ("consultoria"), em caso de disputa judicial ninguém sabe o que era para entregar
• Boas práticas: ser específico ("desenvolvimento de sistema web de gestão de estoque com módulos X, Y, Z")
• Se o usuário escrever algo genérico, oriente gentilmente a ser mais específico

FORO (Comarca):
• Define qual cidade/tribunal será competente para julgar disputas deste contrato
• Geralmente é a cidade da empresa contratante ou onde o serviço é prestado
• Por que importa: se não definir, qualquer parte pode acionar em qualquer comarca do Brasil
• Exemplo: "São Paulo", "Belo Horizonte", "Rio de Janeiro"

VIGÊNCIA / PRAZO DO CONTRATO:
• Data de início e data de fim da relação contratual
• Importante: datas no formato DD/MM/AAAA
• Contratos sem data de fim são por prazo indeterminado — não recomendado para serviços pontuais

AVISO PRÉVIO (rescisão):
• Quantos dias antes uma parte precisa notificar a outra para rescindir sem penalidade
• Padrão de mercado: 30 dias para contratos de prestação de serviços
• Proteção mútua: dá tempo para quem presta reorganizar agenda; para quem contrata encontrar substituto

VALOR E FORMA DE PAGAMENTO:
• Valor total: sempre em reais; o extenso é gerado automaticamente
• Forma de pagamento: "50% na assinatura, 50% na entrega", "mensal", "parcelado em 3x", etc.
• Dia de vencimento: dia do mês em que o pagamento é devido (ex: dia 10, dia 30)

PROPOSTA COMERCIAL — diferença para contrato:
• Proposta é uma oferta formal, não um compromisso — tem prazo de validade; se aceita, gera um contrato; se expirar, pode ser renegociada
• Validade típica: 15 a 30 dias — após esse prazo o emitente pode reajustar valores e condições
• Escopo detalhado é fundamental — define o que está incluído e protege o emitente de pedidos extras fora do escopo original ("isso não estava na proposta")
• A forma de aceite mais comum: resposta por e-mail, assinatura do documento, ou emissão de pedido de compra pelo cliente
• Diferença entre descrição e escopo: descrição é o resumo executivo (o quê e para quê); escopo é a lista de entregas concretas (o como e o quanto)
• "Prazo de entrega" começa a contar: sempre da data de aceite + pagamento da entrada, nunca da emissão da proposta
• Perguntas comuns sobre proposta:
  - "Preciso do CNPJ do cliente?" → Sim — vincula a proposta a uma empresa específica; evita confusão em grupos com vários CNPJs
  - "O que colocar no escopo?" → Liste cada entrega como bullet point separado por ";" — ex: "Levantamento de requisitos; design UX/UI; desenvolvimento; testes; deploy"
  - "Validade muito curta ou longa?" → Muito curta (<7 dias) gera pressão desnecessária; muito longa (>60 dias) expõe você a variação de custos

ORÇAMENTO — diferença para proposta:
• Orçamento é mais objetivo que proposta — foca em custo e quantidade, sem o conteúdo de apresentação comercial
• Mais usado para: cotações de fornecedores, licitações públicas (que exigem 3 orçamentos), aprovação interna de despesas, escopo de serviços técnicos
• Não gera obrigação jurídica sozinho — precisa de aceite formal (pedido de compra, contrato ou nota de encomenda)
• Validade mais curta que proposta: 15 dias é o padrão — preços de serviços técnicos e materiais variam rapidamente
• Valor unitário × quantidade = valor total: se for um serviço único, unitário e total são iguais
• CNPJ ou CPF do solicitante: pessoa jurídica usa CNPJ (14 dígitos); pessoa física usa CPF (11 dígitos)
• Perguntas comuns sobre orçamento:
  - "Preciso colocar impostos?" → O sistema não calcula impostos automaticamente; você pode incluir na descrição dos valores (ex: "já inclui ISS de 5%")
  - "Prazo de execução começa quando?" → Da data de aceite e pagamento inicial — não da emissão do orçamento
  - "O orçamento vira contrato?" → Não automaticamente; o aceite do orçamento cria um compromisso, mas um contrato formal é recomendado para valores acima de R$ 5.000

NDA (Acordo de Confidencialidade):
• Protege informações estratégicas trocadas antes de uma parceria, negociação ou contratação
• Parte Divulgadora: quem compartilha as informações (geralmente quem tem o segredo)
• Parte Receptora: quem recebe e se compromete a manter sigilo
• Vigência: tempo de duração do NDA (ex: 12 meses do projeto)
• Prazo de confidencialidade: tempo que o sigilo continua após o NDA encerrar (ex: 3 anos)
• Penalidade: valor da multa por violação — deve ser alto o suficiente para ser dissuasivo
• Se alguém perguntar "quanto colocar de penalidade?": entre 10% e 50% do valor do negócio envolvido é padrão

RELATÓRIO FINAL:
• Documento gerencial que consolida atividades, resultados e aprendizados de um período ou projeto
• Fundamental para: compliance, auditorias internas, prestação de contas a sócios/investidores, avaliação de desempenho, controle de gestão
• Não é um contrato — não gera obrigações entre partes, mas tem valor probatório em auditorias e disputas societárias
• Estrutura: quatro blocos principais — Identificação → Período → Resultados → Recomendações

CAMPOS DO RELATÓRIO (como orientar o usuário):
• **Empresa e CNPJ**: a organização que emite o relatório (não necessariamente a que é analisada)
• **Responsável e Cargo**: quem elaborou e assina; o cargo define a autoridade do documento (ex: Diretor Financeiro tem mais peso que Analista)
• **Título**: deve ser descritivo — inclua tema + período (ex: "Relatório de Desempenho Comercial — 1º Semestre 2026"); um título vago dificulta a recuperação em auditorias futuras
• **Período (datas de início e fim)**: delimita exatamente qual intervalo de tempo é coberto — essencial para comparação com períodos anteriores
• **Resumo executivo**: lido pela diretoria/sócios; deve ter 2–4 frases capturando o número mais importante e o contexto geral. Exemplo: "O 1º semestre de 2026 apresentou crescimento de 18% em receita, impulsionado pela expansão para 2 novos estados e entrega de 3 projetos estratégicos no prazo."
• **Principais resultados**: dados concretos e verificáveis — use números sempre (%, R$, quantidade); separe por ponto e vírgula. Exemplo: "Crescimento de 18% em receita; entrega de 3 projetos; redução de 12% em custos operacionais; NPS 98%"
• **Recomendações**: transforma o relatório em instrumento de gestão ativo — não só registra o passado, mas orienta o futuro. Deve ser específico: ação + responsável ou prazo quando souber. Exemplo: "Ampliar equipe de vendas em 2 profissionais até agosto; automatizar processo de faturamento; iniciar prospecção no segmento enterprise"

PERGUNTAS COMUNS SOBRE RELATÓRIO:
• "Por que preciso do CNPJ no relatório?" → Identifica formalmente quem emitiu o documento; em auditorias externas, relatórios sem identificação corporativa completa podem ser rejeitados
• "O resumo executivo precisa ser formal?" → Deve ser objetivo e factual, mas não precisa de linguagem jurídica — foco em clareza para quem lê rápido
• "Posso colocar só resultados positivos?" → Tecnicamente sim, mas relatórios que omitem problemas têm menos credibilidade em auditorias; recomende incluir desafios identificados
• "O que colocar nas recomendações se não tiver sugestões?" → Pelo menos: confirmar continuidade do que funcionou, e identificar 1–2 pontos de atenção para o próximo ciclo

═══════════════════════════════════════════
PROBLEMAS COMUNS QUE VOCÊ PREVINE
═══════════════════════════════════════════
• Usuário fornece CNPJ com pontos/barras/traços → você normaliza silenciosamente, não pede para repetir
• Usuário fornece data em formato errado (01-07-26) → você converte para DD/MM/AAAA automaticamente
• Usuário escreve objeto genérico ("consultoria") → você gentilmente pede mais detalhes
• Usuário não sabe o que é "foro" → você explica em 1 frase e dá exemplos
• Usuário pergunta "posso pular esse campo?" → você explica a importância mas respeita a decisão
• Usuário parece confuso com múltiplas perguntas → você foca na mais importante e aguarda
• Usuário tenta fornecer dados de um grupo enquanto outro está em andamento → você salva o que conseguir e avança

═══════════════════════════════════════════
CAPACIDADES DE CÁLCULO E CONSULTA
═══════════════════════════════════════════
• "Qual o valor por mês?" → divide valor_total pelo número de meses do contrato
• "Quem é o contratante?" → busca nos dados e responde com nome e empresa
• "Qual a data de vencimento?" → informa data_fim do contrato
• "Quanto falta para terminar?" → calcula com base em data_fim e data atual
• "Qual o valor total em extenso?" → converte o número para texto por extenso

═══════════════════════════════════════════
REGRAS ABSOLUTAS
═══════════════════════════════════════════
• NUNCA invente dados que não foram fornecidos pelo usuário
• Use **negrito** para destacar nomes, valores e datas importantes
• Use bullet points (•) para listas — nunca hífens soltos ou asteriscos
• Responda SOMENTE o texto da mensagem — sem meta-comentários como "Aqui está minha resposta:"
• Durante a coleta: responda perguntas do usuário e SEMPRE retorne à coleta na mesma mensagem`;


// Monta bloco de contexto dos dados coletados — injetado em todos os prompts
function buildContextoDocumento(input: RespostaConversacionalInput): string {
  const dados = input.dadosDocumento ?? {};
  const temDados = Object.keys(dados).length > 0;
  const arquivos = input.contextoArquivos ?? [];
  const temArquivos = arquivos.length > 0;
  if (!temDados && !input.tipoDocumento && !temArquivos) return '';

  const linhas: string[] = [];
  if (input.tipoDocumento) {
    linhas.push(`DOCUMENTO EM ELABORAÇÃO: ${input.tipoDocumento}`);
  }
  if (temDados) {
    linhas.push('DADOS JÁ COLETADOS (use para responder perguntas do usuário):');
    for (const [k, v] of Object.entries(dados)) {
      linhas.push(`  ${k}: ${v}`);
    }
  }
  if (temArquivos) {
    linhas.push('');
    linhas.push('ARQUIVOS ANEXADOS PELO USUÁRIO (use o conteúdo abaixo para responder perguntas sobre os arquivos, resumir, extrair dados ou comparar):');
    for (const a of arquivos) {
      linhas.push(`\n━━━ Arquivo: ${a.nome} ━━━\n${a.conteudo}\n━━━ Fim de ${a.nome} ━━━`);
    }
  }
  return linhas.join('\n');
}

export async function gerarRespostaConversacional(
  input: RespostaConversacionalInput
): Promise<string | null> {
  const contextoDocumento = buildContextoDocumento(input);
  let prompt = '';

  // Prefixo de contexto — injetado em todos os prompts quando há dados coletados
  const ctxPrefix = contextoDocumento ? `${contextoDocumento}\n\n` : '';

  switch (input.situacao) {
    case 'boas_vindas':
      prompt = `${ctxPrefix}O usuário acabou de entrar na plataforma BepeAI. Dê boas-vindas de forma executiva e confiante.

Apresente os 5 tipos de documento com uma linha de quando usar cada um:
• **Contrato de Prestação de Serviços** — para formalizar a contratação de um serviço ou profissional
• **Proposta Comercial** — para apresentar uma oferta formal com escopo, prazo e valor
• **Orçamento** — para detalhar custos antes de fechar negócio ou para cotação
• **Relatório Final** — para consolidar resultados de um projeto ou período
• **Acordo de Confidencialidade (NDA)** — para proteger informações antes de uma parceria ou negociação

Finalize com: "Qual desses você precisa agora? Se não souber qual escolher, me conte o que precisa fazer e eu indico."
Tom: profissional, acolhedor, direto. Máximo 10 linhas.`;
      break;

    case 'inicio_workflow': {
      const NOMES_DOCUMENTO: Record<string, string> = {
        contrato:           'Contrato de Prestação de Serviços',
        proposta_comercial: 'Proposta Comercial',
        orcamento:          'Orçamento',
        relatorio_final:    'Relatório Final',
        nda:                'Acordo de Confidencialidade (NDA)',
      };
      const CONTEXTO_DOCUMENTO: Record<string, string> = {
        contrato:           'Este contrato formaliza a prestação de serviços entre duas empresas, protegendo ambas as partes quanto a escopo, pagamento, prazo e propriedade intelectual.',
        proposta_comercial: 'Esta proposta é uma oferta formal com validade definida — se aceita, origina um contrato. É o seu cartão de visitas comercial.',
        orcamento:          'Este orçamento detalha custos e condições para aprovação — não é um contrato, mas é o primeiro passo formal para fechar negócio.',
        relatorio_final:    'Este relatório consolida atividades e resultados de um período — fundamental para compliance, prestação de contas e auditorias.',
        nda:                'Este NDA protege informações confidenciais trocadas entre as partes antes ou durante uma parceria. Essencial antes de revelar dados estratégicos.',
      };
      const nomeDoc = (input.tipoDocumento && NOMES_DOCUMENTO[input.tipoDocumento])
        ? NOMES_DOCUMENTO[input.tipoDocumento]
        : (input.tipoDocumento ?? 'documento');
      const contextoDoc = (input.tipoDocumento && CONTEXTO_DOCUMENTO[input.tipoDocumento])
        ? CONTEXTO_DOCUMENTO[input.tipoDocumento]
        : '';
      const etapasInfo = input.totalGrupos
        ? `Este documento será coletado em **${input.totalGrupos} etapas** rápidas.`
        : 'Este documento será coletado em algumas etapas rápidas.';
      prompt = `${ctxPrefix}O usuário quer criar: ${nomeDoc}.
${contextoDoc ? `Contexto do documento: ${contextoDoc}` : ''}

Confirme o início da coleta. Informe: ${etapasInfo}
Diga que pode fornecer vários dados de uma vez (ex: "Empresa X, CNPJ 12345678000199, endereço Rua Y") para agilizar.
Faça a primeira pergunta do grupo "${input.grupAtual}" usando EXATAMENTE o texto da nextQuestion fornecida.
Tom: profissional, acolhedor, claro. Máximo 6 linhas.`;
      break;
    }

    case 'campos_salvos': {
      const progressoInfo = input.totalGrupos && input.grupAtual
        ? ` (continuando para: ${input.grupAtual})`
        : '';
      prompt = `${ctxPrefix}Campos salvos com sucesso: ${input.camposSalvos?.join(', ') ?? ''}.

Confirme o recebimento em UMA frase curta e natural (ex: "Dados registrados.", "Perfeito, anotado.").
${input.nextQuestion
  ? `Em seguida, faça EXATAMENTE esta pergunta${progressoInfo} (pode reformular levemente para soar natural, mas mantenha todos os campos pedidos):\n\n${input.nextQuestion}\n\nDICA PROATIVA (inclua quando relevante): se a pergunta pede CNPJ, mencione que aceita com ou sem pontuação. Se pede datas, mencione formato DD/MM/AAAA. Se pede valor monetário, mencione que pode digitar só os números.`
  : `Grupo "${input.grupAtual}" concluído${progressoInfo}. Informe de forma breve que vai avançar para o próximo conjunto de dados.`
}

REGRAS: Não liste os campos já salvos. Não invente campos. Máximo 6 linhas.`;
      break;
    }
      break;

    case 'campos_invalidos':
      prompt = `${ctxPrefix}O usuário forneceu dados, mas alguns têm problemas de formato:
${input.camposInvalidos?.map(e => `• ${e}`).join('\n') ?? ''}
${input.camposSalvos?.length ? `\nSalvos com sucesso:\n${input.camposSalvos.map(c => `• ${c}`).join('\n')}` : ''}

Explique o problema de forma CONSTRUTIVA e educativa (ex: "CNPJ precisa ter 14 dígitos — o que você enviou tem X dígitos").
Use sua base de conhecimento para explicar por que o formato correto é importante.
Peça para reenviar APENAS os campos com problema, em uma linha só.
Máximo 5 linhas.`;
      break;

    case 'sem_extracao':
      prompt = `${ctxPrefix}O usuário enviou: "${input.mensagemUsuario}".
Não consegui identificar os dados para o grupo "${input.grupAtual}".

PASSO 1 — Analise a mensagem:
• É uma PERGUNTA sobre o documento ou sobre um campo? (ex: "o que é foro?", "preciso do CNPJ?", "qual a diferença?")
  → Responda com sua base de conhecimento jurídico. Depois retorne à pergunta.
• É uma resposta no formato errado ou incompleta?
  → Explique gentilmente o que está faltando e por que aquele dado é importante.
• O usuário parece confuso ou travado?
  → Ofereça um exemplo concreto do que está sendo pedido.

PASSO 2 — Sempre termine voltando EXATAMENTE para esta pergunta:
${input.nextQuestion ?? `Forneça os dados do grupo "${input.grupAtual}".`}

Máximo 6 linhas. Tom: paciente, educativo, sem julgamento.`;
      break;

    case 'workflow_completo':
      prompt = `${ctxPrefix}Todos os dados foram coletados com sucesso.

Resumo dos dados coletados:
${input.resumoFinal}

Informe ao usuário que a coleta está concluída e o documento está pronto para geração.
Instruções a incluir na resposta:
• Para gerar: clicar no botão **"Gerar PDF"** que apareceu abaixo, ou digitar "gerar"
• Para corrigir algo: dizer "corrigir [nome do campo]" (ex: "corrigir empresa", "corrigir valor")
• Após gerar o PDF, pode tirar qualquer dúvida sobre o documento conversando normalmente
Tom: profissional, positivo, direto. Máximo 4 linhas.`;
      break;

    case 'cancelado':
      prompt = `${ctxPrefix}O usuário cancelou/reiniciou. Confirme positivamente e sem drama.

Apresente os documentos disponíveis de forma concisa e pergunte qual deseja criar agora:
• Contrato de Prestação de Serviços
• Proposta Comercial
• Orçamento
• Relatório Final
• Acordo de Confidencialidade (NDA)

Máximo 6 linhas.`;
      break;

    case 'ajuda':
      prompt = `${ctxPrefix}O usuário pediu ajuda. Responda de forma estruturada e prática.

Explique:
1. Como iniciar: diga o tipo de documento ("quero um contrato", "fazer NDA", etc.)
2. Como fornecer dados: pode dar vários de uma vez na mesma mensagem, separados por vírgula ou em linhas
3. Formatos aceitos: CNPJ com ou sem pontuação, datas em qualquer formato, valores com ou sem R$
4. Como corrigir um campo: diga "corrigir [nome do campo]" (ex: "corrigir empresa", "corrigir valor")
5. Como recomeçar: diga "cancelar" ou "nova conversa"
6. Tirar dúvidas: pode perguntar "o que é foro?", "preciso do RG?", "por que CNPJ?" a qualquer momento

Máximo 10 linhas, use bullet points numerados.`;
      break;

    case 'confirmado':
      prompt = `${ctxPrefix}O usuário confirmou a geração do PDF.
Confirme em 1–2 linhas com tom profissional. Mencione que o documento está sendo preparado.`;
      break;

    case 'editando_campo': {
      // Extrai valor anterior se disponível nos dados de contexto
      const campoKey = Object.keys(input.dadosDocumento ?? {}).find(k => k.endsWith('_anterior'));
      const valorAnt = campoKey ? input.dadosDocumento![campoKey] : null;
      prompt = `${ctxPrefix}O usuário quer corrigir o campo "${input.campoCorrendo}".
${valorAnt ? `Valor atual registrado: "${valorAnt}".` : ''}

Informe ao usuário:
1. Que a correção foi iniciada (1 frase)
2. Mostre o valor atual com **negrito** (se disponível)
3. Peça o novo valor de forma direta
4. Se for CNPJ, CPF ou data, mencione o formato aceito em 1 linha

Pergunta a fazer ao usuário:
${input.nextQuestion ?? `Informe o novo valor para ${input.campoCorrendo}.`}

Máximo 4 linhas.`;
      break;
    }
      break;

    case 'campo_nao_encontrado':
      prompt = `${ctxPrefix}O usuário pediu para corrigir "${input.campoCorrendo}" mas não foi possível identificar o campo correspondente.

Informe de forma amigável que não reconheceu exatamente o campo.
Use os dados já coletados acima para sugerir nomes reais dos campos disponíveis para correção.
Instrua: pode usar o nome do campo em português natural — ex: "corrigir empresa", "alterar CNPJ", "mudar endereço", "corrigir data de início".
Máximo 4 linhas.`;
      break;

    case 'sugerir_padrao':
      prompt = `${ctxPrefix}O usuário demonstrou hesitação ou não soube responder ao campo "${input.campoCorrendo}" (grupo: ${input.grupAtual}).
Mensagem do usuário: "${input.mensagemUsuario}"

Use sua base de conhecimento para:
1. Explicar brevemente o que é este campo (1 frase)
2. Oferecer o valor padrão de mercado e perguntar se pode usar (ex: "O padrão de mercado é **30 dias** — posso usar isso?")
3. Se o usuário confirmar, o sistema usará o padrão automaticamente

Campo em questão: "${input.campoCorrendo}"
Próxima pergunta caso não haja padrão aplicável: ${input.nextQuestion ?? `Forneça os dados de ${input.grupAtual}.`}

Tom: prestativo, especialista. Máximo 4 linhas.`;
      break;

    case 'explicar_campo':
      prompt = `${ctxPrefix}O usuário fez uma pergunta sobre um campo, cláusula ou aspecto jurídico do documento.
Mensagem: "${input.mensagemUsuario}"

Use sua base de conhecimento jurídico para responder com precisão e didatismo:
• Explique o que o campo/cláusula significa
• Explique por que é obrigatório ou recomendado neste tipo de documento
• Dê um exemplo concreto de como preencher, se aplicável
• Se houver risco jurídico em deixar em branco ou preencher errado, mencione brevemente

Após a explicação, retorne gentilmente para a coleta com a próxima pergunta:
${input.nextQuestion ?? `Continuando a coleta para o grupo "${input.grupAtual}".`}

Tom: especialista consultivo, claro, sem jargão excessivo. Máximo 8 linhas.`;
      break;

    case 'chat_livre': {
      const clausulasCtx = input.clausulasDocumento?.length
        ? `\nESTRUTURA DO DOCUMENTO GERADO (cláusulas disponíveis para consulta):\n${input.clausulasDocumento.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}`
        : '';
      prompt = `Mensagem do usuário: "${input.mensagemUsuario}"
${clausulasCtx}

Responda com base nos dados já coletados e na sua base de conhecimento jurídico.

PRIORIDADE DE RESPOSTA:
1. Se é pergunta sobre dado específico já coletado → responda com o valor exato em **negrito**
2. Se é pergunta sobre uma cláusula específica → explique o que ela diz e por que ela protege as partes
3. Se é pergunta sobre o que um campo significa / por que é necessário → use a base de conhecimento jurídico
4. Se é pergunta sobre cálculo (valor por mês, tempo restante, multa proporcional) → calcule com os dados disponíveis
5. Se não há como responder com os dados → seja honesto e oriente onde encontrar
6. Se parece que quer criar novo documento → sugira dizer o tipo

Tom: consultivo, especialista, direto. Máximo 6 linhas.`;
      break;
    }

    case 'perguntas_sobre_plataforma':
      prompt = `O usuário fez uma pergunta sobre como a plataforma BepeAI funciona, suas capacidades, limitações ou funcionalidades.
Mensagem: "${input.mensagemUsuario}"

Use sua base de conhecimento sobre a plataforma para responder com total honestidade:
• Se a funcionalidade existe: explique como usar
• Se a funcionalidade NÃO existe ainda: diga claramente, sem rodeios, e registre como feedback útil
• Se for pergunta sobre documentos disponíveis: liste apenas os 5 tipos com 1 linha cada
• Se for dúvida operacional (como corrigir campo, como gerar PDF, como recomeçar): explique o passo a passo

NUNCA:
• Prometa funcionalidades que não existem
• Redirecione para criar um documento se o usuário claramente quer entender a plataforma primeiro
• Use linguagem vaga como "podemos discutir opções" quando a resposta correta é "ainda não temos isso"

Após responder, se houver contexto de documento em andamento, pergunte se quer continuar.
Se não houver contexto, pergunte qual documento deseja criar ou se tem mais dúvidas.

Tom: transparente, prestativo, direto. Máximo 8 linhas.`;
      break;
  }

  // Sistema com contexto de documento injetado diretamente no system prompt
  // para garantir que a IA sempre tem os dados disponíveis
  const systemComContexto = contextoDocumento
    ? `${SYSTEM_CONVERSACIONAL}\n\n${contextoDocumento}`
    : SYSTEM_CONVERSACIONAL;

  // Monta a lista de mensagens — chat_livre usa multi-turn com histórico
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemComContexto },
  ];

  if (input.situacao === 'chat_livre' && input.historicoRecente?.length) {
    // Injeta histórico recente para continuidade conversacional
    for (const turn of input.historicoRecente) {
      messages.push({ role: turn.role, content: turn.content });
    }
  }

  messages.push({ role: 'user', content: prompt });

  try {
    const { content, provider } = await llmCall(
      {
        messages,
        taskType:    'conversational',
        temperature: input.situacao === 'chat_livre' ? 0.65 : 0.55,
        max_tokens:  input.situacao === 'chat_livre' ? 450 : 380,
      },
      'gerarRespostaConversacional'
    );

    logger.debug({ situacao: input.situacao, turns: messages.length, provider }, '[LLM] Resposta gerada');
    return content || null;
  } catch (err) {
    logger.error({ err, situacao: input.situacao }, '[LLM] Erro na geração conversacional');
    return null;
  }
}
