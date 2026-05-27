import { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

export const ChatInput = ({ onSend, disabled }: ChatInputProps) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Função para enviar e manter foco
  const handleSubmit = () => {
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput('');
      // Pequeno delay para garantir que o estado atualizou e re-foca
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 10);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Recupera o foco quando o componente é reabilitado (após loading)
  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled]);

  return (
    <div className="flex gap-2 items-end">
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Digite sua mensagem... (Shift+Enter para nova linha)"
        className="min-h-[44px] max-h-32 resize-none rounded-2xl bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-blue-500"
        disabled={disabled}
      />
      <Button
        type="submit"
        size="icon"
        onClick={handleSubmit}
        disabled={disabled || !input.trim()}
        className="rounded-full h-10 w-10 shrink-0 bg-blue-600 hover:bg-blue-700"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
};