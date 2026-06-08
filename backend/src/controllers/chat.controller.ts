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
import { extrairMultiplosCampos } from '../services/groq.service';
import { detectIntent, extractFieldToEdit } from '../services/intent.service';
import { workflows } from '../workflows/definitions';
import { ensureConversation, logTurn, completeConversation } from '../services/conversation.logger';

// ============================================================
// Helpers de domínio
// ============================================================

function isSaudacao(texto: string): boolean {
  const saudacoes = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'oie', 'e aí', 'opa', 'hey', 'hello', 'eae', 'ei'];
  return saudacoes.some(s => texto.toLowerCase().includes(s));
}

function detectDocumentType(msg: string): string | null {
  const lower = msg.toLowerCase();
  if (lower.includes('contrato')) return 'contrato';
  if (lower.includes('proposta')) return 'proposta_comercial';
  if (lower.includes('relatório') || lower.includes('relatorio') || lower.includes('report')) return 'relatorio_final';
  if (lower.includes('orçamento') || lower.includes('orcamento') || lower.includes('budget')) return 'orcamento';
  return null;
}

const FIELD_LABELS: Record<string, string> = {
  contratante_empresa: 'Empresa', contratante_cnpj: 'CNPJ', contratante_endereco: 'Endereço',
  contratante_cidade: 'Cidade', contratante_estado: 'Estado', contratante_cargo: 'Cargo',
  contratante_nome: 'Representante', contratante_nacionalidade: 'Nacionalidade',
  contratante_estado_civil: 'Estado civil', contratante_profissao: 'Profissão',
  contratante_rg: 'RG', contratante_cpf: 'CPF',
  contratado_empresa: 'Empresa', contratado_cnpj: 'CNPJ', contratado_endereco: 'Endereço',
  contratado_cidade: 'Cidade', contratado_estado: 'Estado', contratado_cargo: 'Cargo',
  contratado_nome: 'Representante', contratado_nacionalidade: 'Nacionalidade',
  contratado_estado_civil: 'Estado civil', contratado_profissao: 'Profissão',
  contratado_rg: 'RG', contratado_cpf: 'CPF',
  objeto_servicos: 'Serviço', data_inicio: 'Início', data_fim: 'Fim',
  valor_total: 'Valor total', forma_pagamento: 'Pagamento', dia_pagamento: 'Vencimento',
  aviso_previo: 'Aviso prévio', foro_comarca: 'Foro', cidade_assinatura: 'Local',
  data_assinatura: 'Data de assinatura',
  empresa: 'Empresa', cnpj: 'CNPJ', valor: 'Valor', prazo: 'Prazo', responsavel: 'Responsável',
  dataInicio: 'Início', dataFim: 'Fim',
};

const GROUP_ICONS: Record<string, string> = {
  contratante_dados: '🏢', contratante_rep: '👤',
  contratado_dados: '🏢', contratado_rep: '👤',
  contrato_objeto: '📋', contrato_periodo: '📅', contrato_encerramento: '⚖️',
  proposta_dados: '💼', relatorio_dados: '📊', orcamento_dados: '💰',
};

function formatarValorResumo(field: string, value: string): string {
  if ((field.endsWith('_cnpj') || field === 'cnpj') && /^\d{14}$/.test(value))
    return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if ((field.endsWith('_cpf') || field === 'cpf') && /^\d{11}$/.test(value))
    return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (field === 'valor_total' || field === 'valor') {
    const n = parseFloat(value.replace(',', '.'));
    if (!isNaN(n)) return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }
  if (field === 'aviso_previo') return `${value} dias`;
  if (field === 'dia_pagamento') return `dia ${value}`;
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
  const isComplete = isWorkflowComplete(state);
  const intent = detectIntent(message, isComplete);

  logger.debug({ userId, intent, workflowName: state.workflowName }, '[Chat] Intenção detectada');

  // ── CANCEL ────────────────────────────────────────────────
  if (intent === 'CANCEL') {
    await deleteState(userId);
    const empty = await getState(userId);
    return res.json(buildResponse(
      '🔄 Conversa reiniciada. Que tipo de documento você precisa criar?\n\n**contrato** · **proposta** · **relatório** · **orçamento**',
      empty
    ));
  }

  // ── HELP ──────────────────────────────────────────────────
  if (intent === 'HELP') {
    return res.json(buildResponse(
      '📘 **Como usar a BepeAI:**\n\n' +
      '• Diga o tipo de documento que deseja criar\n' +
      '• Responda às perguntas — pode fornecer vários dados de uma vez\n' +
      '• Use **"corrigir [campo]"** para alterar um dado já preenchido\n' +
      '• **"cancelar"** para recomeçar do zero\n' +
      '• Quando tudo estiver pronto, clique em **Gerar PDF**',
      state
    ));
  }

  // ── CONFIRM ───────────────────────────────────────────────
  if (isComplete && intent === 'CONFIRM') {
    return res.json(buildResponse(
      '✅ Perfeito! Clique em **Gerar PDF** abaixo para baixar seu documento.',
      state, false, { readyToDownload: true }
    ));
  }

  // ── EDIT_FIELD ────────────────────────────────────────────
  if (isComplete && intent === 'EDIT_FIELD') {
    const fieldHint = extractFieldToEdit(message);
    if (!fieldHint) {
      return res.json(buildResponse(
        '🤔 Não identifiquei qual campo corrigir. Diga por exemplo:\n"corrigir empresa" ou "alterar data_inicio"',
        state
      ));
    }

    const workflowDef = workflows[state.workflowName!];
    const step = workflowDef?.steps.find(s =>
      s.field === fieldHint ||
      s.field.endsWith('_' + fieldHint) ||
      s.field.startsWith(fieldHint + '_')
    );

    if (!step) {
      const campos = workflowDef?.steps.map(s => s.field).join(', ') ?? 'nenhum';
      return res.json(buildResponse(
        `❌ Campo **"${fieldHint}"** não encontrado.\nCampos disponíveis: ${campos}`,
        state
      ));
    }

    const newState = await rollback(userId, step.field);
    if (!newState) {
      return res.json(buildResponse(`❌ Não foi possível corrigir "${step.field}". Tente novamente.`, state));
    }

    state = newState;
    const fieldLabel = FIELD_LABELS[step.field] ?? step.field.replace(/_/g, ' ');
    return res.json(buildResponse(
      `✏️ Vamos corrigir **${fieldLabel}**.\n\n${getCurrentGroupQuestion(state)}`,
      state
    ));
  }

  // ── WORKFLOW COMPLETO ─────────────────────────────────────
  if (isComplete) {
    const resumo = buildResumoFormatado(state);
    return res.json(buildResponse(
      `✅ **Documento pronto para geração!**\n\n${resumo}\n\nClique em **Gerar PDF** ou diga **"corrigir [campo]"** para ajustar algum dado.`,
      state, true
    ));
  }

  // ── SEM WORKFLOW ATIVO ────────────────────────────────────
  if (!state.workflowName) {
    if (isSaudacao(message)) {
      return res.json(buildResponse(
        '👋 Olá! Sou a **BepeAI**, sua assistente de automação documental.\n\nPosso criar:\n• **Contrato** de Prestação de Serviços\n• **Proposta** Comercial\n• **Relatório** Final\n• **Orçamento**\n\nQual documento você precisa?',
        state
      ));
    }

    const tipo = detectDocumentType(message);
    if (tipo) {
      // Inicia novo workflow — limpa conversationId para forçar criação de nova conversa no DB
      state = await initWorkflow(userId, tipo);
      // ensureConversationInState cria a linha no Supabase e persiste o ID no estado
      state = await ensureConversationInState(userId, state);
      const question = getCurrentGroupQuestion(state);
      const nomeTipo = tipo.replace('_', ' ');
      return res.json(buildResponse(
        `📄 Ótimo! Vamos criar o seu **${nomeTipo}**.\n\n${question}`,
        state
      ));
    }

    return res.json(buildResponse(
      'Que tipo de documento você precisa?\n\n**contrato** · **proposta** · **relatório** · **orçamento**',
      state
    ));
  }

  // ── WORKFLOW ATIVO — extração e avanço ────────────────────
  const currentGroup = getCurrentGroup(state);
  if (!currentGroup) {
    await deleteState(userId);
    return res.json(buildResponse('⚠️ Erro de estado interno. Vamos recomeçar.', await getState(userId)));
  }

  // Garante conversationId caso o estado veio de sessão anterior sem ele
  state = await ensureConversationInState(userId, state);

  const workflowDef = workflows[state.workflowName!];
  const camposPendentes = workflowDef.steps.filter(s =>
    state.pendingFieldsInCurrentGroup.includes(s.field)
  );

  const extracted = await extrairMultiplosCampos(message, camposPendentes, currentGroup.label);

  logger.debug({ userId, group: currentGroup.id, extracted: Object.keys(extracted) }, '[Chat] Campos extraídos');

  const { newState, savedFields, invalidFields, stillMissing } = await applyFields(userId, extracted);
  // Reaplica conversationId e incrementa turnNumber no estado atualizado
  const turnNumber = (state.turnNumber ?? 0) + 1;
  state = { ...newState, conversationId: state.conversationId, turnNumber };
  await setState(userId, state);

  // Monta resposta textual
  let resposta = '';

  if (savedFields.length > 0) {
    const totalNoGroup = currentGroup.fields.length;
    const allSaved = savedFields.length >= totalNoGroup - invalidFields.length;
    if (allSaved && invalidFields.length === 0) {
      resposta += `✅ **${currentGroup.label}** registrado.\n\n`;
    } else {
      const nomes = savedFields.map(f => FIELD_LABELS[f] ?? f.replace(/_/g, ' ')).join(', ');
      resposta += `✅ Recebi: **${nomes}**.\n\n`;
    }
  }

  if (invalidFields.length > 0) {
    resposta += `⚠️ Atenção com o formato:\n${invalidFields.map(e => `• ${e.error}`).join('\n')}\n\n`;
  }

  if (savedFields.length === 0 && invalidFields.length === 0) {
    resposta += '🤔 Não consegui identificar as informações. ';
  }

  // ── Log turn no Supabase (fire-and-forget — não bloqueia a resposta) ──
  logTurn({
    userId,
    conversationId: state.conversationId!,
    turnNumber,
    userMessage: message,
    aiResponse: resposta,
    groupId: currentGroup.id,
    extractedFields: extracted,
    savedFields,
  });

  // ── Workflow concluído ─────────────────────────────────────
  if (isWorkflowComplete(state)) {
    const resumo = buildResumoFormatado(state);
    const respostaFinal = `✅ **Coleta concluída!**\n\n${resumo}\n\nClique em **Gerar PDF** para baixar seu documento, ou diga **"corrigir [campo]"** para ajustar algo.`;
    completeConversation(state.conversationId!, state.data);
    return res.json(buildResponse(respostaFinal, state, true));
  }

  const nextQuestion = getCurrentGroupQuestion(state);
  if (stillMissing.length > 0 && savedFields.length === 0) {
    resposta += nextQuestion ?? 'Por favor, forneça as informações solicitadas.';
  } else {
    resposta += nextQuestion ?? 'Prosseguindo...';
  }

  return res.json(buildResponse(resposta, state));
};
