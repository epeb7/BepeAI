import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { sanitizePromptInput } from '../lib/sanitize';
import logger from '../lib/logger';
import {
  getState,
  setState,
  deleteState,
  initWorkflow,
  applyFields,
  rollback,
  getCurrentGroup,
  getCurrentGroupQuestion,
  getCurrentGroupExample,
  isWorkflowComplete,
  getProgressInfo,
} from '../services/conversation.service';
import { WorkflowState } from '../services/workflow.service';
import { extrairMultiplosCampos, extrairCamposDeDocumento, gerarRespostaConversacional, RespostaConversacionalInput } from '../services/groq.service';
import { detectIntent, extractFieldToEdit } from '../services/intent.service';
import { workflows } from '../workflows/definitions';
import { ensureConversation, logTurn, completeConversation, getConversationDetail, getRecentDocuments } from '../services/conversation.logger';
import { getConversationFiles } from '../services/file.service';
import { getMemoria, getUserTone, formatarMemoriaParaPrompt, formatarTomParaPrompt, memorizarDocumento } from '../services/memory.service';

// ============================================================
// Helpers de domínio
// ============================================================

// Normaliza string: minúsculas + remove acentos
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Busca o step que melhor corresponde ao hint do usuário.
// Estratégia em camadas: exact → field parts → label → label parts → fuzzy substring.
// Retorna o step com maior score ou null se nenhum atingir threshold mínimo.
function findStepByHint(hint: string, workflowDef: { steps: Array<{ field: string; label?: string }> }) {
  const h = norm(hint).replace(/\s+/g, '_');
  const hWords = norm(hint).split(/\s+/).filter(w => w.length > 1);

  let best: { step: (typeof workflowDef.steps)[number]; score: number } | null = null;

  for (const step of workflowDef.steps) {
    const fieldNorm  = norm(step.field);
    const labelNorm  = step.label ? norm(step.label) : '';
    let score = 0;

    // Nível 1 — correspondência exata
    if (fieldNorm === h || labelNorm === norm(hint)) { score = 100; }
    // Nível 2 — campo contém ou é contido no hint
    else if (fieldNorm.includes(h) || h.includes(fieldNorm)) { score = 80; }
    // Nível 3 — label contém o hint ou hint contém o label
    else if (labelNorm && (labelNorm.includes(norm(hint)) || norm(hint).includes(labelNorm))) { score = 75; }
    // Nível 4 — todas as palavras do hint estão no field ou label
    else if (hWords.length > 0 && hWords.every(w => fieldNorm.includes(w) || labelNorm.includes(w))) { score = 65; }
    // Nível 5 — pelo menos metade das palavras do hint batem
    else if (hWords.length > 1) {
      const matches = hWords.filter(w => fieldNorm.includes(w) || labelNorm.includes(w)).length;
      if (matches >= Math.ceil(hWords.length / 2)) score = 50 + matches * 3;
    }
    // Nível 6 — qualquer palavra do hint (> 3 chars) aparece no field ou label
    else {
      const anyMatch = hWords.some(w => w.length > 3 && (fieldNorm.includes(w) || labelNorm.includes(w)));
      if (anyMatch) score = 30;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { step, score };
    }
  }

  // Threshold mínimo de 30 para evitar falsos positivos
  return best && best.score >= 30 ? best.step : null;
}

function isSaudacao(texto: string): boolean {
  const saudacoes = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'oie', 'e aí', 'e ai', 'opa', 'hey', 'hello', 'eae', 'ei'];
  // Match por palavra inteira — evita falsos positivos como "ei" dentro de "anexei"
  // ou "ola" dentro de "isolado". Saudações são curtas e devem ser tokens próprios.
  const tokens = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/);
  const saudacoesNorm = saudacoes.map(s => s.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  // Frases compostas ("bom dia") checadas no texto completo com boundary
  const textoNorm = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return saudacoesNorm.some(s =>
    s.includes(' ')
      ? new RegExp(`\\b${s}\\b`).test(textoNorm)
      : tokens.includes(s)
  );
}

const CLAUSULAS_DOCUMENTO: Record<string, string[]> = {
  contrato: [
    'Cláusula 1ª – Do Objeto (serviço contratado)',
    'Cláusula 2ª – Do Prazo (vigência e prorrogação)',
    'Cláusula 3ª – Da Remuneração (valor, pagamento, multa por atraso)',
    'Cláusula 4ª – Das Obrigações do Contratado',
    'Cláusula 5ª – Das Obrigações do Contratante',
    'Cláusula 6ª – Da Propriedade Intelectual (direitos sobre os entregáveis)',
    'Cláusula 7ª – Da Confidencialidade (sigilo por 5 anos)',
    'Cláusula 8ª – Do Caso Fortuito e Força Maior',
    'Cláusula 9ª – Da Rescisão (aviso prévio, multas proporcionais)',
    'Cláusula 10ª – Das Disposições Gerais (integralidade, tolerância, alterações)',
    'Cláusula 11ª – Do Foro (comarca competente para litígios)',
  ],
  proposta_comercial: [
    'Cláusula 1ª – Da Apresentação (contexto da proposta)',
    'Cláusula 2ª – Do Objeto (serviços propostos e escopo detalhado)',
    'Cláusula 3ª – Das Condições Financeiras (valor, pagamento, multa por atraso)',
    'Cláusula 4ª – Do Prazo de Entrega (cronograma e condições)',
    'Cláusula 5ª – Da Propriedade Intelectual (entregáveis pós-pagamento)',
    'Cláusula 6ª – Da Validade (prazo de vigência da proposta)',
    'Cláusula 7ª – Das Condições Gerais (aditivos, subcontratação, sigilo)',
    'Cláusula 8ª – Do Aceite (forma de confirmação e prazo para contrato)',
  ],
  orcamento: [
    'Cláusula 1ª – Do Objeto (descrição dos itens/serviços)',
    'Cláusula 2ª – Da Composição de Valores (descrição, qtd, valor unit., valor total)',
    'Cláusula 3ª – Do Prazo de Execução (cronograma e condições)',
    'Cláusula 4ª – Das Condições de Pagamento (forma e multa moratória)',
    'Cláusula 5ª – Da Validade (prazo e reajuste após vencimento)',
    'Cláusula 6ª – Das Responsabilidades e Garantias',
    'Cláusula 7ª – Do Aceite',
  ],
  relatorio_final: [
    'Cláusula 1ª – Identificação (empresa, responsável, título, período)',
    'Cláusula 2ª – Sumário Executivo (visão geral do período)',
    'Cláusula 3ª – Principais Resultados (dados e indicadores)',
    'Cláusula 4ª – Conclusões e Recomendações (ações para o próximo ciclo)',
    'Cláusula 5ª – Metodologia e Fontes (rastreabilidade das informações)',
    'Cláusula 6ª – Aprovação e Arquivamento (retenção mínima 5 anos)',
  ],
  nda: [
    'Cláusula 1ª – Da Finalidade (uso permitido das informações)',
    'Cláusula 2ª – Das Informações Confidenciais (definição e exceções)',
    'Cláusula 3ª – Das Obrigações da Parte Receptora (sigilo, notificação em 24h)',
    'Cláusula 4ª – Da Vigência (duração do NDA e prazo de confidencialidade pós-encerramento)',
    'Cláusula 5ª – Das Penalidades (multa por violação, multiplicador reiteração, tutela urgência)',
    'Cláusula 6ª – Da Propriedade Intelectual (sem transferência implícita)',
    'Cláusula 7ª – Das Disposições Gerais (severabilidade, integralidade)',
    'Cláusula 8ª – Do Foro (comarca competente)',
  ],
};

// Padrões que indicam pergunta conversacional — não devem iniciar workflow
const PADROES_CONVERSACIONAL = [
  /\bcomo (funciona|usar?|faz|fazemos|devo|posso|fica|seria|e feito)\b/i,
  /\bo que [eé]\b/i,
  /\bpara que (serve|funciona)\b/i,
  /\bme (explica|explique|fala|conta|diz|diga)\b/i,
  /\bqual (a diferenca|e a diferenca|o objetivo|e o objetivo|a finalidade)\b/i,
  /\bquais (sao|são|as (clausulas|vantagens|diferenca))\b/i,
  /\bpreciso (saber|entender|de informacao)\b/i,
  /\bnao (entendo|entendi|sei)\b/i,
  /\btem algum (modelo|exemplo)\b/i,
  /\bpode (me explicar|explicar)\b/i,
  /\?/,  // qualquer mensagem com ponto de interrogação é pergunta
];

function isConversacional(msg: string): boolean {
  const lower = msg.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return PADROES_CONVERSACIONAL.some(p => p.test(lower));
}

function detectDocumentType(msg: string, strict = false): string | null {
  const lower = msg.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Modo strict: só detecta com intenção clara de criação (verbos imperativos ou pedidos diretos)
  // Modo normal: detecta keywords mas ignora se a mensagem parece pergunta conversacional
  if (!strict && isConversacional(msg)) return null;

  // NDA — maior prioridade para evitar conflito com "contrato de confidencialidade"
  if (/\b(nda|non.?disclosure|acordo de (sigilo|confidencialidade|nao.?divulgacao)|termo de (sigilo|confidencialidade))\b/.test(lower)) return 'nda';
  // Confidencialidade/sigilo sozinhos só no modo strict
  if (strict && /\b(confidencialidade|sigilo)\b/.test(lower)) return 'nda';

  // Contrato — prestação de serviços ou contrato genérico
  if (/\b(contrato|prestacao de servico|prestacao de servicos|contrato de servico|contrato de servicos|acordo de servico|formalizar|formalizacao)\b/.test(lower)) return 'contrato';

  // Proposta comercial — só com contexto de criação ou termo composto
  if (/\b(proposta comercial|oferta comercial|apresentar proposta|enviar proposta|fazer proposta|criar proposta|nova proposta|quero (uma |a )?proposta)\b/.test(lower)) return 'proposta_comercial';
  if (strict && /\bproposta\b/.test(lower)) return 'proposta_comercial';

  // Relatório final
  if (/\b(relatorio final|relatorio de (desempenho|resultados|atividades|gestao)|prestacao de contas)\b/.test(lower)) return 'relatorio_final';
  if (strict && /\brelatorio\b/.test(lower)) return 'relatorio_final';

  // Orçamento
  if (/\b(orcamento|budget|cotacao|precificacao|quanto custa|valor para|proposta de preco|preco de servico)\b/.test(lower)) return 'orcamento';

  return null;
}

const FIELD_LABELS: Record<string, string> = {
  // ── Contrato ──
  contratante_empresa: 'Empresa Contratante', contratante_cnpj: 'CNPJ da Contratante',
  contratante_endereco: 'Endereço da Contratante', contratante_cidade: 'Cidade da Contratante',
  contratante_estado: 'Estado da Contratante', contratante_cargo: 'Cargo do Representante',
  contratante_nome: 'Representante Legal', contratante_nacionalidade: 'Nacionalidade',
  contratante_estado_civil: 'Estado Civil', contratante_profissao: 'Profissão',
  contratante_rg: 'RG do Representante', contratante_cpf: 'CPF do Representante',
  contratado_empresa: 'Empresa Contratada', contratado_cnpj: 'CNPJ da Contratada',
  contratado_endereco: 'Endereço da Contratada', contratado_cidade: 'Cidade da Contratada',
  contratado_estado: 'Estado da Contratada', contratado_cargo: 'Cargo do Representante',
  contratado_nome: 'Representante Legal', contratado_nacionalidade: 'Nacionalidade',
  contratado_estado_civil: 'Estado Civil', contratado_profissao: 'Profissão',
  contratado_rg: 'RG do Representante', contratado_cpf: 'CPF do Representante',
  objeto_servicos: 'Objeto do Contrato', data_inicio: 'Data de Início', data_fim: 'Data de Término',
  valor_total: 'Valor Total do Contrato', forma_pagamento: 'Forma de Pagamento',
  dia_pagamento: 'Dia de Vencimento', aviso_previo: 'Aviso Prévio (dias)',
  foro_comarca: 'Foro Judicial', cidade_assinatura: 'Cidade de Assinatura',
  data_assinatura: 'Data de Assinatura',
  // ── Proposta Comercial ──
  emitente_empresa: 'Empresa Emitente', emitente_cnpj: 'CNPJ do Emitente',
  emitente_endereco: 'Endereço do Emitente', emitente_cidade: 'Cidade do Emitente',
  emitente_estado: 'Estado do Emitente',
  emitente_responsavel: 'Responsável pela Proposta', emitente_cargo: 'Cargo',
  emitente_email: 'E-mail de Contato', emitente_telefone: 'Telefone',
  cliente_empresa: 'Empresa Cliente', cliente_cnpj: 'CNPJ do Cliente',
  cliente_responsavel: 'Responsável no Cliente',
  descricao_servicos: 'Descrição dos Serviços', escopo_detalhado: 'Escopo Detalhado',
  valor_total_proposta: 'Valor Total da Proposta',
  prazo_entrega: 'Prazo de Entrega', validade_proposta: 'Validade da Proposta (dias)',
  cidade_emissao: 'Cidade de Emissão', data_emissao: 'Data de Emissão',
  // ── Orçamento ──
  empresa_emitente: 'Empresa Emissora', cnpj_emitente: 'CNPJ do Emitente',
  endereco_emitente: 'Endereço do Emitente',
  responsavel_emitente: 'Responsável pela Emissão', telefone_emitente: 'Telefone de Contato',
  cliente_nome: 'Solicitante', cliente_cnpj_cpf: 'CNPJ/CPF do Solicitante',
  descricao_itens: 'Descrição dos Itens', quantidade_unidade: 'Quantidade/Unidade',
  valor_unitario: 'Valor Unitário', valor_total_orcamento: 'Valor Total do Orçamento',
  prazo_execucao: 'Prazo de Execução', validade_orcamento: 'Validade do Orçamento (dias)',
  // ── Relatório Final ──
  empresa: 'Empresa', cnpj: 'CNPJ da Empresa', responsavel: 'Responsável pelo Relatório',
  cargo_responsavel: 'Cargo do Responsável', titulo_relatorio: 'Título do Relatório',
  resumo_executivo: 'Resumo Executivo', principais_resultados: 'Principais Resultados',
  recomendacoes: 'Recomendações',
  // ── NDA ──
  divulgadora_empresa: 'Empresa Divulgadora', divulgadora_cnpj: 'CNPJ da Divulgadora',
  divulgadora_endereco: 'Endereço da Divulgadora', divulgadora_representante: 'Representante da Divulgadora',
  divulgadora_cargo: 'Cargo', divulgadora_cpf: 'CPF do Representante',
  receptora_empresa: 'Empresa Receptora', receptora_cnpj: 'CNPJ da Receptora',
  receptora_endereco: 'Endereço da Receptora', receptora_representante: 'Representante da Receptora',
  receptora_cargo: 'Cargo', receptora_cpf: 'CPF do Representante',
  finalidade_nda: 'Finalidade do NDA', descricao_informacoes: 'Informações Confidenciais Protegidas',
  prazo_confidencialidade: 'Prazo de Sigilo (anos)', vigencia_meses: 'Vigência do NDA (meses)',
  penalidade_valor: 'Multa por Violação',
  // ── Genéricos ──
  valor: 'Valor', prazo: 'Prazo',
  dataInicio: 'Início', dataFim: 'Fim',
};

const GROUP_ICONS: Record<string, string> = {
  // contrato
  contratante_dados: '🏢', contratante_rep: '👤',
  contratado_dados: '🏢',  contratado_rep:  '👤',
  contrato_objeto: '📋',   contrato_periodo: '💰', contrato_encerramento: '⚖️',
  // proposta
  proposta_emitente: '🏢', proposta_responsavel: '👤', proposta_cliente: '👤',
  proposta_escopo: '📋', proposta_financeiro: '💰',
  // orçamento
  orcamento_emitente: '🏢', orcamento_cliente: '👤', orcamento_itens: '📦', orcamento_condicoes: '💰',
  // relatório
  relatorio_empresa: '🏢', relatorio_periodo: '📅', relatorio_resultados: '📊', relatorio_recomendacoes: '💡',
  // nda
  nda_divulgadora: '🔐', nda_receptora: '👤', nda_finalidade: '📄', nda_vigencia: '⚖️',
};

function formatarValorResumo(field: string, value: string): string {
  if (field.includes('cnpj') && /^\d{14}$/.test(value))
    return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (field.includes('cpf') && /^\d{11}$/.test(value))
    return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (field.includes('valor') || field === 'penalidade_valor') {
    const n = parseFloat(value.replace(',', '.'));
    if (!isNaN(n)) return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }
  if (field === 'aviso_previo') return `${value} dias`;
  if (field === 'dia_pagamento') return `dia ${value}`;
  if (field === 'vigencia_meses') return `${value} meses`;
  if (field === 'prazo_confidencialidade') return `${value} anos`;
  if (field === 'validade_proposta' || field === 'validade_orcamento') return `${value} dias`;
  return value;
}

function buildResumoFormatado(state: WorkflowState): string {
  if (!state.workflowName) return '';
  const wf = workflows[state.workflowName];
  const sections: string[] = [];
  for (const group of wf.fieldGroups) {
    const present = group.fields.filter(f => f in state.data);
    if (present.length === 0) continue;
    const icon = GROUP_ICONS[group.id] ?? '📌';
    const rows = present.map(f => {
      const label = FIELD_LABELS[f] ?? f.replace(/_/g, ' ');
      return `• **${label}:** ${formatarValorResumo(f, state.data[f])}`;
    });
    sections.push(`${icon} **${group.label}**\n${rows.join('\n')}`);
  }
  return sections.join('\n\n');
}

interface ProgressInfo {
  currentGroup: number; totalGroups: number; currentGroupLabel: string;
  completedFields: number; totalFields: number; isComplete: boolean;
}

function buildResponse(
  resposta: string,
  state: WorkflowState,
  aguardandoConfirmacao = false,
  extra: Record<string, unknown> = {}
) {
  const allFields = state.workflowName
    ? (workflows[state.workflowName]?.steps.map(s => s.field) ?? [])
    : [];
  const dadosFaltantes = allFields.filter(f => !(f in state.data));
  const progress = getProgressInfo(state) as ProgressInfo | null;
  const exampleBlock = getCurrentGroupExample(state) ?? null;

  return {
    success: true,
    resposta,
    dadosExtraidos: state.data,
    dadosFaltantes,
    tipoDocumento: state.workflowName,
    aguardandoConfirmacao,
    progress,
    exampleBlock,
    conversationId: state.conversationId ?? null,
    ...extra,
  };
}

// ============================================================
// Gerenciamento de conversationId e turnNumber — via WorkflowState
// Elimina completamente o Map em memória: o estado persiste no store (Supabase ou memória)
// ============================================================

async function ensureConversationInState(
  userId: string,
  state: WorkflowState
): Promise<WorkflowState> {
  if (state.conversationId) return state; // já existe — reutiliza
  const id = await ensureConversation(userId, state.workflowName);
  const updated = { ...state, conversationId: id, turnNumber: 0 };
  await setState(userId, updated);
  return updated;
}

// ── Reconstrói estado a partir do finalData de uma conversa completa ──
async function recoverStateFromConversation(
  userId: string,
  conversationId: string
): Promise<WorkflowState | null> {
  try {
    const detail = await getConversationDetail(conversationId, userId);
    if (!detail?.workflowType || !detail.finalData) return null;
    const wf = workflows[detail.workflowType];
    if (!wf) return null;

    // Monta estado "completo" com todos os dados do finalData
    const state: WorkflowState = {
      workflowName: detail.workflowType,
      currentGroupIndex: wf.fieldGroups.length, // além do último grupo = completo
      pendingFieldsInCurrentGroup: [],
      data: detail.finalData,
      completedFields: Object.keys(detail.finalData),
      awaitingConfirmation: false,
      conversationId,
      turnNumber: detail.turnCount,
    };
    await setState(userId, state);
    logger.info({ userId, conversationId }, '[Chat] Estado recuperado do Supabase');
    return state;
  } catch {
    return null;
  }
}

// ── Helper: busca últimos N turns do histórico de uma conversa ──
async function buscarHistorico(
  conversationId: string | undefined,
  userId: string,
  maxTurns = 20
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  if (!conversationId) return [];
  try {
    const detail = await getConversationDetail(conversationId, userId);
    if (!detail?.turns?.length) return [];
    return detail.turns.slice(-maxTurns).flatMap(t => [
      { role: 'user'      as const, content: t.userMessage },
      { role: 'assistant' as const, content: t.aiResponse  },
    ]);
  } catch {
    return [];
  }
}

// ── Helper: gera resposta via IA com fallback hardcoded ────────
// Injeta automaticamente dadosDocumento, histórico, arquivos, documentos anteriores,
// memória adaptativa do usuário e tom preferido.
async function resposta(
  input: RespostaConversacionalInput,
  fallback: string,
  state?: WorkflowState,
  contextoArquivos?: Array<{ nome: string; conteudo: string }>,
  historicoRecente?: Array<{ role: 'user' | 'assistant'; content: string }>,
  documentosAnteriores?: RespostaConversacionalInput['documentosAnteriores'],
  memoriaUsuario?: string,
  tomPreferido?: string
): Promise<string> {
  const inputComContexto: RespostaConversacionalInput = {
    ...input,
    dadosDocumento:       input.dadosDocumento       ?? (state?.data && Object.keys(state.data).length > 0 ? state.data : undefined),
    tipoDocumento:        input.tipoDocumento        ?? state?.workflowName ?? undefined,
    contextoArquivos:     input.contextoArquivos     ?? (contextoArquivos && contextoArquivos.length > 0 ? contextoArquivos : undefined),
    historicoRecente:     input.historicoRecente     ?? (historicoRecente?.length ? historicoRecente : undefined),
    documentosAnteriores: input.documentosAnteriores ?? (documentosAnteriores?.length ? documentosAnteriores : undefined),
    memoriaUsuario:       input.memoriaUsuario       ?? (memoriaUsuario || undefined),
    tomPreferido:         input.tomPreferido         ?? (tomPreferido   || undefined),
  };
  const gerado = await gerarRespostaConversacional(inputComContexto);
  return gerado ?? fallback;
}

// ============================================================
// Controller principal
// ============================================================

export const sendMessage = async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const raw: string = req.body?.message ?? '';

  if (!raw.trim()) return res.status(400).json({ error: 'Mensagem vazia' });

  const message = sanitizePromptInput(raw);
  logger.info({ userId, length: raw.length }, '[Chat] Mensagem recebida');

  let state = await getState(userId);

  const headerConvId = req.headers['x-conversation-id'] as string | undefined;
  const bodyConvId   = req.body?.conversationId as string | undefined;
  const frontendConvId = headerConvId ?? bodyConvId ?? null;

  // Se há estado ativo mas o frontend não enviou conversationId (nova aba, reload, nova sessão),
  // isso indica que o usuário começou uma nova conversa sem passar pelo /reset.
  // Limpa o estado para não contaminar a nova conversa com dados anteriores.
  if (state.workflowName && !frontendConvId) {
    await deleteState(userId);
    state = await getState(userId);
    logger.info({ userId }, '[Chat] Estado órfão limpo — nova sessão sem conversationId');
  }

  // Se o servidor não tem estado (reiniciou) mas o frontend tem um conversationId ativo,
  // tenta reconstruir o estado a partir do Supabase
  if (!state.workflowName && frontendConvId) {
    const recovered = await recoverStateFromConversation(userId, frontendConvId);
    if (recovered) state = recovered;
  }

  // Sincroniza o conversationId do frontend com o state.
  // Cenário típico: o usuário anexou um arquivo (criando uma conversa nova) enquanto
  // o servidor ainda tinha em memória o state de uma sessão anterior sem workflow.
  // Sem isso, o backend buscaria arquivos/histórico da conversa errada.
  // Só adota quando não há workflow ativo — não interrompe uma coleta em andamento.
  if (frontendConvId && !state.workflowName && state.conversationId !== frontendConvId) {
    state = { ...state, conversationId: frontendConvId };
    await setState(userId, state);
    logger.info({ userId, frontendConvId }, '[Chat] conversationId do frontend adotado no state');
  }

  const isComplete = isWorkflowComplete(state);
  const intent = detectIntent(message, isComplete);

  logger.debug({ userId, intent, workflowName: state.workflowName }, '[Chat] Intenção detectada');

  // ── Garante que toda conversa tem um ID desde a 1ª mensagem ──
  // Isso permite registrar qualquer troca no histórico, não só workflows.
  // Se já tem conversationId no state, reutiliza. Se não, cria agora.
  if (!state.conversationId) {
    const newConvId = await ensureConversation(userId, state.workflowName ?? null);
    state = { ...state, conversationId: newConvId, turnNumber: 0 };
    await setState(userId, state);
  }
  const turnNumber = (state.turnNumber ?? 0) + 1;

  // ── Contexto carregado em paralelo — uma única rodada de I/O por request ──────────
  // historicoConversa : até 20 turns da conversa atual
  // docsAnterioresRaw : últimos 5 documentos concluídos (para sugerir campos)
  // memorias          : campos recorrentes do usuário (empresa, CNPJ, foro…)
  // tomPreferido      : estilo de resposta escolhido pelo usuário
  const [historicoConversa, docsAnterioresRaw, memorias, tomUsuario] = await Promise.all([
    buscarHistorico(state.conversationId ?? undefined, userId, 20),
    getRecentDocuments(userId, 5),
    getMemoria(userId, 20),
    getUserTone(userId),
  ]);

  // Exclui a conversa atual dos documentos anteriores (evita duplicidade com dadosDocumento)
  const docsAnteriores = docsAnterioresRaw
    .filter(d => d.id !== state.conversationId)
    .map(d => ({
      titulo:          d.title,
      tipo:            d.workflowType,
      dados:           d.finalData,
      dataAtualizacao: d.updatedAt,
    }));

  // Blocos pré-formatados para o system prompt
  const memoriaUsuario = formatarMemoriaParaPrompt(memorias);
  const tomPreferido   = formatarTomParaPrompt(tomUsuario);

  // ── Contexto de arquivos anexados (lazy) ─────────────────────
  // O texto extraído (até ~60 KB) só é buscado quando o branch realmente
  // vai usá-lo (chat livre / perguntas). Branches como CANCEL/HELP/CONFIRM
  // não pagam essa query. O resultado é memoizado por request.
  let _arquivosCache: Array<{ nome: string; conteudo: string }> | null = null;
  const carregarArquivos = async (): Promise<Array<{ nome: string; conteudo: string }>> => {
    if (_arquivosCache !== null) return _arquivosCache;
    // Prioriza o conversationId que o frontend indicou (onde o arquivo foi anexado),
    // caindo para o do state. Cobre o caso de anexar arquivo com workflow ativo.
    const convId = frontendConvId ?? state.conversationId;
    if (!convId) { _arquivosCache = []; return _arquivosCache; }
    try {
      const arquivos = await getConversationFiles(userId, convId);
      _arquivosCache = arquivos
        .filter(f => f.extractedText && f.extractedText.trim().length > 0)
        .map(f => ({ nome: f.originalFilename, conteudo: f.extractedText! }));
    } catch (err) {
      logger.warn({ err, conversationId: convId }, '[Chat] Falha ao carregar arquivos da conversa');
      _arquivosCache = [];
    }
    return _arquivosCache;
  };

  // Helper para logar o turno ao final de qualquer branch e atualizar turnNumber no state
  const logAndAdvanceTurn = (userMsg: string, aiResp: string, groupId?: string, extracted?: Record<string,string>, saved?: string[]) => {
    state = { ...state, turnNumber };
    setState(userId, state);
    logTurn({ userId, conversationId: state.conversationId!, turnNumber, userMessage: userMsg, aiResponse: aiResp, groupId, extractedFields: extracted, savedFields: saved });
  };

  // ── CONFIRMAÇÃO DE TROCA DE DOCUMENTO ────────────────────────
  // Usuário confirmou (ou cancelou) a troca de workflow proposta no turno anterior
  if (state.pendingDocumentSwitch) {
    const novoTipo = state.pendingDocumentSwitch;
    const lower = norm(message);
    const confirmou = /^(sim|s|ok|pode|vai|quero|confirma|isso|claro|com certeza|vamos|tudo bem|beleza)\b/i.test(lower)
      || /\b(confirmar?|trocar?|mudar?|sim (pode|pode ser|quero))\b/i.test(lower);
    const cancelou = /^(nao|n|cancelar?|volta|manter|continuar|nao quero|deixa pra la)\b/i.test(lower);

    if (confirmou) {
      // Confirma troca: inicia novo workflow em nova conversa
      const convIdAtual = state.conversationId;
      if (convIdAtual) completeConversation(convIdAtual, state.data);
      await deleteState(userId);
      state = await initWorkflow(userId, novoTipo);
      const newConvId = await ensureConversation(userId, novoTipo);
      state = { ...state, conversationId: newConvId, turnNumber: 0, pendingDocumentSwitch: null };
      await setState(userId, state);
      const grupLabel  = getCurrentGroup(state)?.label ?? '';
      const totalGrupos = workflows[novoTipo]?.fieldGroups.length ?? 0;
      const nomeTipo   = novoTipo.replace(/_/g, ' ');
      const texto = await resposta(
        { situacao: 'inicio_workflow', tipoDocumento: nomeTipo, grupAtual: grupLabel, totalGrupos },
        `Iniciando coleta de dados para o seu documento. Serão **${totalGrupos} etapas** no total.\n\n${getCurrentGroupQuestion(state)}`,
        state, undefined, historicoConversa, docsAnteriores, memoriaUsuario, tomPreferido
      );
      logTurn({ userId, conversationId: state.conversationId!, turnNumber: 1, userMessage: message, aiResponse: texto });
      return res.json(buildResponse(texto, state));
    } else if (cancelou) {
      // Cancela troca: limpa o pending e retoma o workflow atual
      state = { ...state, pendingDocumentSwitch: null };
      await setState(userId, state);
      const textoMantem = 'Tudo bem, continuamos com o documento atual.\n\n' + (getCurrentGroupQuestion(state) ?? '');
      logAndAdvanceTurn(message, textoMantem);
      return res.json(buildResponse(textoMantem, state));
    }
    // Resposta ambígua: repergunta
    state = { ...state, pendingDocumentSwitch: novoTipo };
    await setState(userId, state);
    const nomeAtual = state.workflowName?.replace(/_/g, ' ') ?? 'documento atual';
    const nomeNovo  = novoTipo.replace(/_/g, ' ');
    const textoAmbig = `Para confirmar: você deseja **interromper** o ${nomeAtual} e iniciar um novo **${nomeNovo}**?\n\nResponda **sim** para trocar ou **não** para continuar o documento atual.`;
    logAndAdvanceTurn(message, textoAmbig);
    return res.json(buildResponse(textoAmbig, state));
  }

  // ── NOVO DOCUMENTO — usuário pede tipo de doc com workflow já ativo/completo ──
  if (state.workflowName && intent !== 'CANCEL' && intent !== 'HELP') {
    const novoTipo = detectDocumentType(message);
    if (novoTipo) {
      if (novoTipo !== state.workflowName) {
        // Tipo diferente: propõe troca explícita
        const nomeAtual = state.workflowName.replace(/_/g, ' ');
        const nomeNovo  = novoTipo.replace(/_/g, ' ');
        state = { ...state, pendingDocumentSwitch: novoTipo };
        await setState(userId, state);
        const textoConfirm = `Você tem um **${nomeAtual}** em andamento.\n\nDeseja **interromper** e iniciar um novo **${nomeNovo}**? Os dados já coletados serão perdidos.\n\nResponda **sim** para trocar ou **não** para continuar.`;
        logAndAdvanceTurn(message, textoConfirm);
        return res.json(buildResponse(textoConfirm, state));
      } else if (isWorkflowComplete(state)) {
        // Mesmo tipo + workflow completo: propõe criar um NOVO documento do mesmo tipo
        const nomeTipo = novoTipo.replace(/_/g, ' ');
        state = { ...state, pendingDocumentSwitch: novoTipo };
        await setState(userId, state);
        const textoNovoMesmo = `O **${nomeTipo}** anterior já está completo.\n\nDeseja criar um **novo ${nomeTipo}**? A conversa atual será encerrada.\n\nResponda **sim** para começar ou **não** para continuar consultando o documento atual.`;
        logAndAdvanceTurn(message, textoNovoMesmo);
        return res.json(buildResponse(textoNovoMesmo, state));
      }
    }
  }

  // ── CANCEL ────────────────────────────────────────────────
  if (intent === 'CANCEL') {
    const textoCancel = await resposta(
      { situacao: 'cancelado' },
      'Conversa reiniciada. Qual documento você precisa criar?\n\n• **Contrato** de Prestação de Serviços\n• **Proposta** Comercial\n• **Orçamento**\n• **Relatório** Final\n• **Acordo de Confidencialidade** (NDA)',
      state, undefined, historicoConversa, docsAnteriores, memoriaUsuario, tomPreferido
    );
    logAndAdvanceTurn(message, textoCancel);
    await deleteState(userId);
    const empty = await getState(userId);
    return res.json(buildResponse(textoCancel, empty));
  }

  // ── HELP ──────────────────────────────────────────────────
  if (intent === 'HELP') {
    const textoHelp = await resposta(
      { situacao: 'ajuda' },
      '**Como usar a BepeAI:**\n\n' +
      '1. Diga o tipo de documento que deseja criar (contrato, proposta, orçamento, relatório ou NDA)\n' +
      '2. Responda às perguntas — pode fornecer vários dados de uma vez na mesma mensagem\n' +
      '3. Os dados são aceitos com ou sem formatação (CNPJ, CPF, datas em qualquer formato)\n' +
      '4. Para corrigir: diga **"corrigir [campo]"** — ex: "corrigir empresa" ou "alterar cnpj"\n' +
      '5. Para recomeçar do zero: diga **"cancelar"**\n' +
      '6. Para tirar dúvidas sobre campos ou cláusulas, pergunte a qualquer momento\n' +
      '7. Ao terminar, clique em **Gerar PDF** ou diga "gerar"',
      state, undefined, historicoConversa, docsAnteriores, memoriaUsuario, tomPreferido
    );
    logAndAdvanceTurn(message, textoHelp);
    return res.json(buildResponse(textoHelp, state));
  }

  // ── QUERY_DATA — mostra o que já foi coletado ──────────────
  if (intent === 'QUERY_DATA') {
    const resumo = buildResumoFormatado(state);
    if (!resumo) {
      const textoEmpty = 'Nenhum dado coletado ainda. Para iniciar, informe o tipo de documento desejado: **contrato**, **proposta**, **orçamento**, **relatório** ou **NDA**.';
      logAndAdvanceTurn(message, textoEmpty);
      return res.json(buildResponse(textoEmpty, state));
    }
    const completedCount = state.completedFields.length;
    const totalCount = state.workflowName ? (workflows[state.workflowName]?.steps.length ?? 0) : 0;
    const progress = state.workflowName ? getProgressInfo(state) : null;
    const etapa = progress ? ` (etapa ${(progress as { currentGroup: number }).currentGroup + 1} de ${(progress as { totalGroups: number }).totalGroups})` : '';
    const statusLine = isComplete
      ? '**Coleta concluída** — documento pronto para geração.'
      : `**Progresso:** ${completedCount} de ${totalCount} campos coletados${etapa}.`;

    const textoQuery = `${statusLine}\n\n${resumo}${isComplete
      ? '\n\nClique em **Gerar PDF** para baixar o documento ou diga "gerar".'
      : `\n\n${getCurrentGroupQuestion(state) ?? ''}`}`;

    logAndAdvanceTurn(message, textoQuery);
    return res.json(buildResponse(textoQuery, state, isComplete, isComplete ? { readyToDownload: true } : {}));
  }

  // ── CONFIRM ───────────────────────────────────────────────
  if (isComplete && intent === 'CONFIRM') {
    const textoConfirm = await resposta(
      { situacao: 'confirmado' },
      'Documento finalizado. Clique em **Gerar PDF** para baixar o arquivo.',
      state, undefined, historicoConversa, docsAnteriores, memoriaUsuario, tomPreferido
    );
    logAndAdvanceTurn(message, textoConfirm);
    return res.json(buildResponse(textoConfirm, state, false, { readyToDownload: true }));
  }

  // ── EDIT_FIELD ────────────────────────────────────────────
  if (intent === 'EDIT_FIELD') {
    const workflowDef = state.workflowName ? workflows[state.workflowName] : null;

    // Sem workflow ativo não há o que editar
    if (!workflowDef) {
      const textoSemWorkflow = 'Nenhum documento em elaboração. Informe qual documento deseja criar para iniciar.';
      logAndAdvanceTurn(message, textoSemWorkflow);
      return res.json(buildResponse(textoSemWorkflow, state));
    }

    const fieldHint = extractFieldToEdit(message);

    if (!fieldHint) {
      // Monta lista dos campos já coletados para orientar o usuário
      const camposColetados = workflowDef.steps
        .filter(s => s.field in state.data)
        .map(s => `• **${FIELD_LABELS[s.field] ?? s.field.replace(/_/g, ' ')}**`)
        .slice(0, 8)
        .join('\n');

      const textoNoField = await resposta(
        { situacao: 'campo_nao_encontrado', campoCorrendo: message },
        `Não identifiquei qual campo corrigir.\n\nCampos disponíveis para correção:\n${camposColetados || '(nenhum coletado ainda)'}\n\nDiga, por exemplo: "corrigir empresa" ou "alterar cnpj".`,
        state, undefined, historicoConversa, docsAnteriores, memoriaUsuario, tomPreferido
      );
      logAndAdvanceTurn(message, textoNoField);
      return res.json(buildResponse(textoNoField, state));
    }

    const step = findStepByHint(fieldHint, workflowDef);

    if (!step) {
      // Lista os campos coletados para orientar
      const camposDisponiveis = workflowDef.steps
        .filter(s => s.field in state.data)
        .map(s => `• ${FIELD_LABELS[s.field] ?? s.field.replace(/_/g, ' ')}`)
        .slice(0, 8)
        .join('\n');

      const textoNotFound = await resposta(
        { situacao: 'campo_nao_encontrado', campoCorrendo: fieldHint },
        `Não encontrei o campo **"${fieldHint}"** neste documento.\n\nCampos que podem ser corrigidos:\n${camposDisponiveis || '(nenhum preenchido ainda)'}\n\nTente: "corrigir empresa", "corrigir cnpj", "corrigir endereço".`,
        state, undefined, historicoConversa, docsAnteriores, memoriaUsuario, tomPreferido
      );
      logAndAdvanceTurn(message, textoNotFound);
      return res.json(buildResponse(textoNotFound, state));
    }

    // Captura o valor atual antes do rollback para mostrar no feedback
    const valorAnterior = state.data[step.field] ?? null;

    const newState = await rollback(userId, step.field);
    if (!newState) {
      const textoErr = `Não foi possível iniciar a correção de "${step.field}". Tente novamente.`;
      logAndAdvanceTurn(message, textoErr);
      return res.json(buildResponse(textoErr, state));
    }

    state = { ...newState, conversationId: state.conversationId, turnNumber };
    await setState(userId, state);

    const fieldLabel = FIELD_LABELS[step.field] ?? step.field.replace(/_/g, ' ');
    const grupLabel  = getCurrentGroup(state)?.label ?? '';

    // Prompt de edição com o valor anterior visível
    const contextoEdicao: RespostaConversacionalInput = {
      situacao:      'editando_campo',
      campoCorrendo: fieldLabel,
      grupAtual:     grupLabel,
      nextQuestion:  getCurrentGroupQuestion(state) ?? undefined,
      // Injeta valor anterior como dado de contexto para o LLM referenciar
      dadosDocumento: valorAnterior
        ? { ...state.data, [`${step.field}_anterior`]: valorAnterior }
        : state.data,
    };

    const fallbackEdicao = valorAnterior
      ? `Correção de **${fieldLabel}** iniciada.\nValor atual: **${formatarValorResumo(step.field, valorAnterior)}**\n\nInforme o novo valor:`
      : `Correção de **${fieldLabel}** iniciada.\n\n${getCurrentGroupQuestion(state)}`;

    const textoEdit = await resposta(contextoEdicao, fallbackEdicao, state, undefined, historicoConversa, docsAnteriores, memoriaUsuario, tomPreferido);
    logTurn({ userId, conversationId: state.conversationId!, turnNumber, userMessage: message, aiResponse: textoEdit });
    return res.json(buildResponse(textoEdit, state));
  }

  // ── WORKFLOW COMPLETO — chat consultivo sobre o documento ────
  if (isComplete) {
    const clausulas = state.workflowName
      ? (CLAUSULAS_DOCUMENTO[state.workflowName] ?? [])
      : [];

    const textoLivre = await resposta(
      {
        situacao: 'chat_livre',
        tipoDocumento:      state.workflowName ?? undefined,
        dadosDocumento:     state.data,
        mensagemUsuario:    message,
        clausulasDocumento: clausulas,
      },
      'O documento está pronto para geração. Para tirar dúvidas sobre os dados coletados, pergunte livremente. Para gerar o PDF, clique no botão abaixo ou diga "gerar".',
      state,
      await carregarArquivos(),
      historicoConversa, docsAnteriores, memoriaUsuario, tomPreferido
    );
    logAndAdvanceTurn(message, textoLivre);
    return res.json(buildResponse(textoLivre, state, true, { readyToDownload: true }));
  }

  // ── SEM WORKFLOW ATIVO ────────────────────────────────────
  if (!state.workflowName) {
    if (isSaudacao(message)) {
      const textoSaudacao = await resposta(
        { situacao: 'boas_vindas' },
        'Bem-vindo à **BepeAI** — automação de documentos jurídicos.\n\nPosso criar:\n• **Contrato** de Prestação de Serviços\n• **Proposta** Comercial\n• **Orçamento**\n• **Relatório** Final\n• **Acordo de Confidencialidade** (NDA)\n\nQual documento você precisa hoje?',
        state
      );
      logAndAdvanceTurn(message, textoSaudacao);
      return res.json(buildResponse(textoSaudacao, state));
    }

    const tipo = detectDocumentType(message);
    if (tipo) {
      const existingConvId = state.conversationId;
      state = await initWorkflow(userId, tipo);
      const updatedConvId = await ensureConversation(userId, tipo, existingConvId ?? undefined);
      state = { ...state, conversationId: updatedConvId, turnNumber: 0 };
      await setState(userId, state);

      // ── Pré-preenchimento a partir de arquivo anexado ──────────
      // Se há um documento anexado, extrai dele todos os campos possíveis
      // e aplica grupo a grupo, deixando só o que faltou para o usuário.
      const arquivos = await carregarArquivos();
      let preenchidosDeArquivo: string[] = [];
      if (arquivos.length > 0) {
        const textoConcatenado = arquivos.map(a => `### ${a.nome}\n${a.conteudo}`).join('\n\n');
        const todosCampos = workflows[tipo].steps;
        const extraidos = await extrairCamposDeDocumento(textoConcatenado, todosCampos);

        if (Object.keys(extraidos).length > 0) {
          // Aplica em loop: o engine avança um grupo por vez, então repetimos
          // até não conseguir salvar mais nada no grupo atual.
          let avancou = true;
          while (avancou && !isWorkflowComplete(state)) {
            const grupoAtual = getCurrentGroup(state);
            if (!grupoAtual) break;
            const { newState, savedFields } = await applyFields(userId, extraidos, state);
            state = { ...newState, conversationId: state.conversationId, turnNumber: 0 };
            preenchidosDeArquivo.push(...savedFields);
            avancou = savedFields.length > 0;
          }
          // Guarda os campos do arquivo que ainda não foram aplicados (grupos futuros)
          // para reaplicá-los conforme o usuário avança a coleta.
          const naoAplicados: Record<string, string> = {};
          for (const [k, v] of Object.entries(extraidos)) {
            if (!state.completedFields.includes(k)) naoAplicados[k] = v;
          }
          state = { ...state, pendingFileFields: Object.keys(naoAplicados).length > 0 ? naoAplicados : undefined };
          await setState(userId, state);
        }
      }

      const grupLabel  = getCurrentGroup(state)?.label ?? '';
      const totalGrupos = workflows[tipo]?.fieldGroups.length ?? 0;

      // Workflow já ficou completo só com o arquivo
      if (isWorkflowComplete(state)) {
        const resumo = buildResumoFormatado(state);
        const textoCompleto = await resposta(
          { situacao: 'workflow_completo', tipoDocumento: tipo, resumoFinal: resumo },
          `Extraí os dados do arquivo. **Revise com atenção** — a leitura automática pode conter erros:\n\n${resumo}\n\nSe algo estiver errado, diga "corrigir [campo]". Se estiver tudo certo, gere o PDF.`,
          state, undefined, historicoConversa, docsAnteriores, memoriaUsuario, tomPreferido
        );
        logTurn({ userId, conversationId: state.conversationId!, turnNumber: 1, userMessage: message, aiResponse: textoCompleto, savedFields: preenchidosDeArquivo });
        return res.json(buildResponse(textoCompleto, state, true, { readyToDownload: true }));
      }

      // Pré-preencheu parte: confirma o que veio do arquivo e pergunta o que falta
      if (preenchidosDeArquivo.length > 0) {
        const labels = preenchidosDeArquivo.map(f => FIELD_LABELS[f] ?? f.replace(/_/g, ' '));
        const textoPre = await resposta(
          {
            situacao: 'campos_salvos',
            tipoDocumento: tipo,
            camposSalvos: labels,
            grupAtual: grupLabel,
            totalGrupos,
            nextQuestion: getCurrentGroupQuestion(state) ?? undefined,
          },
          `Analisei o arquivo e já preenchi: **${labels.join(', ')}**.\n\n${getCurrentGroupQuestion(state) ?? ''}`,
          state, undefined, historicoConversa
        );
        logTurn({ userId, conversationId: state.conversationId!, turnNumber: 1, userMessage: message, aiResponse: textoPre, savedFields: preenchidosDeArquivo });
        return res.json(buildResponse(textoPre, state));
      }

      // Sem arquivo (ou nada extraído) — fluxo normal de início
      const textoInit = await resposta(
        { situacao: 'inicio_workflow', tipoDocumento: tipo, grupAtual: grupLabel, totalGrupos },
        `Iniciando coleta de dados para o seu documento. Serão **${totalGrupos} etapas** no total.\n\n${getCurrentGroupQuestion(state)}`,
        state, undefined, historicoConversa, docsAnteriores, memoriaUsuario, tomPreferido
      );
      logTurn({ userId, conversationId: state.conversationId!, turnNumber: 1, userMessage: message, aiResponse: textoInit });
      return res.json(buildResponse(textoInit, state));
    }

    // Detecta perguntas sobre a plataforma em si (capacidades, limitações, como funciona)
    const PADROES_PLATAFORMA = [
      /\b(como funciona|o que [eé]|para que serve|o que voc[eê] (faz|consegue|pode))\b/i,
      /\b(tem como|[eé] poss[ií]vel|voc[eê] (suporta|aceita|permite|tem))\b/i,
      /\b(meu (pr[oó]prio|personalizado)|layout|template|modelo|marca|logo|identidade visual)\b/i,
      /\b(customiza[çc][aã]o|personalizar|personaliza[çc][aã]o|brand(ing)?)\b/i,
      /\b(plataforma|sistema|ferramenta|recurso|funcionalidade|vers[aã]o)\b/i,
      /\b(exportar|exporta[çc][aã]o|docx|word|integra[çc][aã]o|api|erp|crm)\b/i,
      /\b(assinatura (digital|eletr[oô]nica)|docusign|clicksign)\b/i,
      /\b(quantos (documentos|tipos)|quais (documentos|tipos))\b/i,
      /\b(pre[çc]o|plano|custo|cobr(a|ança|ar))\b/i,
    ];
    const isPerguntaPlataforma = PADROES_PLATAFORMA.some(p => p.test(message));

    const textoDefault = await resposta(
      {
        situacao: isPerguntaPlataforma ? 'perguntas_sobre_plataforma' : 'chat_livre',
        mensagemUsuario: message,
        dadosDocumento: {},
      },
      'Posso ajudar com documentos jurídicos profissionais. Informe o tipo desejado:\n\n• **contrato** — Prestação de Serviços\n• **proposta** — Comercial\n• **orçamento**\n• **relatório** — Final\n• **NDA** — Acordo de Confidencialidade',
      state,
      await carregarArquivos(),
      historicoConversa, docsAnteriores, memoriaUsuario, tomPreferido
    );
    logAndAdvanceTurn(message, textoDefault);
    return res.json(buildResponse(textoDefault, state));
  }

  // ── WORKFLOW ATIVO — extração e avanço ────────────────────
  const currentGroup = getCurrentGroup(state);
  if (!currentGroup) {
    void deleteState(userId);
    return res.json(buildResponse('Erro de estado interno detectado. A conversa foi reiniciada.', await getState(userId)));
  }

  const workflowDef = workflows[state.workflowName!];
  const camposPendentes = workflowDef.steps.filter(s =>
    state.pendingFieldsInCurrentGroup.includes(s.field)
  );

  // ── Campos com padrão de mercado (precisamos antes da extração para detectar hesitação) ──
  const CAMPOS_COM_PADRAO: Record<string, string> = {
    aviso_previo:            '30',
    validade_proposta:       '30',
    validade_orcamento:      '15',
    vigencia_meses:          '12',
    prazo_confidencialidade: '3',
    dia_pagamento:           '10',
  };

  // ── Detecta se a mensagem é uma pergunta sobre campos/doc ──
  // Feito ANTES da extração para poder paralelizar com o LLM.
  const PADROES_PERGUNTA_CAMPO = [
    /\bo que [eé]\b/i,
    /\bpara que serve\b/i,
    /\bpor que (preciso|é necessário|pede|pedir)\b/i,
    /\bpreciso mesmo\b/i,
    /\bposso pular\b/i,
    /\bé obrigatório\b/i,
    /\bnão sei o (que|qual)\b/i,
    /\bme (explica|explique|conta|fala sobre)\b/i,
    /\bqual (a diferença|o objetivo|a finalidade)\b/i,
    /\bcomo (preencher|colocar|informar|escrever|funciona|funciona o)\b/i,
    /\bo que significa\b/i, /\bsignificado\b/i,
    /\bcomo assim\b/i, /\bnão (entendo|entendi)\b/i,
    /\bsim, mas\b/i, /^\s*\?+\s*$/,
  ];
  const PADROES_HESITACAO = [
    /\bnão sei\b/i, /\bnao sei\b/i,
    /\bnão tenho (certeza|ideia)\b/i, /\bqualquer (um|valor|data)\b/i,
    /\bpode ser qualquer\b/i, /\buse o padrão\b/i, /\buse o padrao\b/i,
    /\bpadrão de mercado\b/i, /\bsugira\b/i,
    /\bvocê decide\b/i, /\bvoce decide\b/i,
    /\bcoloca o normal\b/i, /\bcoloca o padrão\b/i,
  ];

  const parece_pergunta = isConversacional(message) || PADROES_PERGUNTA_CAMPO.some(p => p.test(message));
  const parece_hesitacao = PADROES_HESITACAO.some(p => p.test(message));
  const campoPendentePadrao = state.pendingFieldsInCurrentGroup.find(f => f in CAMPOS_COM_PADRAO);

  // ── Paralelismo: extração LLM + carregamento de arquivos (quando relevante) ──
  // Se a mensagem parece uma pergunta, já sabemos que precisaremos dos arquivos.
  // Dispara ambos ao mesmo tempo em vez de sequencial.
  const [extracted, arquivosPrecarregados] = await Promise.all([
    extrairMultiplosCampos(message, camposPendentes, currentGroup.label),
    parece_pergunta ? carregarArquivos() : Promise.resolve(null),
  ]);

  // Mescla campos do arquivo ainda pendentes — usuário tem prioridade sobre arquivo.
  if (state.pendingFileFields) {
    for (const f of state.pendingFieldsInCurrentGroup) {
      if (state.pendingFileFields[f] && !extracted[f]) {
        extracted[f] = state.pendingFileFields[f];
      }
    }
  }

  logger.debug({ userId, group: currentGroup.id, extracted: Object.keys(extracted) }, '[Chat] Campos extraídos');

  const { newState, savedFields, invalidFields, stillMissing } = await applyFields(userId, extracted, state);
  state = { ...newState, conversationId: state.conversationId, turnNumber };

  if (state.pendingFileFields && savedFields.length > 0) {
    const restante = { ...state.pendingFileFields };
    for (const f of savedFields) delete restante[f];
    state = { ...state, pendingFileFields: Object.keys(restante).length > 0 ? restante : undefined };
  }

  // setState fire-and-forget — não bloqueia a resposta ao usuário
  void setState(userId, state);

  const savedLabels   = savedFields.map(f => FIELD_LABELS[f] ?? f.replace(/_/g, ' '));
  const invalidLabels = invalidFields.map(e => e.error);
  const missingLabels = stillMissing.map(f => FIELD_LABELS[f] ?? f.replace(/_/g, ' '));
  const proximoGrupLabel = getCurrentGroup(state)?.label ?? currentGroup.label;

  // ── Workflow concluído ─────────────────────────────────────
  if (isWorkflowComplete(state)) {
    const resumo = buildResumoFormatado(state);
    const textoFinal = await resposta(
      { situacao: 'workflow_completo', resumoFinal: resumo, tipoDocumento: state.workflowName ?? undefined },
      `✅ **Coleta concluída!**\n\n${resumo}\n\nClique em **Gerar PDF** para baixar seu documento, ou diga **"corrigir [campo]"** para ajustar algo.`,
      state, undefined, historicoConversa, docsAnteriores, memoriaUsuario, tomPreferido
    );
    // Persistência fire-and-forget — não atrasa a resposta
    void logTurn({ userId, conversationId: state.conversationId!, turnNumber, userMessage: message, aiResponse: textoFinal, groupId: currentGroup.id, extractedFields: extracted, savedFields });
    void completeConversation(state.conversationId!, state.data);
    void memorizarDocumento(userId, state.data);
    return res.json(buildResponse(textoFinal, state, true, { readyToDownload: true }));
  }

  // ── Detecta pergunta sobre a plataforma (mesmo durante workflow) ──
  const PADROES_PLATAFORMA_WORKFLOW = [
    /\b(layout|template|modelo|marca|logo|identidade visual)\b/i,
    /\b(customiza[çc][aã]o|personalizar|personaliza[çc][aã]o|meu pr[oó]prio)\b/i,
    /\b(plataforma|sistema|ferramenta|recurso|funcionalidade)\b/i,
    /\b(exportar|docx|word|integra[çc][aã]o|erp|crm)\b/i,
    /\b(assinatura (digital|eletr[oô]nica)|docusign|clicksign)\b/i,
    /\b(tem como (eu|a gente)|[eé] poss[ií]vel (ter|usar|colocar))\b/i,
    /\b(pre[çc]o|plano|custo|cobr(a|ança|ar))\b/i,
  ];
  const isPerguntaPlataforma = savedFields.length === 0 && invalidFields.length === 0
    && PADROES_PLATAFORMA_WORKFLOW.some(p => p.test(message));

  // ── Determina situação para gerar resposta ─────────────────
  const isPerguntaCampo = savedFields.length === 0 && invalidFields.length === 0
    && !isPerguntaPlataforma && parece_pergunta;
  const isHesitacao     = savedFields.length === 0 && invalidFields.length === 0
    && !isPerguntaCampo && !isPerguntaPlataforma && parece_hesitacao && !!campoPendentePadrao;

  let situacao: RespostaConversacionalInput['situacao'];
  if      (savedFields.length > 0 && invalidFields.length === 0) situacao = 'campos_salvos';
  else if (invalidFields.length > 0)                             situacao = 'campos_invalidos';
  else if (isPerguntaPlataforma)                                 situacao = 'perguntas_sobre_plataforma';
  else if (isPerguntaCampo)                                      situacao = 'explicar_campo';
  else if (isHesitacao)                                          situacao = 'sugerir_padrao';
  else                                                           situacao = 'sem_extracao';

  let fallback = '';
  if (situacao === 'campos_salvos') {
    fallback = savedLabels.length === currentGroup.fields.length && invalidFields.length === 0
      ? `**${currentGroup.label}** registrado.\n\n${getCurrentGroupQuestion(state) ?? ''}`
      : `Recebi: **${savedLabels.join(', ')}**.\n\n${getCurrentGroupQuestion(state) ?? ''}`;
  } else if (situacao === 'campos_invalidos') {
    fallback = `Atenção com o formato:\n${invalidLabels.map(e => `• ${e}`).join('\n')}\n\n${getCurrentGroupQuestion(state) ?? ''}`;
  } else if (situacao === 'perguntas_sobre_plataforma') {
    fallback = `Responderei sua dúvida sobre a plataforma e depois continuamos a coleta.\n\n${getCurrentGroupQuestion(state) ?? ''}`;
  } else if (situacao === 'explicar_campo') {
    fallback = `Para tirar dúvidas sobre este campo, veja as instruções abaixo.\n\n${getCurrentGroupQuestion(state) ?? 'Por favor, forneça as informações solicitadas.'}`;
  } else if (situacao === 'sugerir_padrao') {
    const fieldPadrao = campoPendentePadrao ?? '';
    const labelPadrao = FIELD_LABELS[fieldPadrao] ?? fieldPadrao.replace(/_/g, ' ');
    fallback = `**${labelPadrao}**: o padrão de mercado é **${CAMPOS_COM_PADRAO[fieldPadrao] ?? ''}**. Posso usar esse valor?`;
  } else {
    fallback = `Não consegui identificar as informações solicitadas. ${getCurrentGroupQuestion(state) ?? 'Por favor, forneça os dados pedidos.'}`;
  }

  const nextQuestion     = getCurrentGroupQuestion(state) ?? undefined;
  const fieldPadraoLabel = campoPendentePadrao
    ? (FIELD_LABELS[campoPendentePadrao] ?? campoPendentePadrao.replace(/_/g, ' '))
    : undefined;

  // Usa arquivos já carregados em paralelo se disponíveis, senão carrega agora só se necessário.
  const arquivosParaResposta = (isPerguntaCampo || isPerguntaPlataforma)
    ? (arquivosPrecarregados ?? await carregarArquivos())
    : undefined;

  const textoResposta = await resposta(
    {
      situacao,
      tipoDocumento:   state.workflowName ?? undefined,
      camposSalvos:    savedLabels,
      camposInvalidos: invalidLabels,
      camposFaltando:  missingLabels,
      grupAtual:       proximoGrupLabel,
      totalGrupos:     workflows[state.workflowName!]?.fieldGroups.length,
      nextQuestion,
      mensagemUsuario: message,
      campoCorrendo:   fieldPadraoLabel,
    },
    fallback,
    state,
    arquivosParaResposta,
    historicoConversa, docsAnteriores
  );

  // Persistência fire-and-forget — não atrasa a resposta ao usuário
  void logTurn({
    userId,
    conversationId: state.conversationId!,
    turnNumber,
    userMessage: message,
    aiResponse: textoResposta,
    groupId: currentGroup.id,
    extractedFields: extracted,
    savedFields,
  });

  return res.json(buildResponse(textoResposta, state));
};
