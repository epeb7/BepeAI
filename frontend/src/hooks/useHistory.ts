import { useState, useCallback, useEffect } from 'react';
import { historyService, ConversationSummary, ConversationDetail } from '../services/history.service';

export function useHistory() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading]         = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await historyService.list();
      setConversations(data);
    } catch {
      setError('Não foi possível carregar o histórico.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Carrega na montagem
  useEffect(() => { refresh(); }, [refresh]);

  const loadConversation = useCallback(async (id: string): Promise<ConversationDetail | null> => {
    try {
      return await historyService.get(id);
    } catch {
      return null;
    }
  }, []);

  const rename = useCallback(async (id: string, title: string) => {
    await historyService.rename(id, title);
    // Atualização otimista — sem re-fetch
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c));
  }, []);

  const remove = useCallback(async (id: string) => {
    await historyService.delete(id);
    setConversations(prev => prev.filter(c => c.id !== id));
  }, []);

  return { conversations, isLoading, error, refresh, loadConversation, rename, remove };
}
