import { useCallback, useEffect, useRef, useState } from 'react';
import { useChat } from '../hooks/useChat';
import { useHistory } from '../hooks/useHistory';
import { useToast } from '../hooks/useToast';
import { ChatMessage } from '../components/chat/ChatMessage';
import { ChatInput } from '../components/chat/ChatInput';
import { TypingIndicator } from '../components/chat/TypingIndicator';
import { ProgressBar } from '../components/chat/ProgressBar';
import { ConversationSidebar } from '../components/chat/ConversationSidebar';
import { ToastContainer } from '../components/ui/ToastContainer';
import { PanelLeft, LogOut, PenSquare } from 'lucide-react';
import { LogoBrain } from '../components/logo/LogoBrain';
import { authService } from '../services/auth.service';

// ── Sugestões de boas-vindas ─────────────────────────────────
const SUGGESTIONS = [
  { label: 'Contrato de serviço',    prompt: 'contrato',          desc: 'Prestação de serviços com cláusulas completas' },
  { label: 'Proposta comercial',     prompt: 'proposta comercial', desc: 'Apresentação profissional para clientes' },
  { label: 'Orçamento detalhado',    prompt: 'orçamento',          desc: 'Precificação com itens e condições comerciais' },
  { label: 'Relatório final',        prompt: 'relatório final',    desc: 'Consolidação de resultados e entregas' },
  { label: 'Acordo de sigilo (NDA)', prompt: 'NDA',                desc: 'Confidencialidade entre empresas ou sócios' },
];

export function ChatBot() {
  const {
    conversations, isLoading: histLoading,
    refresh, loadConversation, rename, remove,
  } = useHistory();

  const {
    messages, isLoading, latestProgress, conversationId,
    sendUserMessage, downloadPDF, resetConversation, loadFromHistory,
  } = useChat(refresh);

  const { toasts, toast, dismiss } = useToast();

  const bottomRef     = useRef<HTMLDivElement>(null);
  const [sidebar, setSidebar]   = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Controls the fade-transition when switching/creating conversations
  const [fadeKey, setFadeKey]   = useState(0);
  const [fading, setFading]     = useState(false);

  useEffect(() => {
    if (conversationId) setActiveId(conversationId);
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Keyboard shortcut: Ctrl+Shift+O → new conversation (same as Claude)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'O') {
        e.preventDefault();
        handleNew();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const withTransition = useCallback(async (fn: () => Promise<void>) => {
    setFading(true);
    await new Promise(r => setTimeout(r, 120));
    await fn();
    setFadeKey(k => k + 1);
    setFading(false);
  }, []);

  const handleSelect = async (id: string) => {
    if (id === activeId) return;
    await withTransition(async () => {
      const detail = await loadConversation(id);
      if (detail) { loadFromHistory(detail); setActiveId(id); }
    });
  };

  const handleNew = useCallback(async () => {
    if (messages.length === 0 && !activeId) return; // already on empty screen
    await withTransition(async () => {
      await resetConversation();
      setActiveId(null);
      refresh();
    });
  }, [messages.length, activeId, withTransition, resetConversation, refresh]);

  const handleDownloadPDF = async (dados: Record<string, string>, tipo: string) => {
    try {
      await downloadPDF(dados, tipo);
      toast.success('PDF gerado com sucesso!');
    } catch {
      toast.error('Erro ao gerar PDF. Tente novamente.');
      throw new Error('pdf-error');
    }
  };

  const showProgress     = !!latestProgress && latestProgress.totalGroups > 0;
  const workflowActive   = messages.some(m => m.sender === 'ai') && !!latestProgress && !latestProgress.isComplete;
  const workflowComplete = !!latestProgress?.isComplete;

  return (
    <>
      <style>{`
        @keyframes chatFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .chat-area-fade {
          animation: chatFadeIn 0.2s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .chat-area-fading {
          opacity: 0;
          transform: translateY(-4px);
          transition: opacity 0.12s ease, transform 0.12s ease;
          pointer-events: none;
        }
        .bepe-new-btn-header:hover {
          background: hsl(250 40% 20%) !important;
          border-color: hsl(250 50% 36%) !important;
          color: hsl(250 60% 72%) !important;
        }
      `}</style>

      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'hsl(218 20% 8%)' }}>

        {/* ── Sidebar ──────────────────────────────────────────── */}
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
            if (id === activeId) {
              await withTransition(async () => {
                await resetConversation();
                setActiveId(null);
              });
            }
          }}
        />

        {/* ── Main column ─────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>

          {/* Header */}
          <header style={{
            display: 'flex', alignItems: 'center',
            padding: '0 16px 0 20px', height: '52px', flexShrink: 0,
            background: 'hsl(220 18% 10%)',
            borderBottom: '1px solid hsl(220 14% 16%)',
          }}>
            {/* Toggle sidebar */}
            <HeaderIconBtn onClick={() => setSidebar(v => !v)} title="Histórico de conversas">
              <PanelLeft size={15} />
            </HeaderIconBtn>

            {/* Nova conversa — só visível quando sidebar fechada */}
            {!sidebar && (
              <HeaderIconBtn onClick={handleNew} title="Nova conversa (Ctrl+Shift+O)">
                <PenSquare size={14} />
              </HeaderIconBtn>
            )}

            {/* Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginLeft: '8px', flex: 1 }}>
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
                <span style={{ display: 'block', fontSize: '10px', color: 'hsl(215 10% 40%)', lineHeight: 1, marginTop: '1px' }}>
                  Automação documental
                </span>
              </div>
            </div>

            {/* Logout */}
            <LogoutButton />
          </header>

          {/* Progress */}
          {showProgress && <ProgressBar progress={latestProgress!} />}

          {/* Messages — animated on conversation switch */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
            <div
              key={fadeKey}
              className={fading ? 'chat-area-fading' : 'chat-area-fade'}
              style={{ maxWidth: '680px', margin: '0 auto', padding: '32px 20px 24px' }}
            >
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
                    {SUGGESTIONS.map((s, idx) => (
                      <SuggestionCard
                        key={s.prompt} label={s.label} desc={s.desc}
                        onClick={() => sendUserMessage(s.prompt)}
                        style={idx === SUGGESTIONS.length - 1 && SUGGESTIONS.length % 2 !== 0
                          ? { gridColumn: '1 / -1' } : undefined}
                      />
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
                      ? handleDownloadPDF : undefined
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
              <ChatInput
                onSend={sendUserMessage}
                disabled={isLoading}
                workflowActive={workflowActive}
                workflowComplete={workflowComplete}
              />
              <p style={{
                textAlign: 'center', marginTop: '8px',
                fontSize: '10px', color: 'hsl(215 8% 30%)',
              }}>
                BepeAI pode cometer erros. Revise documentos importantes antes de assinar.
              </p>
            </div>
          </div>
        </div>

        {/* ── Toast notifications ──────────────────────────────── */}
        <ToastContainer toasts={toasts} onDismiss={dismiss} />
      </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────

function LogoutButton() {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading]       = useState(false);

  const handleClick = () => {
    if (!confirming) { setConfirming(true); return; }
    setLoading(true);
    authService.logout().finally(() => setLoading(false));
  };

  const handleBlur = () => {
    setTimeout(() => setConfirming(false), 200);
  };

  return (
    <button
      onClick={handleClick}
      onBlur={handleBlur}
      disabled={loading}
      title={confirming ? 'Clique para confirmar saída' : 'Sair da plataforma'}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '5px 10px', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer',
        background: confirming ? 'hsl(0 40% 18%)' : 'transparent',
        border: `1px solid ${confirming ? 'hsl(0 50% 30%)' : 'transparent'}`,
        color: confirming ? 'hsl(0 68% 65%)' : 'hsl(215 10% 44%)',
        fontSize: '12px', fontWeight: 500,
        transition: 'all 0.15s',
        opacity: loading ? 0.6 : 1,
      }}
      onMouseEnter={e => {
        if (confirming) return;
        e.currentTarget.style.background = 'hsl(220 14% 18%)';
        e.currentTarget.style.color = 'hsl(215 12% 62%)';
      }}
      onMouseLeave={e => {
        if (confirming) return;
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'hsl(215 10% 44%)';
      }}
    >
      <LogOut size={13} />
      {confirming ? 'Confirmar saída?' : 'Sair'}
    </button>
  );
}

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
  label, desc, onClick, style,
}: { label: string; desc: string; onClick: () => void; style?: React.CSSProperties }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left', padding: '14px 16px', borderRadius: '14px', cursor: 'pointer',
        background: 'hsl(220 16% 13%)', border: '1px solid hsl(220 14% 20%)',
        transition: 'all 0.18s', display: 'block', width: '100%',
        ...style,
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
