// frontend/src/services/groq.service.ts
import api from './api';

export interface MensagemHistorico {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  success: boolean;
  resposta: string;
  dadosExtraidos: Record<string, any>;
  dadosFaltantes: string[];
  tipoDocumento: string;
}

export const sendMessage = async (message: string): Promise<ChatResponse> => {
  const response = await api.post('/chat', { message });
  return response.data;
};

export const generatePDF = async (dados: any, logoBase64?: string): Promise<Blob> => {
  const response = await api.post('/pdf/generate', { dados, logoBase64 }, {
    responseType: 'blob',
  });
  return response.data;
};