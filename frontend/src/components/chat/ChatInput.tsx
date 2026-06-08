import { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

export const ChatInput = ({ onSend, disabled }: ChatInputProps) => {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = !!input.trim() && !disabled;

  const handleSubmit = () => {
    if (!canSend) return;
    onSend(input.trim());
    setInput('');
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; }
    setTimeout(() => textareaRef.current?.focus(), 10);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 148) + 'px';
  };

  useEffect(() => {
    if (!disabled) textareaRef.current?.focus();
  }, [disabled]);

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: '8px',
      padding: '10px 12px 10px 16px', borderRadius: '16px',
      background: 'hsl(220 16% 13%)',
      border: `1px solid ${focused ? 'hsl(250 60% 44%)' : 'hsl(220 14% 20%)'}`,
      boxShadow: focused ? '0 0 0 3px hsl(250 85% 60% / 0.10)' : 'none',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}>
      <textarea
        ref={textareaRef}
        value={input}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Escreva uma mensagem…"
        disabled={disabled}
        rows={1}
        style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          resize: 'none', fontFamily: 'inherit', fontSize: '13.5px', lineHeight: 1.6,
          color: 'hsl(215 16% 82%)', minHeight: '22px', maxHeight: '148px',
          opacity: disabled ? 0.5 : 1,
        }}
      />

      <button
        onClick={handleSubmit}
        disabled={!canSend}
        style={{
          width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
          border: 'none', cursor: canSend ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: canSend
            ? 'linear-gradient(135deg, hsl(250 85% 55%), hsl(215 85% 52%))'
            : 'hsl(220 14% 20%)',
          boxShadow: canSend ? '0 2px 10px hsl(250 85% 50% / 0.30)' : 'none',
          transition: 'all 0.15s',
          transform: canSend ? 'scale(1)' : 'scale(0.92)',
          opacity: canSend ? 1 : 0.4,
        }}
      >
        <ArrowUp size={14} color="white" />
      </button>
    </div>
  );
};
