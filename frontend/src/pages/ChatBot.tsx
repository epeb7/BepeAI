import { useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';
import { ChatMessage } from '../components/chat/ChatMessage';
import { ChatInput } from '../components/chat/ChatInput';
import { TypingIndicator } from '../components/chat/TypingIndicator';
import { Button } from '../components/ui/button';
import { PlusCircle } from 'lucide-react';
import api from '../services/api';
import { LogoBrain } from '../components/logo/LogoBrain';

export const ChatBot = () => {
  const { messages, isLoading, sendUserMessage, resetMessages } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Rolagem automática
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const resetConversation = async () => {
    try {
      await api.post('/chat/reset');
      resetMessages();
    } catch (error) {
      console.error('Erro ao resetar conversa', error);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Cabeçalho */}
      <header className="bg-black/30 backdrop-blur-md border-b border-white/10 sticky top-0 z-10 px-6 py-4 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 w-9 h-9 rounded-xl flex items-center justify-center shadow-md">
            <LogoBrain size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              BepeAI
            </h1>
            <p className="text-xs text-gray-400">Automação documental inteligente</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={resetConversation}
          className="gap-2 rounded-full border-white/20 bg-white/5 hover:bg-white/10 text-white"
        >
          <PlusCircle className="h-4 w-4" />
          Nova conversa
        </Button>
      </header>

      {/* Área de mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="bg-white/5 rounded-full p-4 mb-4 backdrop-blur-sm">
                <LogoBrain size={48} className="text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">Bem-vindo à BepeAI</h2>
              <p className="text-gray-400 mt-2 max-w-md">
                Envie uma mensagem para criar contratos, propostas, relatórios ou orçamentos.
              </p>
              <div className="mt-8 flex flex-wrap gap-3 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => sendUserMessage('contrato')}
                  className="border-blue-500/30 text-blue-300 hover:bg-blue-500/10"
                >
                  📄 Contrato
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => sendUserMessage('proposta comercial')}
                  className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
                >
                  💼 Proposta
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => sendUserMessage('relatório final')}
                  className="border-green-500/30 text-green-300 hover:bg-green-500/10"
                >
                  📊 Relatório
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => sendUserMessage('orçamento')}
                  className="border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/10"
                >
                  💰 Orçamento
                </Button>
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {isLoading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-white/10 bg-black/30 backdrop-blur-md p-4">
        <div className="max-w-4xl mx-auto">
          <ChatInput onSend={sendUserMessage} disabled={isLoading} />
        </div>
      </div>
    </div>
  );
};