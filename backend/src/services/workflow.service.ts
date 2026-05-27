// workflow.service.ts - Motor de workflow (puro, sem dependência circular)
import { workflows, WorkflowStep, WorkflowDefinition } from '../workflows/definitions';

export interface WorkflowState {
  workflowName: string | null;
  currentStepIndex: number;
  data: Record<string, string>;
  completedFields: string[];
  missingFields: string[];
  awaitingConfirmation: boolean;
}

export function createEmptyState(): WorkflowState {
  return {
    workflowName: null,
    currentStepIndex: 0,
    data: {},
    completedFields: [],
    missingFields: [],
    awaitingConfirmation: false,
  };
}

export function startWorkflow(workflowName: string): WorkflowState {
  const workflow = workflows[workflowName];
  if (!workflow) throw new Error(`Workflow ${workflowName} not found`);
  const missingFields = workflow.steps.map(step => step.field);
  return {
    workflowName,
    currentStepIndex: 0,
    data: {},
    completedFields: [],
    missingFields,
    awaitingConfirmation: false,
  };
}

export function getCurrentStep(state: WorkflowState): WorkflowStep | null {
  if (!state.workflowName) return null;
  const workflow = workflows[state.workflowName];
  if (!workflow) return null;
  if (state.currentStepIndex >= workflow.steps.length) return null;
  return workflow.steps[state.currentStepIndex];
}

export function getCurrentQuestion(state: WorkflowState): string | null {
  const step = getCurrentStep(state);
  if (!step) return null;
  let question = step.question;
  if (step.example) question += ` (ex: ${step.example})`;
  return question;
}

export function applyFieldValue(state: WorkflowState, field: string, value: string): { newState: WorkflowState; error?: string } {
  const workflow = workflows[state.workflowName!];
  const step = workflow.steps.find(s => s.field === field);
  if (!step) return { newState: state, error: `Campo desconhecido: ${field}` };
  
  if (step.validator && !step.validator(value)) {
    return { newState: state, error: step.errorMessage || `Valor inválido para ${field}` };
  }
  
  const newData = { ...state.data, [field]: value };
  const newCompletedFields = [...state.completedFields, field];
  const newMissingFields = state.missingFields.filter(f => f !== field);
  const newIndex = newCompletedFields.length;
  return {
    newState: {
      ...state,
      data: newData,
      completedFields: newCompletedFields,
      missingFields: newMissingFields,
      currentStepIndex: newIndex,
    },
  };
}

export function isWorkflowComplete(state: WorkflowState): boolean {
  if (!state.workflowName) return false;
  const workflow = workflows[state.workflowName];
  return state.completedFields.length === workflow.steps.length;
}

export function resetWorkflow(): WorkflowState {
  return createEmptyState();
}