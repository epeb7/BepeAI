// frontend/src/hooks/useChat.ts
import { useState } from 'react';
import { sendMessage, ChatResponse } from '../services/groq.service';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  dadosExtraidos?: Record<string, any>;
  dadosFaltantes?: string[];
  tipoDocumento?: string;
}

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendUserMessage = async (text: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response: ChatResponse = await sendMessage(text);
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.resposta,
        sender: 'ai',
        timestamp: new Date(),
        dadosExtraidos: response.dadosExtraidos,
        dadosFaltantes: response.dadosFaltantes,
        tipoDocumento: response.tipoDocumento,
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Erro no chat:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Desculpe, ocorreu um erro. Tente novamente.',
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const resetMessages = () => {
    setMessages([]);
  };

  return { messages, isLoading, sendUserMessage, resetMessages };
};