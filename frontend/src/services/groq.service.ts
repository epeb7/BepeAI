import api from './api';

export interface ProgressInfo {
  currentGroup: number;
  totalGroups: number;
  currentGroupLabel: string;
  completedFields: number;
  totalFields: number;
  isComplete: boolean;
}

export interface ChatResponse {
  success: boolean;
  resposta: string;
  dadosExtraidos: Record<string, string>;
  dadosFaltantes: string[];
  tipoDocumento: string | null;
  aguardandoConfirmacao?: boolean;
  readyToDownload?: boolean;
  progress?: ProgressInfo;
  exampleBlock?: string | null;
  conversationId?: string | null;
}

export const sendMessage = async (message: string, conversationId?: string | null): Promise<ChatResponse> => {
  const headers: Record<string, string> = {};
  if (conversationId) headers['x-conversation-id'] = conversationId;
  const response = await api.post('/chat', { message }, { headers });
  return response.data;
};

export const generatePDF = async (
  dados: Record<string, string>,
): Promise<Blob> => {
  const response = await api.post(
    '/pdf/generate',
    { dados },
    { responseType: 'blob' }
  );
  return response.data;
};
