import { useState, useCallback, useRef } from 'react';
import { sendMessage, generatePDF, ProgressInfo } from '../services/groq.service';
import api from '../services/api';
import { getBepeLogoBase64 } from '../lib/bepeLogoBase64';
import { ConversationDetail } from '../services/history.service';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  dadosExtraidos?: Record<string, string>;
  dadosFaltantes?: string[];
  tipoDocumento?: string | null;
  aguardandoConfirmacao?: boolean;
  readyToDownload?: boolean;
  progress?: ProgressInfo;
  exampleBlock?: string | null;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useChat(onConversationChange?: () => void) {
  const [messages, setMessages]           = useState<Message[]>([]);
  const [isLoading, setIsLoading]         = useState(false);
  const [latestProgress, setLatestProgress] = useState<ProgressInfo | undefined>();
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Ref para evitar dependência circular no useCallback
  const onChangeRef = useRef(onConversationChange);
  onChangeRef.current = onConversationChange;

  const sendUserMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = {
      id: generateId(), text, sender: 'user', timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await sendMessage(text);

      const aiMsg: Message = {
        id: generateId(),
        text: response.resposta,
        sender: 'ai',
        timestamp: new Date(),
        dadosExtraidos:       response.dadosExtraidos,
        dadosFaltantes:       response.dadosFaltantes,
        tipoDocumento:        response.tipoDocumento,
        aguardandoConfirmacao: response.aguardandoConfirmacao,
        readyToDownload:      response.readyToDownload,
        progress:             response.progress,
        exampleBlock:         response.exampleBlock,
      };

      setMessages(prev => [...prev, aiMsg]);

      if (response.progress) setLatestProgress(response.progress);

      // Armazena conversationId quando o backend retorna um (primeira resposta de workflow)
      if (response.conversationId && response.conversationId !== conversationId) {
        setConversationId(response.conversationId);
        // Notifica o ChatBot para atualizar a lista do histórico
        onChangeRef.current?.();
      }
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: generateId(),
          text: '⚠️ Ocorreu um erro de conexão. Verifique sua internet e tente novamente.',
          sender: 'ai',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, conversationId]);

  const downloadPDF = useCallback(async (
    dadosExtraidos: Record<string, string>,
    tipoDocumento: string
  ) => {
    const logoBase64 = localStorage.getItem('logoBase64') ?? await getBepeLogoBase64();
    const blob = await generatePDF({ tipoDocumento, ...dadosExtraidos }, logoBase64);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tipoDocumento}_${Date.now()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const resetConversation = useCallback(async () => {
    try { await api.post('/chat/reset'); } catch { /* best-effort */ }
    setMessages([]);
    setLatestProgress(undefined);
    setConversationId(null);
  }, []);

  const loadFromHistory = useCallback((detail: ConversationDetail) => {
    const restored: Message[] = detail.turns.flatMap(turn => [
      {
        id: `h-user-${turn.turnNumber}`,
        text: turn.userMessage,
        sender: 'user' as const,
        timestamp: new Date(turn.createdAt),
      },
      {
        id: `h-ai-${turn.turnNumber}`,
        text: turn.aiResponse,
        sender: 'ai' as const,
        timestamp: new Date(turn.createdAt),
      },
    ]);
    setMessages(restored);
    setLatestProgress(undefined);
    setConversationId(detail.id);
  }, []);

  return {
    messages,
    isLoading,
    latestProgress,
    conversationId,
    sendUserMessage,
    downloadPDF,
    resetConversation,
    loadFromHistory,
  };
}
