import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { FileText, CheckCircle, Sparkles } from 'lucide-react';
import { generatePDF } from '../../services/groq.service';
import { useState } from 'react';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  dadosExtraidos?: Record<string, any>;
  dadosFaltantes?: string[];
  tipoDocumento?: string;
}

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage = ({ message }: ChatMessageProps) => {
  const isUser = message.sender === 'user';
  const [isGenerating, setIsGenerating] = useState(false);
  const podeGerarPDF = !isUser && message.dadosExtraidos && message.dadosFaltantes?.length === 0;

  const handleGeneratePDF = async () => {
    if (!message.dadosExtraidos || !message.tipoDocumento) return;
    setIsGenerating(true);
    try {
      const logoBase64 = localStorage.getItem('logoBase64') || undefined;
      const blob = await generatePDF(
        {
          tipoDocumento: message.tipoDocumento,
          ...message.dadosExtraidos,
        },
        logoBase64
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${message.tipoDocumento}_${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  const formattedTime = message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={cn('flex animate-fade-in-up', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2 shadow-xl transition-all duration-200',
          isUser
            ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-br-none border border-white/10'
            : 'bg-white/5 backdrop-blur-sm text-gray-200 rounded-bl-none border border-white/10'
        )}
      >
        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{message.text}</p>
        {podeGerarPDF && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleGeneratePDF}
            disabled={isGenerating}
            className="mt-2 gap-1 rounded-full text-xs h-7 px-3 bg-white/10 hover:bg-white/20 border-white/20 text-white"
          >
            <FileText className="h-3.5 w-3.5" />
            {isGenerating ? 'Gerando...' : 'Gerar PDF'}
          </Button>
        )}
        <div className={cn('text-xs mt-1 flex items-center gap-1', isUser ? 'text-blue-200' : 'text-gray-400')}>
          <span>{formattedTime}</span>
          {isUser && <CheckCircle className="h-3 w-3" />}
          {!isUser && <Sparkles className="h-3 w-3" />}
        </div>
      </div>
    </div>
  );
};