/**
 * Conversation Service
 *
 * Gerencia o ciclo de vida das sessões de conversa.
 * Usa SessionStore como abstração — swap para Redis sem alterar este arquivo.
 */

import { createSessionStore } from '../lib/session.store';
import {
  WorkflowState,
  createEmptyState,
  startWorkflow,
  getCurrentGroup,
  getCurrentGroupQuestion,
  getCurrentGroupExample,
  applyExtractedFields,
  isWorkflowComplete,
  rollbackToField,
  getProgressInfo,
  ApplyResult,
} from './workflow.service';

export type { WorkflowState } from './workflow.service';

const store = createSessionStore<WorkflowState>(86_400); // TTL: 24h

// ============================================================
// CRUD de sessão
// ============================================================

export async function getState(userId: string): Promise<WorkflowState> {
  const state = await store.get(userId);
  if (!state) {
    const empty = createEmptyState();
    await store.set(userId, empty);
    return empty;
  }
  return state;
}

export async function setState(userId: string, state: WorkflowState): Promise<void> {
  await store.set(userId, state);
}

export async function deleteState(userId: string): Promise<void> {
  await store.delete(userId);
}

// ============================================================
// Operações de workflow
// ============================================================

export async function initWorkflow(userId: string, tipo: string): Promise<WorkflowState> {
  const state = startWorkflow(tipo);
  await store.set(userId, state);
  return state;
}

export async function applyFields(
  userId: string,
  extracted: Record<string, string>
): Promise<ApplyResult> {
  const state = await getState(userId);
  const result = applyExtractedFields(state, extracted);
  await store.set(userId, result.newState);
  return result;
}

export async function rollback(
  userId: string,
  field: string
): Promise<WorkflowState | null> {
  const state = await getState(userId);
  const newState = rollbackToField(state, field);
  if (!newState) return null;
  await store.set(userId, newState);
  return newState;
}

// ============================================================
// Re-exports de leitura pura (sem efeito em store)
// ============================================================

export {
  getCurrentGroup,
  getCurrentGroupQuestion,
  getCurrentGroupExample,
  isWorkflowComplete,
  getProgressInfo,
};
