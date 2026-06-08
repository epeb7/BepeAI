import api from './api';

export interface ConversationSummary {
  id: string;
  title: string | null;
  workflowType: string | null;
  status: 'in_progress' | 'completed';
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

export const historyService = {
  list: async (): Promise<ConversationSummary[]> => {
    const res = await api.get('/history');
    return res.data.conversations;
  },

  get: async (id: string): Promise<ConversationDetail> => {
    const res = await api.get(`/history/${id}`);
    return res.data.conversation;
  },

  rename: async (id: string, title: string): Promise<void> => {
    await api.patch(`/history/${id}`, { title });
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/history/${id}`);
  },
};
