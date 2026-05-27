// engine.service.ts - Motor de workflow declarativo

export interface WorkflowStep {
  field: string;
  question: string;
  validator?: (value: string) => boolean;
  errorMessage?: string;
  required: boolean;
  next?: string; // opcional: próximo campo (por padrão segue ordem)
}

export interface WorkflowDefinition {
  name: string;
  steps: WorkflowStep[];
}

export interface WorkflowState {
  workflowName: string | null;
  currentStepIndex: number;
  data: Record<string, string>;
}

// ============================================
// Funções de gerenciamento de estado
// ============================================

export function createEmptyState(): WorkflowState {
  return {
    workflowName: null,
    currentStepIndex: 0,
    data: {},
  };
}

export function startWorkflow(workflowName: string, definitions: Record<string, WorkflowDefinition>): WorkflowState {
  const def = definitions[workflowName];
  if (!def) throw new Error(`Workflow desconhecido: ${workflowName}`);
  return {
    workflowName,
    currentStepIndex: 0,
    data: {},
  };
}

export function getCurrentStep(state: WorkflowState, definitions: Record<string, WorkflowDefinition>): WorkflowStep | null {
  if (!state.workflowName) return null;
  const def = definitions[state.workflowName];
  if (!def) return null;
  if (state.currentStepIndex >= def.steps.length) return null;
  return def.steps[state.currentStepIndex];
}

export function getCurrentQuestion(state: WorkflowState, definitions: Record<string, WorkflowDefinition>): string | null {
  const step = getCurrentStep(state, definitions);
  return step ? step.question : null;
}

export function applyFieldValue(
  state: WorkflowState,
  field: string,
  value: string,
  definitions: Record<string, WorkflowDefinition>
): { newState: WorkflowState; error?: string } {
  if (!state.workflowName) return { newState: state, error: 'Nenhum workflow ativo' };
  const def = definitions[state.workflowName];
  if (!def) return { newState: state, error: 'Workflow inválido' };
  const currentStep = getCurrentStep(state, definitions);
  if (!currentStep) return { newState: state, error: 'Nenhum campo ativo' };
  if (currentStep.field !== field) {
    return { newState: state, error: `Campo esperado: ${currentStep.field}` };
  }
  // Validação
  if (currentStep.validator && !currentStep.validator(value)) {
    const msg = currentStep.errorMessage || `Valor inválido para ${field}`;
    return { newState: state, error: msg };
  }
  // Atualiza dados
  const newData = { ...state.data, [field]: value };
  const newIndex = state.currentStepIndex + 1;
  const newState = {
    ...state,
    data: newData,
    currentStepIndex: newIndex,
  };
  return { newState };
}

export function isWorkflowComplete(state: WorkflowState, definitions: Record<string, WorkflowDefinition>): boolean {
  if (!state.workflowName) return false;
  const def = definitions[state.workflowName];
  if (!def) return false;
  return state.currentStepIndex >= def.steps.length;
}

export function resetWorkflow(): WorkflowState {
  return createEmptyState();
}