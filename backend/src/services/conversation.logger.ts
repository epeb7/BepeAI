/**
 * Conversation Logger — persiste e gerencia histórico de conversas no Supabase.
 * Todas as operações de escrita são non-blocking.
 * Operações de leitura (histórico, rename) retornam dados ou null.
 */

import { supabase, supabaseEnabled } from '../lib/supabase';
import logger from '../lib/logger';

// ── Tipos públicos ────────────────────────────────────────────

export interface TurnLog {
  userId: string;
  conversationId: string;
  turnNumber: number;
  userMessage: string;
  aiResponse: string;
  groupId?: string;
  extractedFields?: Record<string, string>;
  savedFields?: string[];
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  workflowType: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
}

export interface ConversationTurn {
  turnNumber: number;
  userMessage: string;
  aiResponse: string;
  groupId: string | null;
  extractedFields: Record<string, string> | null;
  savedFields: string[] | null;
  createdAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  turns: ConversationTurn[];
  finalData: Record<string, string> | null;
}

// ── Helper interno ────────────────────────────────────────────

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  if (!supabaseEnabled || !supabase) return null;
  try {
    return await fn();
  } catch (err) {
    logger.warn({ err }, `[ConvLogger] ${label} falhou (non-blocking)`);
    return null;
  }
}

// Gera título automático a partir do tipo de workflow
function autoTitle(workflowType: string | null): string {
  const tipos: Record<string, string> = {
    contrato:           'Contrato de Prestação de Serviços',
    proposta_comercial: 'Proposta Comercial',
    relatorio_final:    'Relatório Final',
    orcamento:          'Orçamento',
  };
  const base = workflowType ? (tipos[workflowType] ?? workflowType) : 'Nova conversa';
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${base} — ${hora}`;
}

// ── Escrita (non-blocking) ────────────────────────────────────

export async function ensureConversation(userId: string, workflowType: string | null): Promise<string> {
  const id = `${userId}-${workflowType ?? 'unknown'}-${Date.now()}`;

  await safe('ensureConversation', async () => {
    const { error } = await supabase!
      .from('conversations')
      .insert({
        id,
        user_id:       userId,
        workflow_type: workflowType,
        status:        'in_progress',
        title:         autoTitle(workflowType),
        updated_at:    new Date().toISOString(),
      });
    if (error) throw error;
  });

  return id;
}

export async function logTurn(turn: TurnLog): Promise<void> {
  await safe('logTurn', async () => {
    const { error } = await supabase!
      .from('conversation_turns')
      .insert({
        conversation_id:  turn.conversationId,
        user_id:          turn.userId,
        turn_number:      turn.turnNumber,
        user_message:     turn.userMessage,
        ai_response:      turn.aiResponse,
        group_id:         turn.groupId         ?? null,
        extracted_fields: turn.extractedFields ?? null,
        saved_fields:     turn.savedFields     ?? null,
      });
    if (error) throw error;
  });
}

export async function completeConversation(
  conversationId: string,
  finalData: Record<string, string>
): Promise<void> {
  await safe('completeConversation', async () => {
    const { error } = await supabase!
      .from('conversations')
      .update({
        status:       'completed',
        completed_at: new Date().toISOString(),
        updated_at:   new Date().toISOString(),
        final_data:   finalData,
      })
      .eq('id', conversationId);
    if (error) throw error;
  });
}

export async function logGeneratedDocument(
  conversationId: string | null,
  documentType: string,
  fieldData: Record<string, string>
): Promise<void> {
  await safe('logGeneratedDocument', async () => {
    const { error } = await supabase!
      .from('generated_documents')
      .insert({
        conversation_id: conversationId,
        document_type:   documentType,
        field_data:      fieldData,
      });
    if (error) throw error;
  });
}

// ── Leitura (bloqueante — retorna dados ou null) ───────────────

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  return await safe('listConversations', async () => {
    // Busca conversas com contagem de turns via join
    const { data, error } = await supabase!
      .from('conversations')
      .select('id, title, workflow_type, status, created_at, updated_at, conversation_turns(count)')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return (data ?? []).map(r => ({
      id:           r.id,
      title:        r.title,
      workflowType: r.workflow_type,
      status:       r.status,
      createdAt:    r.created_at,
      updatedAt:    r.updated_at,
      turnCount:    (r.conversation_turns as unknown as { count: number }[])[0]?.count ?? 0,
    }));
  }) ?? [];
}

export async function getConversationDetail(
  conversationId: string,
  userId: string
): Promise<ConversationDetail | null> {
  return await safe('getConversationDetail', async () => {
    const { data: conv, error: e1 } = await supabase!
      .from('conversations')
      .select('id, title, workflow_type, status, created_at, updated_at, final_data')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();

    if (e1 || !conv) throw e1 ?? new Error('not found');

    const { data: turns, error: e2 } = await supabase!
      .from('conversation_turns')
      .select('turn_number, user_message, ai_response, group_id, extracted_fields, saved_fields, created_at')
      .eq('conversation_id', conversationId)
      .order('turn_number', { ascending: true });

    if (e2) throw e2;

    return {
      id:           conv.id,
      title:        conv.title,
      workflowType: conv.workflow_type,
      status:       conv.status,
      createdAt:    conv.created_at,
      updatedAt:    conv.updated_at,
      turnCount:    (turns ?? []).length,
      finalData:    conv.final_data,
      turns: (turns ?? []).map(t => ({
        turnNumber:      t.turn_number,
        userMessage:     t.user_message,
        aiResponse:      t.ai_response,
        groupId:         t.group_id    ?? null,
        extractedFields: t.extracted_fields ?? null,
        savedFields:     t.saved_fields     ?? null,
        createdAt:       t.created_at,
      })),
    };
  }) ?? null;
}

export async function renameConversation(
  conversationId: string,
  userId: string,
  newTitle: string
): Promise<boolean> {
  const title = newTitle.trim().slice(0, 100);
  if (!title) return false;

  const result = await safe('renameConversation', async () => {
    const { error } = await supabase!
      .from('conversations')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('user_id', userId);
    if (error) throw error;
    return true;
  });

  return result ?? false;
}

export async function deleteConversation(
  conversationId: string,
  userId: string
): Promise<boolean> {
  const result = await safe('deleteConversation', async () => {
    const { error } = await supabase!
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', userId);
    if (error) throw error;
    return true;
  });

  return result ?? false;
}
