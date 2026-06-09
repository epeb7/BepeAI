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
import { extrairMultiplosCampos, gerarRespostaConversacional, RespostaConversacionalInput } from '../services/groq.service';
import { detectIntent, extractFieldToEdit } from '../services/intent.service';
import { workflows } from '../workflows/definitions';
import { ensureConversation, logTurn, completeConversation, getConversationDetail } from '../services/conversation.logger';

// ============================================================
// Helpers de domínio
// ============================================================

function isSaudacao(texto: string): boolean {
  const saudacoes = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'oie', 'e aí', 'opa', 'hey', 'hello', 'eae', 'ei'];
  return saudacoes.some(s => texto.toLowerCase().includes(s));
}

function detectDocumentType(msg: string): string | null {
  const lower = msg.toLowerCase();
  if (lower.includes('nda') || lower.includes('confidencialidade') || lower.includes('sigilo') || lower.includes('non-disclosure')) return 'nda';
  if (lower.includes('contrato')) return 'contrato';
  if (lower.includes('proposta')) return 'proposta_comercial';
  if (lower.includes('relatório') || lower.includes('relatorio') || lower.includes('report')) return 'relatorio_final';
  if (lower.includes('orçamento') || lower.includes('orcamento') || lower.includes('budget')) return 'orcamento';
  return null;
}

const FIELD_LABELS: Record<string, string> = {
  // contrato
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
  // proposta comercial
  emitente_empresa: 'Empresa emitente', emitente_cnpj: 'CNPJ', emitente_endereco: 'Endereço',
  emitente_responsavel: 'Responsável', emitente_cargo: 'Cargo', emitente_email: 'E-mail',
  emitente_telefone: 'Telefone', cliente_empresa: 'Cliente', cliente_cnpj: 'CNPJ do cliente',
  cliente_responsavel: 'Contato', descricao_servicos: 'Serviços', escopo_detalhado: 'Escopo',
  prazo_entrega: 'Prazo', validade_proposta: 'Validade', cidade_emissao: 'Cidade', data_emissao: 'Data',
  // orçamento
  empresa_emitente: 'Empresa', cnpj_emitente: 'CNPJ', responsavel_emitente: 'Responsável',
  telefone_emitente: 'Telefone', cliente_nome: 'Cliente', cliente_cnpj_cpf: 'CNPJ/CPF',
  descricao_itens: 'Itens', quantidade_unidade: 'Qtd/Unidade', valor_unitario: 'Valor unitário',
  prazo_execucao: 'Prazo', validade_orcamento: 'Validade',
  // relatório
  empresa: 'Empresa', cnpj: 'CNPJ', responsavel: 'Responsável', cargo_responsavel: 'Cargo',
  titulo_relatorio: 'Título', resumo_executivo: 'Resumo', principais_resultados: 'Resultados',
  recomendacoes: 'Recomendações',
  // nda
  divulgadora_empresa: 'Divulgadora', divulgadora_cnpj: 'CNPJ', divulgadora_endereco: 'Endereço',
  divulgadora_representante: 'Representante', divulgadora_cargo: 'Cargo', divulgadora_cpf: 'CPF',
  receptora_empresa: 'Receptora', receptora_cnpj: 'CNPJ', receptora_endereco: 'Endereço',
  receptora_representante: 'Representante', receptora_cargo: 'Cargo', receptora_cpf: 'CPF',
  finalidade_nda: 'Finalidade', descricao_informacoes: 'Informações protegidas',
  prazo_confidencialidade: 'Prazo de sigilo', vigencia_meses: 'Vigência',
  penalidade_valor: 'Multa por violação',
  // genéricos legados
  valor: 'Valor', prazo: 'Prazo', dataInicio: 'Início', dataFim: 'Fim',
};

const GROUP_ICONS: Record<string, string> = {
  // contrato
  contratante_dados: '🏢', contratante_rep: '👤',
  contratado_dados: '🏢',  contratado_rep:  '👤',
  contrato_objeto: '📋',   contrato_periodo: '📅', contrato_encerramento: '⚖️',
  // proposta
  proposta_emitente: '🏢', proposta_cliente: '👤', proposta_escopo: '📋', proposta_financeiro: '💰',
  // orçamento
  orcamento_emitente: '🏢', orcamento_cliente: '📦', orcamento_condicoes: '💰',
  // relatório
  relatorio_empresa: '🏢', relatorio_periodo: '📊', relatorio_recomendacoes: '💡',
  // nda
  nda_divulgadora: '🔐', nda_receptora: '👤', nda_objeto: '📄', nda_vigencia: '⚖️',
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

// ── Helper: gera resposta via IA com fallback hardcoded ────────
// Injeta automaticamente dadosDocumento do state quando disponível,
// garantindo que a IA sempre tem os dados coletados como contexto.
async function resposta(
  input: RespostaConversacionalInput,
  fallback: string,
  state?: WorkflowState
): Promise<string> {
  const inputComContexto: RespostaConversacionalInput = {
    ...input,
    dadosDocumento: input.dadosDocumento ?? (state?.data && Object.keys(state.data).length > 0 ? state.data : undefined),
    tipoDocumento:  input.tipoDocumento  ?? state?.workflowName ?? undefined,
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

  // Se há estado ativo mas o frontend não enviou conversationId (nova aba, reload, nova sessão),
  // isso indica que o usuário começou uma nova conversa sem passar pelo /reset.
  // Limpa o estado para não contaminar a nova conversa com dados anteriores.
  if (state.workflowName && !headerConvId) {
    await deleteState(userId);
    state = await getState(userId);
    logger.info({ userId }, '[Chat] Estado órfão limpo — nova sessão sem conversationId');
  }

  // Se o servidor não tem estado (reiniciou) mas o frontend tem um conversationId ativo,
  // tenta reconstruir o estado a partir do Supabase
  if (!state.workflowName && headerConvId) {
    const recovered = await recoverStateFromConversation(userId, headerConvId);
    if (recovered) state = recovered;
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

  // Helper para logar o turno ao final de qualquer branch e atualizar turnNumber no state
  const logAndAdvanceTurn = (userMsg: string, aiResp: string, groupId?: string, extracted?: Record<string,string>, saved?: string[]) => {
    state = { ...state, turnNumber };
    setState(userId, state);
    logTurn({ userId, conversationId: state.conversationId!, turnNumber, userMessage: userMsg, aiResponse: aiResp, groupId, extractedFields: extracted, savedFields: saved });
  };

  // ── NOVO DOCUMENTO — usuário pede tipo de doc com workflow já ativo/completo ──
  if (state.workflowName && intent !== 'CANCEL' && intent !== 'HELP') {
    const novoTipo = detectDocumentType(message);
    if (novoTipo) {
      await deleteState(userId);
      state = await initWorkflow(userId, novoTipo);
      const newConvId = await ensureConversation(userId, novoTipo);
      state = { ...state, conversationId: newConvId, turnNumber: 0 };
      await setState(userId, state);
      const grupLabel = getCurrentGroup(state)?.label ?? '';
      const nomeTipo  = novoTipo.replace(/_/g, ' ');
      const texto = await resposta(
        { situacao: 'inicio_workflow', tipoDocumento: nomeTipo, grupAtual: grupLabel },
        `📄 Ótimo! Vamos criar o seu **${nomeTipo}**.\n\n${getCurrentGroupQuestion(state)}`,
        state
      );
      logTurn({ userId, conversationId: state.conversationId!, turnNumber: 1, userMessage: message, aiResponse: texto });
      return res.json(buildResponse(texto, state));
    }
  }

  // ── CANCEL ────────────────────────────────────────────────
  if (intent === 'CANCEL') {
    const textoCancel = await resposta(
      { situacao: 'cancelado' },
      '🔄 Conversa reiniciada. Que tipo de documento você precisa criar?\n\n**contrato** · **proposta** · **orçamento** · **relatório** · **NDA**',
      state
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
      '📘 **Como usar a BepeAI:**\n\n' +
      '• Diga o tipo de documento que deseja criar\n' +
      '• Responda às perguntas — pode fornecer vários dados de uma vez\n' +
      '• Use **"corrigir [campo]"** para alterar um dado já preenchido\n' +
      '• **"cancelar"** para recomeçar do zero\n' +
      '• Quando tudo estiver pronto, clique em **Gerar PDF**',
      state
    );
    logAndAdvanceTurn(message, textoHelp);
    return res.json(buildResponse(textoHelp, state));
  }

  // ── QUERY_DATA — mostra o que já foi coletado ──────────────
  if (intent === 'QUERY_DATA') {
    const resumo = buildResumoFormatado(state);
    if (!resumo) {
      const textoEmpty = 'Ainda não coletei nenhum dado. Diga qual documento precisa criar para começarmos.';
      logAndAdvanceTurn(message, textoEmpty);
      return res.json(buildResponse(textoEmpty, state));
    }
    const completedCount = state.completedFields.length;
    const totalCount = state.workflowName ? (workflows[state.workflowName]?.steps.length ?? 0) : 0;
    const statusLine = isComplete
      ? '✅ **Coleta concluída** — documento pronto para gerar.'
      : `📋 **Progresso:** ${completedCount}/${totalCount} campos coletados.`;

    const textoQuery = `${statusLine}\n\n${resumo}${isComplete
      ? '\n\nClique em **Gerar PDF** para baixar o documento.'
      : `\n\n${getCurrentGroupQuestion(state) ?? ''}`}`;

    logAndAdvanceTurn(message, textoQuery);
    return res.json(buildResponse(textoQuery, state, isComplete, isComplete ? { readyToDownload: true } : {}));
  }

  // ── CONFIRM ───────────────────────────────────────────────
  if (isComplete && intent === 'CONFIRM') {
    const textoConfirm = await resposta(
      { situacao: 'confirmado' },
      '✅ Perfeito! Clique em **Gerar PDF** abaixo para baixar seu documento.',
      state
    );
    logAndAdvanceTurn(message, textoConfirm);
    return res.json(buildResponse(textoConfirm, state, false, { readyToDownload: true }));
  }

  // ── EDIT_FIELD ────────────────────────────────────────────
  if (intent === 'EDIT_FIELD') {
    const fieldHint = extractFieldToEdit(message);
    if (!fieldHint) {
      const textoNoField = await resposta(
        { situacao: 'campo_nao_encontrado', campoCorrendo: message },
        '🤔 Não identifiquei qual campo corrigir. Diga por exemplo:\n"corrigir empresa" ou "alterar data_inicio"',
        state
      );
      logAndAdvanceTurn(message, textoNoField);
      return res.json(buildResponse(textoNoField, state));
    }

    const workflowDef = workflows[state.workflowName!];
    const step = workflowDef?.steps.find(s =>
      s.field === fieldHint ||
      s.field.endsWith('_' + fieldHint) ||
      s.field.startsWith(fieldHint + '_')
    );

    if (!step) {
      const textoNotFound = await resposta(
        { situacao: 'campo_nao_encontrado', campoCorrendo: fieldHint },
        `❌ Campo **"${fieldHint}"** não encontrado. Use "corrigir" seguido do nome do campo, ex: "corrigir empresa".`,
        state
      );
      logAndAdvanceTurn(message, textoNotFound);
      return res.json(buildResponse(textoNotFound, state));
    }

    const newState = await rollback(userId, step.field);
    if (!newState) {
      const textoErr = `❌ Não foi possível corrigir "${step.field}". Tente novamente.`;
      logAndAdvanceTurn(message, textoErr);
      return res.json(buildResponse(textoErr, state));
    }

    state = { ...newState, conversationId: state.conversationId, turnNumber };
    await setState(userId, state);
    const fieldLabel = FIELD_LABELS[step.field] ?? step.field.replace(/_/g, ' ');
    const grupLabel  = getCurrentGroup(state)?.label ?? '';
    const textoEdit = await resposta(
      { situacao: 'editando_campo', campoCorrendo: fieldLabel, grupAtual: grupLabel },
      `✏️ Vamos corrigir **${fieldLabel}**.\n\n${getCurrentGroupQuestion(state)}`,
      state
    );
    logTurn({ userId, conversationId: state.conversationId!, turnNumber, userMessage: message, aiResponse: textoEdit });
    return res.json(buildResponse(textoEdit, state));
  }

  // ── WORKFLOW COMPLETO — pergunta livre sobre o documento ─────
  // Quando o usuário faz qualquer pergunta após completar, a IA responde
  // com base nos dados coletados e no histórico recente.
  if (isComplete) {
    // Busca os últimos turns para dar contexto multi-turn à IA
    let historicoRecente: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (state.conversationId) {
      try {
        const detail = await getConversationDetail(state.conversationId, userId);
        if (detail?.turns) {
          // Pega os últimos 6 turns (3 pares user/ai) para contexto
          const ultimos = detail.turns.slice(-6);
          historicoRecente = ultimos.flatMap(t => [
            { role: 'user' as const,      content: t.userMessage },
            { role: 'assistant' as const, content: t.aiResponse  },
          ]);
        }
      } catch { /* histórico opcional */ }
    }

    const textoLivre = await resposta(
      {
        situacao: 'chat_livre',
        tipoDocumento:   state.workflowName ?? undefined,
        dadosDocumento:  state.data,
        mensagemUsuario: message,
        historicoRecente,
      },
      `O documento está pronto. Se tiver dúvidas sobre os dados coletados, é só perguntar. Para gerar o PDF, clique no botão abaixo ou diga **"gerar PDF"**.`
    );
    logAndAdvanceTurn(message, textoLivre);
    return res.json(buildResponse(textoLivre, state, true, { readyToDownload: true }));
  }

  // ── SEM WORKFLOW ATIVO ────────────────────────────────────
  if (!state.workflowName) {
    if (isSaudacao(message)) {
      const textoSaudacao = await resposta(
        { situacao: 'boas_vindas' },
        '👋 Olá! Sou a **BepeAI**, sua assistente de automação documental.\n\nPosso criar:\n• **Contrato** de Prestação de Serviços\n• **Proposta** Comercial\n• **Orçamento**\n• **Relatório** Final\n• **NDA** — Acordo de Confidencialidade\n\nQual documento você precisa?',
        state
      );
      logAndAdvanceTurn(message, textoSaudacao);
      return res.json(buildResponse(textoSaudacao, state));
    }

    const tipo = detectDocumentType(message);
    if (tipo) {
      // Reutiliza o conversationId já criado acima, atualizando o workflow_type
      const existingConvId = state.conversationId;
      state = await initWorkflow(userId, tipo);
      const updatedConvId = await ensureConversation(userId, tipo, existingConvId ?? undefined);
      state = { ...state, conversationId: updatedConvId, turnNumber: 0 };
      await setState(userId, state);
      const grupLabel = getCurrentGroup(state)?.label ?? '';
      const nomeTipo  = tipo.replace(/_/g, ' ');
      const textoInit = await resposta(
        { situacao: 'inicio_workflow', tipoDocumento: nomeTipo, grupAtual: grupLabel },
        `📄 Ótimo! Vamos criar o seu **${nomeTipo}**.\n\n${getCurrentGroupQuestion(state)}`,
        state
      );
      logTurn({ userId, conversationId: state.conversationId!, turnNumber: 1, userMessage: message, aiResponse: textoInit });
      return res.json(buildResponse(textoInit, state));
    }

    // Pergunta livre sem workflow — responde como assistente e guia para criar documento
    const textoDefault = await resposta(
      {
        situacao: 'chat_livre',
        mensagemUsuario: message,
        dadosDocumento: {},
      },
      'Posso te ajudar a criar documentos profissionais.\n\nDiga qual precisa:\n**contrato** · **proposta** · **orçamento** · **relatório** · **NDA**'
    );
    logAndAdvanceTurn(message, textoDefault);
    return res.json(buildResponse(textoDefault, state));
  }

  // ── WORKFLOW ATIVO — extração e avanço ────────────────────
  const currentGroup = getCurrentGroup(state);
  if (!currentGroup) {
    await deleteState(userId);
    return res.json(buildResponse('⚠️ Erro de estado interno. Vamos recomeçar.', await getState(userId)));
  }

  const workflowDef = workflows[state.workflowName!];
  const camposPendentes = workflowDef.steps.filter(s =>
    state.pendingFieldsInCurrentGroup.includes(s.field)
  );

  const extracted = await extrairMultiplosCampos(message, camposPendentes, currentGroup.label);

  logger.debug({ userId, group: currentGroup.id, extracted: Object.keys(extracted) }, '[Chat] Campos extraídos');

  // Passa o state atual para evitar race condition (applyFields não re-busca do store)
  const { newState, savedFields, invalidFields, stillMissing } = await applyFields(userId, extracted, state);
  state = { ...newState, conversationId: state.conversationId, turnNumber };
  await setState(userId, state);

  // Labels legíveis para a IA
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
      state
    );
    logTurn({ userId, conversationId: state.conversationId!, turnNumber, userMessage: message, aiResponse: textoFinal, groupId: currentGroup.id, extractedFields: extracted, savedFields });
    completeConversation(state.conversationId!, state.data);
    return res.json(buildResponse(textoFinal, state, true, { readyToDownload: true }));
  }

  // ── Detecta se a mensagem é uma pergunta sobre campos/doc ──
  const PADROES_PERGUNTA_CAMPO = [
    /\bo que [eé]\b/i,
    /\bpara que serve\b/i,
    /\bpor que (preciso|é necessário|pede|pedir)\b/i,
    /\bpreciso mesmo\b/i,
    /\bposso pular\b/i,
    /\bé obrigatório\b/i,
    /\bnão sei o (que|qual)\b/i,
    /\bme explica\b/i,
    /\bme explique\b/i,
    /\bqual a diferença\b/i,
    /\bcomo (preencher|colocar|informar|escrever)\b/i,
    /\bo que significa\b/i,
    /\bsignificado\b/i,
    /\bcomo assim\b/i,
    /\bnão entendo\b/i,
    /\bnão entendi\b/i,
    /^\s*\?+\s*$/,
  ];
  const isPerguntaCampo = savedFields.length === 0 && invalidFields.length === 0
    && PADROES_PERGUNTA_CAMPO.some(p => p.test(message));

  // ── Determina situação para gerar resposta ─────────────────
  let situacao: RespostaConversacionalInput['situacao'];
  if (savedFields.length > 0 && invalidFields.length === 0) {
    situacao = 'campos_salvos';
  } else if (invalidFields.length > 0) {
    situacao = 'campos_invalidos';
  } else if (isPerguntaCampo) {
    situacao = 'explicar_campo';
  } else {
    situacao = 'sem_extracao';
  }

  // Fallback hardcoded (caso Groq falhe)
  let fallback = '';
  if (situacao === 'campos_salvos') {
    fallback = savedLabels.length === currentGroup.fields.length && invalidFields.length === 0
      ? `✅ **${currentGroup.label}** registrado.\n\n${getCurrentGroupQuestion(state) ?? ''}`
      : `✅ Recebi: **${savedLabels.join(', ')}**.\n\n${getCurrentGroupQuestion(state) ?? ''}`;
  } else if (situacao === 'campos_invalidos') {
    fallback = `⚠️ Atenção com o formato:\n${invalidLabels.map(e => `• ${e}`).join('\n')}\n\n${getCurrentGroupQuestion(state) ?? ''}`;
  } else if (situacao === 'explicar_campo') {
    fallback = `Para tirar dúvidas sobre este campo, veja as instruções abaixo.\n\n${getCurrentGroupQuestion(state) ?? 'Por favor, forneça as informações solicitadas.'}`;
  } else {
    fallback = `🤔 Não consegui identificar as informações. ${getCurrentGroupQuestion(state) ?? 'Por favor, forneça as informações solicitadas.'}`;
  }

  const nextQuestion = getCurrentGroupQuestion(state) ?? undefined;

  const textoResposta = await resposta(
    {
      situacao,
      tipoDocumento:   state.workflowName ?? undefined,
      camposSalvos:    savedLabels,
      camposInvalidos: invalidLabels,
      camposFaltando:  missingLabels,
      grupAtual:       proximoGrupLabel,
      nextQuestion,
      mensagemUsuario: message,
    },
    fallback,
    state
  );

  // ── Log turn no Supabase (fire-and-forget) ─────────────────
  logTurn({
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
