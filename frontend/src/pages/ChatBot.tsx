import { useEffect, useRef, useState } from 'react';
import { useChat } from '../hooks/useChat';
import { useHistory } from '../hooks/useHistory';
import { ChatMessage } from '../components/chat/ChatMessage';
import { ChatInput } from '../components/chat/ChatInput';
import { TypingIndicator } from '../components/chat/TypingIndicator';
import { ProgressBar } from '../components/chat/ProgressBar';
import { ConversationSidebar } from '../components/chat/ConversationSidebar';
import { PanelLeft } from 'lucide-react';
import { LogoBrain } from '../components/logo/LogoBrain';

// ── Sugestões de boas-vindas ─────────────────────────────────
const SUGGESTIONS = [
  { label: 'Contrato de serviço',    prompt: 'contrato',          desc: 'Prestação de serviços com cláusulas completas' },
  { label: 'Proposta comercial',     prompt: 'proposta comercial', desc: 'Apresentação profissional para clientes' },
  { label: 'Relatório final',        prompt: 'relatório final',    desc: 'Consolidação de resultados e entregas' },
  { label: 'Orçamento detalhado',    prompt: 'orçamento',          desc: 'Precificação com itens e condições' },
];

export function ChatBot() {
  const {
    conversations, isLoading: histLoading,
    refresh, loadConversation, rename, remove,
  } = useHistory();

  const {
    messages, isLoading, latestProgress, conversationId,
    sendUserMessage, downloadPDF, resetConversation, loadFromHistory,
  } = useChat(refresh); // passa refresh: sidebar atualiza quando backend cria nova conversa

  const bottomRef = useRef<HTMLDivElement>(null);
  const [sidebar, setSidebar] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Mantém activeId sincronizado com o conversationId retornado pelo backend
  useEffect(() => {
    if (conversationId) setActiveId(conversationId);
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelect = async (id: string) => {
    if (id === activeId) return;
    const detail = await loadConversation(id);
    if (detail) { loadFromHistory(detail); setActiveId(id); }
  };

  const handleNew = async () => {
    await resetConversation();
    setActiveId(null);
    refresh();
  };

  const showProgress = !!latestProgress && latestProgress.totalGroups > 0;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'hsl(218 20% 8%)' }}>

      {/* ── Sidebar — sempre montada, anima por width ────────── */}
      <ConversationSidebar
        open={sidebar}
        conversations={conversations}
        activeId={activeId}
        isLoading={histLoading}
        onToggle={() => setSidebar(v => !v)}
        onSelect={handleSelect}
        onRename={rename}
        onNewConversation={handleNew}
        onDelete={async (id) => {
          await remove(id);
          if (id === activeId) { await resetConversation(); setActiveId(null); }
        }}
      />

      {/* ── Main column ─────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>

        {/* Header — apenas brand + toggle */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '0 20px', height: '52px', flexShrink: 0,
          background: 'hsl(220 18% 10%)',
          borderBottom: '1px solid hsl(220 14% 16%)',
        }}>
          {/* Toggle que espelha o que está na sidebar */}
          <HeaderIconBtn onClick={() => setSidebar(v => !v)} title="Painel de histórico">
            <PanelLeft size={15} />
          </HeaderIconBtn>

          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
              background: 'linear-gradient(135deg, hsl(250 85% 50%), hsl(215 85% 52%))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 10px hsl(250 85% 50% / 0.30)',
            }}>
              <LogoBrain size={14} className="text-white" />
            </div>
            <div>
              <span className="brand-text" style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '-0.01em' }}>
                BepeAI
              </span>
              <span style={{
                display: 'block', fontSize: '10px', color: 'hsl(215 10% 40%)',
                lineHeight: 1, marginTop: '1px',
              }}>
                Automação documental
              </span>
            </div>
          </div>
        </header>

        {/* Progress */}
        {showProgress && <ProgressBar progress={latestProgress!} />}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
          <div style={{ maxWidth: '680px', margin: '0 auto', padding: '32px 20px 24px' }}>

            {/* ── Welcome / empty state ──────────────────── */}
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '48px' }}>
                {/* Hero icon */}
                <div style={{ position: 'relative', marginBottom: '24px' }}>
                  <div style={{
                    position: 'absolute', inset: '-8px', borderRadius: '24px', opacity: 0.35,
                    background: 'radial-gradient(ellipse, hsl(250 85% 50% / 0.35), transparent 70%)',
                  }} />
                  <div style={{
                    position: 'relative', width: '56px', height: '56px', borderRadius: '16px',
                    background: 'linear-gradient(135deg, hsl(250 85% 50%), hsl(215 85% 52%))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 8px 32px hsl(250 85% 50% / 0.30)',
                  }}>
                    <LogoBrain size={28} className="text-white" />
                  </div>
                </div>

                <h2 style={{
                  fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em',
                  marginBottom: '8px', color: 'hsl(215 18% 88%)',
                }}>
                  Como posso ajudar?
                </h2>
                <p style={{
                  fontSize: '13px', color: 'hsl(215 10% 46%)', textAlign: 'center',
                  maxWidth: '340px', lineHeight: 1.65, marginBottom: '36px',
                }}>
                  Diga qual documento precisa criar. Conduzo a coleta de dados via conversa
                  e entrego o PDF pronto para assinar.
                </p>

                {/* Suggestion cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%', maxWidth: '480px' }}>
                  {SUGGESTIONS.map(s => (
                    <SuggestionCard key={s.prompt} label={s.label} desc={s.desc}
                      onClick={() => sendUserMessage(s.prompt)} />
                  ))}
                </div>

                {/* Credibility bar */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '16px', marginTop: '40px',
                  padding: '10px 20px', borderRadius: '12px',
                  background: 'hsl(220 16% 12%)', border: '1px solid hsl(220 14% 18%)',
                }}>
                  {[
                    { icon: '⚡', text: 'Geração em segundos' },
                    { icon: '🔒', text: 'Dados criptografados' },
                    { icon: '📋', text: 'Válido juridicamente' },
                  ].map(item => (
                    <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px' }}>{item.icon}</span>
                      <span style={{ fontSize: '11px', color: 'hsl(215 10% 46%)' }}>{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map(msg => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onDownloadPDF={
                  msg.sender === 'ai' && msg.tipoDocumento && msg.dadosExtraidos
                    ? downloadPDF : undefined
                }
              />
            ))}

            {isLoading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input area */}
        <div style={{
          flexShrink: 0, padding: '12px 20px 16px',
          background: 'hsl(220 18% 10%)',
          borderTop: '1px solid hsl(220 14% 16%)',
        }}>
          <div style={{ maxWidth: '680px', margin: '0 auto' }}>
            <ChatInput onSend={sendUserMessage} disabled={isLoading} />
            <p style={{
              textAlign: 'center', marginTop: '8px',
              fontSize: '10px', color: 'hsl(215 8% 30%)',
            }}>
              BepeAI pode cometer erros. Revise documentos importantes antes de assinar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function HeaderIconBtn({
  onClick, title, children,
}: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: '30px', height: '30px', borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'hsl(215 10% 44%)', transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'hsl(220 14% 18%)';
        e.currentTarget.style.color = 'hsl(215 12% 66%)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'hsl(215 10% 44%)';
      }}
    >
      {children}
    </button>
  );
}

function SuggestionCard({
  label, desc, onClick,
}: { label: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left', padding: '14px 16px', borderRadius: '14px', cursor: 'pointer',
        background: 'hsl(220 16% 13%)', border: '1px solid hsl(220 14% 20%)',
        transition: 'all 0.18s', display: 'block', width: '100%',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'hsl(220 16% 16%)';
        e.currentTarget.style.borderColor = 'hsl(250 50% 38%)';
        e.currentTarget.style.boxShadow = '0 0 0 1px hsl(250 85% 60% / 0.08), 0 4px 16px hsl(250 85% 10% / 0.3)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'hsl(220 16% 13%)';
        e.currentTarget.style.borderColor = 'hsl(220 14% 20%)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{
        fontSize: '12px', fontWeight: 600, color: 'hsl(215 16% 78%)',
        marginBottom: '4px', letterSpacing: '-0.01em',
      }}>
        {label}
      </div>
      <div style={{ fontSize: '11px', color: 'hsl(215 8% 42%)', lineHeight: 1.5 }}>
        {desc}
      </div>
    </button>
  );
}

export default ChatBot;
