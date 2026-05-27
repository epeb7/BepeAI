// conversation.service.ts
import * as workflowEngine from './workflow.service';
import { workflows } from '../workflows/definitions';

export interface ConversaState {
  workflowState: workflowEngine.WorkflowState;
}

const estados = new Map<string, ConversaState>();

export function getState(userId: string): ConversaState {
  if (!estados.has(userId)) {
    estados.set(userId, { workflowState: workflowEngine.createEmptyState() });
  }
  return estados.get(userId)!;
}

export function setTipoDocumento(userId: string, tipo: string) {
  const state = getState(userId);
  state.workflowState = workflowEngine.startWorkflow(tipo);
  estados.set(userId, state);
}

export function getCampoAtual(state: ConversaState): string | null {
  const step = workflowEngine.getCurrentStep(state.workflowState);
  return step ? step.field : null;
}

export function getPerguntaAtual(state: ConversaState): string | null {
  return workflowEngine.getCurrentQuestion(state.workflowState);
}

export async function avançarEtapa(userId: string, valor: string): Promise<{ success: boolean; error?: string }> {
  const state = getState(userId);
  const campoAtual = getCampoAtual(state);
  if (!campoAtual) return { success: false, error: 'Nenhum campo ativo' };
  const result = workflowEngine.applyFieldValue(state.workflowState, campoAtual, valor);
  if (result.error) return { success: false, error: result.error };
  state.workflowState = result.newState;
  estados.set(userId, state);
  return { success: true };
}

export function isConversaFinalizada(state: ConversaState): boolean {
  return workflowEngine.isWorkflowComplete(state.workflowState);
}

export function resetState(userId: string) {
  estados.delete(userId);
}

export function getDadosCompletos(userId: string): Record<string, string> {
  return getState(userId).workflowState.data;
}

// Validadores expostos para uso externo (opcional)
export const validadores = {
  cnpj: (v: string) => /^\d{14}$/.test(v),
  data: (v: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(v),
  valor: (v: string) => /^\d+(?:[.,]\d+)?$/.test(v),
};