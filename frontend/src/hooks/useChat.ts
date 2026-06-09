import { useState, useCallback, useRef, useEffect } from 'react';
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
  // Typewriter — texto completo vs. texto visível
  fullText?: string;
  typing?: boolean;
}

// ── Hook: anima texto caractere a caractere ───────────────────
export function useTypewriter(msg: Message, onDone?: () => void) {
  const [displayed, setDisplayed] = useState(msg.typing ? '' : msg.text);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!msg.typing || !msg.fullText) return;
    let i = 0;
    const full = msg.fullText;
    // Velocidade adaptativa: mensagens longas ficam mais rápidas para não travar
    const delay = full.length > 400 ? 6 : full.length > 200 ? 10 : 14;
    setDisplayed('');
    const timer = setInterval(() => {
      i++;
      setDisplayed(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(timer);
        doneRef.current?.();
      }
    }, delay);
    return () => clearInterval(timer);
  }, [msg.id, msg.typing, msg.fullText]);

  return displayed;
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
      const response = await sendMessage(text, conversationId);

      const aiId = generateId();
      const aiMsg: Message = {
        id: aiId,
        text: '',           // começa vazio — typewriter preenche
        fullText: response.resposta,
        typing: true,
        sender: 'ai',
        timestamp: new Date(),
        dadosExtraidos:        response.dadosExtraidos,
        dadosFaltantes:        response.dadosFaltantes,
        tipoDocumento:         response.tipoDocumento,
        aguardandoConfirmacao: response.aguardandoConfirmacao,
        readyToDownload:       response.readyToDownload,
        progress:              response.progress,
        exampleBlock:          response.exampleBlock,
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
    const nomes: Record<string, string> = {
      contrato:           'BepeAI_Contrato_Prestacao_Servicos',
      proposta_comercial: 'BepeAI_Proposta_Comercial',
      orcamento:          'BepeAI_Orcamento',
      relatorio_final:    'BepeAI_Relatorio_Final',
      nda:                'BepeAI_Acordo_Confidencialidade',
    };
    const nomeArquivo = nomes[tipoDocumento] ?? `BepeAI_${tipoDocumento}`;
    const data = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    a.download = `${nomeArquivo}_${data}.pdf`;
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
    // Determina se a conversa está completa para saber qual mensagem recebe o botão PDF
    const isCompleted = detail.status === 'completed';
    const lastTurnIdx = detail.turns.length - 1;

    const restored: Message[] = detail.turns.flatMap((turn, idx) => {
      const isLastTurn = idx === lastTurnIdx;

      const userMsg: Message = {
        id: `h-user-${turn.turnNumber}`,
        text: turn.userMessage,
        sender: 'user',
        timestamp: new Date(turn.createdAt),
        typing: false,
      };

      const aiMsg: Message = {
        id: `h-ai-${turn.turnNumber}`,
        text: turn.aiResponse,
        fullText: turn.aiResponse,
        sender: 'ai',
        timestamp: new Date(turn.createdAt),
        typing: false,
        // Só o último turno de uma conversa completa expõe o botão PDF
        ...(isCompleted && isLastTurn && detail.finalData
          ? {
              dadosExtraidos: detail.finalData,
              dadosFaltantes: [],
              tipoDocumento: detail.workflowType,
              readyToDownload: true,
              aguardandoConfirmacao: true,
            }
          : {}),
      };

      return [userMsg, aiMsg];
    });

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
