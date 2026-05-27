import { ChatMessage } from './ChatMessage';
import { TypingIndicator } from './TypingIndicator';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface ChatWindowProps {
  messages: Message[];
  isLoading: boolean;
}

export const ChatWindow = ({ messages, isLoading }: ChatWindowProps) => {
  return (
    <div className="flex flex-col space-y-4 p-4 max-w-4xl mx-auto">
      {messages.length === 0 && (
        <div className="text-center text-gray-400 py-20">
          <p>👋 Olá! Sou a BepeAI.</p>
          <p className="text-sm">Digite algo como "Criar proposta comercial" para começar.</p>
        </div>
      )}
      {messages.map((message) => (
        <ChatMessage key={message.id} message={message} />
      ))}
      {isLoading && <TypingIndicator />}
    </div>
  );
};
