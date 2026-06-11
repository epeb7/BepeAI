import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../hooks/useChat';
import { useHistory } from '../hooks/useHistory';
import { useToast } from '../hooks/useToast';
import { ChatMessage } from '../components/chat/ChatMessage';
import { ChatInput } from '../components/chat/ChatInput';
import { TypingIndicator } from '../components/chat/TypingIndicator';
import { ProgressBar } from '../components/chat/ProgressBar';
import { ConversationSidebar } from '../components/chat/ConversationSidebar';
import { ToastContainer } from '../components/ui/ToastContainer';
import { PanelLeft, LogOut, PenSquare, Settings, UserCircle } from 'lucide-react';
import { LogoBrain } from '../components/logo/LogoBrain';
import { authService } from '../services/auth.service';
import { userService, UserProfile } from '../services/user.service';
import { isAdminToken } from '../lib/utils';

// ── Sugestões de boas-vindas ─────────────────────────────────
const SUGGESTIONS = [
  { label: 'Contrato de serviço',    prompt: 'contrato',          desc: 'Prestação de serviços com cláusulas completas' },
  { label: 'Proposta comercial',     prompt: 'proposta comercial', desc: 'Apresentação profissional para clientes' },
  { label: 'Orçamento detalhado',    prompt: 'orçamento',          desc: 'Precificação com itens e condições comerciais' },
  { label: 'Relatório final',        prompt: 'relatório final',    desc: 'Consolidação de resultados e entregas' },
  { label: 'Acordo de sigilo (NDA)', prompt: 'NDA',                desc: 'Confidencialidade entre empresas ou sócios' },
];

export function ChatBot() {
  const [tenantProfile, setTenantProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    userService.getProfile().then(setTenantProfile).catch(() => {});
  }, []);

  const {
    conversations, isLoading: histLoading,
    refresh, loadConversation, rename, remove,
  } = useHistory();

  const {
    messages, isLoading, latestProgress, conversationId,
    sendUserMessage, downloadPDF, resetConversation, loadFromHistory,
    adoptConversationId,
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
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .chat-area-fade {
          animation: chatFadeIn 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .chat-area-fading {
          opacity: 0;
          transform: translateY(-4px);
          transition: opacity 0.12s ease, transform 0.12s ease;
          pointer-events: none;
        }
        .bepe-scroll-area {
          scrollbar-width: thin;
          scrollbar-color: hsl(220 12% 20%) transparent;
        }
        .bepe-scroll-area::-webkit-scrollbar { width: 4px; }
        .bepe-scroll-area::-webkit-scrollbar-thumb {
          background: hsl(220 12% 22%);
          border-radius: 99px;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
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

          {/* Header — minimalista estilo Claude */}
          <header style={{
            display: 'flex', alignItems: 'center',
            padding: '0 14px', height: '50px', flexShrink: 0,
            background: 'hsl(218 20% 8%)',
            borderBottom: '1px solid hsl(220 14% 13%)',
          }}>
            <HeaderIconBtn onClick={() => setSidebar(v => !v)} title="Histórico de conversas">
              <PanelLeft size={16} />
            </HeaderIconBtn>

            {!sidebar && (
              <HeaderIconBtn onClick={handleNew} title="Nova conversa (Ctrl+Shift+O)">
                <PenSquare size={15} />
              </HeaderIconBtn>
            )}

            {/* Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '6px', flex: 1 }}>
              <div style={{
                width: '26px', height: '26px', borderRadius: '8px', flexShrink: 0,
                background: 'linear-gradient(135deg, hsl(250 85% 52%), hsl(215 85% 54%))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px hsl(250 85% 50% / 0.28)',
              }}>
                <LogoBrain size={13} className="text-white" />
              </div>
              <span className="brand-text" style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '-0.02em' }}>
                BepeAI
              </span>
            </div>

            <TenantBadge profile={tenantProfile} />
            <ProfileButton />
            <AdminLink />
            <LogoutButton />
          </header>

          {/* Progress */}
          {showProgress && <ProgressBar progress={latestProgress!} />}

          {/* Messages */}
          <div className="bepe-scroll-area" style={{ flex: 1, overflowY: 'auto' }}>
            <div
              key={fadeKey}
              className={fading ? 'chat-area-fading' : 'chat-area-fade'}
              style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 24px 32px' }}
            >
              {/* ── Welcome / empty state ──────────────────── */}
              {messages.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '40px' }}>
                  <div style={{ position: 'relative', marginBottom: '28px' }}>
                    <div style={{
                      position: 'absolute', inset: '-20px', borderRadius: '50%',
                      background: 'radial-gradient(ellipse, hsl(250 85% 50% / 0.10), transparent 70%)',
                    }} />
                    <div style={{
                      position: 'relative', width: '64px', height: '64px', borderRadius: '50%',
                      background: 'linear-gradient(135deg, hsl(250 85% 50%), hsl(215 85% 54%))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 8px 40px hsl(250 85% 50% / 0.28)',
                    }}>
                      <LogoBrain size={32} className="text-white" />
                    </div>
                  </div>

                  <h2 style={{
                    fontSize: '22px', fontWeight: 700, letterSpacing: '-0.025em',
                    marginBottom: '10px', color: 'hsl(215 18% 90%)', textAlign: 'center',
                  }}>
                    Olá! Como posso ajudar?
                  </h2>
                  <p style={{
                    fontSize: '14px', color: 'hsl(215 10% 48%)', textAlign: 'center',
                    maxWidth: '380px', lineHeight: 1.7, marginBottom: '40px',
                  }}>
                    Crio contratos, propostas, relatórios e outros documentos profissionais
                    via conversa — entrego o PDF pronto para assinar.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', width: '100%', maxWidth: '520px' }}>
                    {SUGGESTIONS.map((s, idx) => (
                      <SuggestionCard
                        key={s.prompt} label={s.label} desc={s.desc}
                        onClick={() => sendUserMessage(s.prompt)}
                        style={idx === SUGGESTIONS.length - 1 && SUGGESTIONS.length % 2 !== 0
                          ? { gridColumn: '1 / -1' } : undefined}
                      />
                    ))}
                  </div>

                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '20px', marginTop: '44px',
                    flexWrap: 'wrap', justifyContent: 'center',
                  }}>
                    {[
                      { icon: '⚡', text: 'Geração em segundos' },
                      { icon: '🔒', text: 'Dados criptografados' },
                      { icon: '📋', text: 'Válido juridicamente' },
                    ].map(item => (
                      <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px' }}>{item.icon}</span>
                        <span style={{ fontSize: '12px', color: 'hsl(215 10% 40%)' }}>{item.text}</span>
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

          {/* Input area — flutuante estilo Claude */}
          <div style={{
            flexShrink: 0,
            padding: '8px 24px 18px',
            background: 'hsl(218 20% 8%)',
            borderTop: '1px solid hsl(220 14% 13%)',
          }}>
            <div style={{ maxWidth: '720px', margin: '0 auto' }}>
              <ChatInput
                onSend={sendUserMessage}
                disabled={isLoading}
                workflowActive={workflowActive}
                workflowComplete={workflowComplete}
                conversationId={conversationId}
                onConversationCreated={adoptConversationId}
              />
              <p style={{
                textAlign: 'center', marginTop: '8px',
                fontSize: '10.5px', color: 'hsl(215 8% 26%)',
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

// Exibe logo ou nome da empresa no header — apenas quando o usuário tem configuração de tenant
function TenantBadge({ profile }: { profile: UserProfile | null }) {
  if (!profile) return null;
  if (!profile.logo_base64 && !profile.company_name) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '4px 10px', borderRadius: '8px', marginRight: '4px',
      background: 'hsl(220 18% 12%)',
      border: '1px solid hsl(220 14% 18%)',
      maxWidth: '160px', overflow: 'hidden',
    }}>
      {profile.logo_base64 ? (
        <img
          src={profile.logo_base64}
          alt="Logo"
          style={{ height: '22px', maxWidth: '120px', objectFit: 'contain', flexShrink: 0 }}
        />
      ) : (
        <span style={{
          fontSize: '11.5px', fontWeight: 600, color: 'hsl(215 14% 72%)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {profile.company_name}
        </span>
      )}
    </div>
  );
}

function ProfileButton() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate('/profile')}
      title="Meu perfil"
      style={{
        width: '30px', height: '30px', borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'hsl(215 10% 44%)', transition: 'all 0.15s',
        marginRight: '2px',
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
      <UserCircle size={16} />
    </button>
  );
}

function AdminLink() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  if (!isAdminToken(token)) return null;

  return (
    <button
      onClick={() => navigate('/admin')}
      title="Painel de administração"
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '5px 10px', borderRadius: '8px', cursor: 'pointer',
        background: 'transparent', border: '1px solid transparent',
        color: 'hsl(250 60% 60%)', fontSize: '12px', fontWeight: 500,
        transition: 'all 0.15s', marginRight: '2px',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'hsl(250 60% 18% / 0.5)';
        e.currentTarget.style.borderColor = 'hsl(250 40% 30%)';
        e.currentTarget.style.color = 'hsl(250 70% 72%)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = 'transparent';
        e.currentTarget.style.color = 'hsl(250 60% 60%)';
      }}
    >
      <Settings size={13} />
      Admin
    </button>
  );
}

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
        background: 'hsl(220 18% 11%)',
        border: '1px solid hsl(220 14% 18%)',
        transition: 'all 0.18s', display: 'block', width: '100%',
        ...style,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'hsl(220 18% 14%)';
        e.currentTarget.style.borderColor = 'hsl(250 50% 36%)';
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 4px 20px hsl(250 85% 10% / 0.4)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'hsl(220 18% 11%)';
        e.currentTarget.style.borderColor = 'hsl(220 14% 18%)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{
        fontSize: '12.5px', fontWeight: 600, color: 'hsl(215 16% 80%)',
        marginBottom: '5px', letterSpacing: '-0.01em',
      }}>
        {label}
      </div>
      <div style={{ fontSize: '11.5px', color: 'hsl(215 8% 40%)', lineHeight: 1.55 }}>
        {desc}
      </div>
    </button>
  );
}

export default ChatBot;
