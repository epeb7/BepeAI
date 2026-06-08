/**
 * Workflow Engine v2
 *
 * Opera sobre grupos de campos (FieldGroup) em vez de campos individuais.
 * Uma única interação pode preencher múltiplos campos simultaneamente.
 *
 * Estado principal:
 *  - currentGroupIndex:              qual grupo está sendo coletado
 *  - pendingFieldsInCurrentGroup:    campos ainda faltando no grupo atual
 *  - data:                           todos os dados coletados
 *  - completedFields:                campos já preenchidos
 */

import { workflows, FieldGroup } from '../workflows/definitions';

export interface WorkflowState {
  workflowName: string | null;
  currentGroupIndex: number;
  pendingFieldsInCurrentGroup: string[];
  data: Record<string, string>;
  completedFields: string[];
  awaitingConfirmation: boolean;
  /** ID persistido da conversa no Supabase — sobrevive a restarts do servidor */
  conversationId: string | null;
  /** Contador de turns persistido junto ao estado */
  turnNumber: number;
}

export interface ApplyResult {
  newState: WorkflowState;
  savedFields: string[];
  invalidFields: Array<{ field: string; error: string }>;
  stillMissing: string[];
}

// ============================================================
// Funções de ciclo de vida
// ============================================================

export function createEmptyState(): WorkflowState {
  return {
    workflowName: null,
    currentGroupIndex: 0,
    pendingFieldsInCurrentGroup: [],
    data: {},
    completedFields: [],
    awaitingConfirmation: false,
    conversationId: null,
    turnNumber: 0,
  };
}

export function startWorkflow(workflowName: string): WorkflowState {
  const workflow = workflows[workflowName];
  if (!workflow) throw new Error(`Workflow desconhecido: ${workflowName}`);
  const firstGroup = workflow.fieldGroups[0];
  return {
    workflowName,
    currentGroupIndex: 0,
    pendingFieldsInCurrentGroup: firstGroup ? [...firstGroup.fields] : [],
    data: {},
    completedFields: [],
    awaitingConfirmation: false,
    conversationId: null,
    turnNumber: 0,
  };
}

// ============================================================
// Leitura de estado
// ============================================================

export function getCurrentGroup(state: WorkflowState): FieldGroup | null {
  if (!state.workflowName) return null;
  const workflow = workflows[state.workflowName];
  if (!workflow) return null;
  return workflow.fieldGroups[state.currentGroupIndex] ?? null;
}

export function getCurrentGroupQuestion(state: WorkflowState): string | null {
  if (!state.workflowName) return null;
  const workflow = workflows[state.workflowName];
  if (!workflow) return null;

  const group = workflow.fieldGroups[state.currentGroupIndex];
  if (!group) return null;

  const pending = state.pendingFieldsInCurrentGroup;
  if (pending.length === 0) return null;

  // Todos os campos do grupo ainda faltam → pergunta completa do grupo
  if (pending.length === group.fields.length) {
    return group.question;
  }

  // Alguns campos já preenchidos → pergunta focalizada nos pendentes
  const pendingSteps = workflow.steps.filter(s => pending.includes(s.field));
  const items = pendingSteps
    .map(s => {
      const fieldLabel = s.label ?? s.field.replace(/_/g, ' ');
      const hint = s.example ? ` (ex: ${s.example})` : '';
      return `• **${fieldLabel}:** ${s.question}${hint}`;
    })
    .join('\n');

  return `Ainda preciso de algumas informações de **${group.label}**:\n\n${items}`;
}

export function getCurrentGroupExample(state: WorkflowState): string | null {
  if (!state.workflowName) return null;
  const workflow = workflows[state.workflowName];
  if (!workflow) return null;
  const group = workflow.fieldGroups[state.currentGroupIndex];
  return group?.example ?? null;
}

export function isWorkflowComplete(state: WorkflowState): boolean {
  if (!state.workflowName) return false;
  const workflow = workflows[state.workflowName];
  if (!workflow) return false;
  return state.currentGroupIndex >= workflow.fieldGroups.length;
}

export function getAllMissingFields(state: WorkflowState): string[] {
  if (!state.workflowName) return [];
  const workflow = workflows[state.workflowName];
  if (!workflow) return [];
  return workflow.steps.map(s => s.field).filter(f => !state.completedFields.includes(f));
}

export function getProgressInfo(state: WorkflowState) {
  if (!state.workflowName) return null;
  const workflow = workflows[state.workflowName];
  if (!workflow) return null;

  const currentGroup = workflow.fieldGroups[state.currentGroupIndex];
  const isComplete = isWorkflowComplete(state);

  return {
    currentGroup: state.currentGroupIndex,
    totalGroups: workflow.fieldGroups.length,
    currentGroupLabel: isComplete ? 'Concluído' : (currentGroup?.label ?? ''),
    completedFields: state.completedFields.length,
    totalFields: workflow.steps.length,
    isComplete,
  };
}

// ============================================================
// Mutações de estado
// ============================================================

/**
 * Aplica um conjunto de valores extraídos ao estado atual.
 * Valida cada campo contra seu validador definido.
 * Avança automaticamente para o próximo grupo quando o atual é completado.
 */
export function applyExtractedFields(
  state: WorkflowState,
  extracted: Record<string, string>
): ApplyResult {
  if (!state.workflowName) {
    return { newState: state, savedFields: [], invalidFields: [], stillMissing: [] };
  }

  const workflow = workflows[state.workflowName];
  const saved: string[] = [];
  const invalid: Array<{ field: string; error: string }> = [];
  const newData = { ...state.data };

  for (const field of state.pendingFieldsInCurrentGroup) {
    const value = extracted[field];
    if (!value || !value.trim()) continue;

    const step = workflow.steps.find(s => s.field === field);
    if (!step) continue;

    if (step.validator && !step.validator(value.trim())) {
      invalid.push({ field, error: step.errorMessage || `Formato inválido para ${field}` });
    } else {
      newData[field] = value.trim();
      saved.push(field);
    }
  }

  const newPending = state.pendingFieldsInCurrentGroup.filter(f => !saved.includes(f));
  const newCompleted = [...state.completedFields, ...saved];

  let newGroupIndex = state.currentGroupIndex;
  let nextGroupPending: string[] = newPending;

  // Grupo atual concluído → avançar para o próximo
  if (newPending.length === 0) {
    newGroupIndex = state.currentGroupIndex + 1;
    const nextGroup = workflow.fieldGroups[newGroupIndex];
    nextGroupPending = nextGroup ? [...nextGroup.fields] : [];
  }

  const newState: WorkflowState = {
    ...state,
    currentGroupIndex: newGroupIndex,
    pendingFieldsInCurrentGroup: nextGroupPending,
    data: newData,
    completedFields: newCompleted,
  };

  return { newState, savedFields: saved, invalidFields: invalid, stillMissing: newPending };
}

/**
 * Desfaz o estado até o grupo que contém o campo solicitado.
 * Remove todos os dados desse grupo em diante.
 */
export function rollbackToField(state: WorkflowState, field: string): WorkflowState | null {
  if (!state.workflowName) return null;
  const workflow = workflows[state.workflowName];
  if (!workflow) return null;

  // Encontra o índice do grupo que contém o campo
  const groupIndex = workflow.fieldGroups.findIndex(g => g.fields.includes(field));
  if (groupIndex === -1) return null;

  // Preserva apenas dados dos grupos anteriores ao alvo
  const fieldsToKeep = workflow.fieldGroups
    .slice(0, groupIndex)
    .flatMap(g => g.fields);

  const newData: Record<string, string> = {};
  for (const f of fieldsToKeep) {
    if (state.data[f]) newData[f] = state.data[f];
  }

  const targetGroup = workflow.fieldGroups[groupIndex];

  return {
    ...state,
    currentGroupIndex: groupIndex,
    pendingFieldsInCurrentGroup: [...targetGroup.fields],
    data: newData,
    completedFields: Object.keys(newData),
    awaitingConfirmation: false,
    // conversationId e turnNumber são preservados pelo spread
  };
}
