import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import {
  getState,
  setTipoDocumento,
  getCampoAtual,
  getPerguntaAtual,
  avançarEtapa,
  isConversaFinalizada,
  resetState,
  getDadosCompletos,
} from '../services/conversation.service';
import { extrairCampo } from '../services/groq.service';
import { detectIntent, extractFieldToEdit } from '../services/intent.service';
import { workflows, WorkflowStep } from '../workflows/definitions';
import { gerarPDF } from '../services/pdf.service'; // <-- importação do serviço de PDF

const isSaudacao = (texto: string): boolean => {
  const saudacoes = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'oie', 'e aí', 'opa', 'hey', 'hello'];
  return saudacoes.some(s => texto.toLowerCase().includes(s));
};

export const sendMessage = async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Mensagem vazia' });

  console.log(`[Chat] ${userId}: ${message}`);
  let state = getState(userId);
  console.log('[Chat] Estado antes:', JSON.stringify(state.workflowState, null, 2));

  // Detectar intenção
  const intent = detectIntent(message, state.workflowState);
  console.log('[Chat] Intenção detectada:', intent);

  // Comandos globais
  if (intent === 'CANCEL') {
    resetState(userId);
    return res.json({
      success: true,
      resposta: '🔄 Conversa reiniciada. Que tipo de documento você quer criar? (contrato, proposta, relatório ou orçamento)',
      dadosExtraidos: {},
      dadosFaltantes: [],
      tipoDocumento: null,
    });
  }

  if (intent === 'HELP') {
    return res.json({
      success: true,
      resposta: '📘 **Ajuda**:\n- Digite o tipo de documento (contrato, proposta, relatório, orçamento)\n- Responda as perguntas uma a uma\n- Use "corrigir [campo]" para alterar um dado\n- Digite "cancelar" para recomeçar',
      dadosExtraidos: state.workflowState.data,
      dadosFaltantes: [],
      tipoDocumento: state.workflowState.workflowName,
    });
  }

  // ========== FLUXO DE CONFIRMAÇÃO E GERAÇÃO DE PDF ==========
  if (isConversaFinalizada(state) && intent === 'CONFIRM') {
    try {
      const dados = getDadosCompletos(userId);
      const tipo = state.workflowState.workflowName!;
      const pdfBuffer = await gerarPDF(dados, tipo);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${tipo}_${Date.now()}.pdf`);
      return res.send(pdfBuffer);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      return res.status(500).json({ success: false, error: 'Erro ao gerar o documento PDF. Tente novamente.' });
    }
  }

  // Edição de campo após finalização (ainda em desenvolvimento)
  if (isConversaFinalizada(state) && intent === 'EDIT_FIELD') {
    const field = extractFieldToEdit(message);
    if (field && state.workflowState.data[field] !== undefined) {
      return res.json({
        success: true,
        resposta: `✏️ Para corrigir ${field}, por favor, envie o novo valor. (Funcionalidade em desenvolvimento)`,
        dadosExtraidos: state.workflowState.data,
        dadosFaltantes: [],
        tipoDocumento: state.workflowState.workflowName,
      });
    } else {
      return res.json({
        success: true,
        resposta: `🤔 Não entendi qual campo corrigir. Diga "corrigir empresa", "corrigir cnpj", etc.`,
        dadosExtraidos: state.workflowState.data,
        dadosFaltantes: [],
        tipoDocumento: state.workflowState.workflowName,
      });
    }
  }

  // Etapa 0: sem workflow ativo
  if (!state.workflowState.workflowName) {
    if (isSaudacao(message)) {
      return res.json({
        success: true,
        resposta: '👋 Olá! Sou a BepeAI. Posso criar contratos, propostas, relatórios e orçamentos. Que tipo de documento você gostaria de gerar?',
        dadosExtraidos: {},
        dadosFaltantes: [],
        tipoDocumento: null,
      });
    }

    const msgLower = message.toLowerCase();
    let tipoReconhecido: string | null = null;
    if (msgLower.includes('contrato')) tipoReconhecido = 'contrato';
    else if (msgLower.includes('proposta')) tipoReconhecido = 'proposta_comercial';
    else if (msgLower.includes('relatório') || msgLower.includes('relatorio')) tipoReconhecido = 'relatorio_final';
    else if (msgLower.includes('orçamento') || msgLower.includes('orcamento')) tipoReconhecido = 'orcamento';

    if (tipoReconhecido) {
      setTipoDocumento(userId, tipoReconhecido);
      state = getState(userId);
      const pergunta = getPerguntaAtual(state);
      console.log('[Chat] Workflow iniciado:', tipoReconhecido, 'Pergunta:', pergunta);
      return res.json({
        success: true,
        resposta: `📄 Ótimo! Vamos criar um ${tipoReconhecido}. ${pergunta}`,
        dadosExtraidos: state.workflowState.data,
        dadosFaltantes: [getCampoAtual(state)!],
        tipoDocumento: state.workflowState.workflowName,
      });
    } else {
      return res.json({
        success: true,
        resposta: 'Que tipo de documento você quer criar? (contrato, proposta, relatório ou orçamento)',
        dadosExtraidos: {},
        dadosFaltantes: [],
        tipoDocumento: null,
      });
    }
  }

  // Workflow em andamento (caso já finalizado por acaso – redundante)
  if (isConversaFinalizada(state)) {
    const resumo = Object.entries(state.workflowState.data)
      .map(([k, v]) => `• **${k}**: ${v}`)
      .join('\n');
    return res.json({
      success: true,
      resposta: `✅ **Documento pronto!**\n\n${resumo}\n\nDigite "sim" para gerar o PDF ou "corrigir [campo]" para alterar.`,
      dadosExtraidos: state.workflowState.data,
      dadosFaltantes: [],
      tipoDocumento: state.workflowState.workflowName,
      aguardandoConfirmacao: true,
    });
  }

  const campoAtual = getCampoAtual(state);
  if (!campoAtual) {
    resetState(userId);
    return res.json({
      success: true,
      resposta: '⚠️ Erro. Vamos recomeçar. Que documento você quer criar?',
      dadosExtraidos: {},
      dadosFaltantes: [],
      tipoDocumento: null,
    });
  }

  // Extrair valor
  let valorExtraido = await extrairCampo(message, campoAtual);
  console.log(`[Chat] Valor extraído para ${campoAtual}: "${valorExtraido}"`);

  // Obter step atual para validação
  const workflowDef = state.workflowState.workflowName ? workflows[state.workflowState.workflowName] : null;
  const step: WorkflowStep | undefined = workflowDef?.steps.find((s: WorkflowStep) => s.field === campoAtual);
  const validador = step?.validator;

  if (valorExtraido && validador && !validador(valorExtraido)) {
    const exemplo = step?.example ? ` (ex: ${step.example})` : '';
    return res.json({
      success: true,
      resposta: `❌ ${step?.errorMessage || 'Formato inválido'}. ${step?.question}${exemplo}`,
      dadosExtraidos: state.workflowState.data,
      dadosFaltantes: [campoAtual],
      tipoDocumento: state.workflowState.workflowName,
    });
  }

  if (!valorExtraido) {
    const pergunta = getPerguntaAtual(state);
    const exemplo = step?.example ? ` (ex: ${step.example})` : '';
    return res.json({
      success: true,
      resposta: `🤔 Não entendi. ${pergunta}${exemplo}`,
      dadosExtraidos: state.workflowState.data,
      dadosFaltantes: [campoAtual],
      tipoDocumento: state.workflowState.workflowName,
    });
  }

  const result = await avançarEtapa(userId, valorExtraido);
  if (!result.success) {
    return res.json({
      success: true,
      resposta: `❌ ${result.error}. ${getPerguntaAtual(state)}`,
      dadosExtraidos: state.workflowState.data,
      dadosFaltantes: [campoAtual],
      tipoDocumento: state.workflowState.workflowName,
    });
  }

  state = getState(userId);
  console.log('[Chat] Estado após avanço:', JSON.stringify(state.workflowState, null, 2));

  if (isConversaFinalizada(state)) {
    const resumo = Object.entries(state.workflowState.data)
      .map(([k, v]) => `• **${k}**: ${v}`)
      .join('\n');
    return res.json({
      success: true,
      resposta: `✅ **Coleta concluída!**\n\n${resumo}\n\nDigite "sim" para gerar o PDF ou "corrigir [campo]" para alterar.`,
      dadosExtraidos: state.workflowState.data,
      dadosFaltantes: [],
      tipoDocumento: state.workflowState.workflowName,
      aguardandoConfirmacao: true,
    });
  } else {
    const proximaPergunta = getPerguntaAtual(state);
    return res.json({
      success: true,
      resposta: proximaPergunta,
      dadosExtraidos: state.workflowState.data,
      dadosFaltantes: [getCampoAtual(state)!],
      tipoDocumento: state.workflowState.workflowName,
    });
  }
};