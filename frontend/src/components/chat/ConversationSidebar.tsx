import { useState, useRef, useEffect } from 'react';
import { ConversationSummary } from '../../services/history.service';
import { Pencil, Trash2, Check, X, Loader2, MessageSquare, PenSquare, PanelLeft } from 'lucide-react';

interface Props {
  open: boolean;
  conversations: ConversationSummary[];
  activeId: string | null;
  isLoading: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onNewConversation: () => void;
}

// ── Helpers ───────────────────────────────────────────────────

function relDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min`;
  if (h < 24) return `${h}h`;
  if (d === 1) return 'ontem';
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function groupByDate(list: ConversationSummary[]): [string, ConversationSummary[]][] {
  const today     = new Date().setHours(0, 0, 0, 0);
  const yesterday = today - 86_400_000;
  const weekAgo   = today - 6 * 86_400_000;
  const g: Record<string, ConversationSummary[]> = {
    'Hoje': [], 'Ontem': [], 'Esta semana': [], 'Mais antigo': [],
  };
  for (const c of list) {
    const t = new Date(c.updatedAt).getTime();
    if (t >= today)          g['Hoje'].push(c);
    else if (t >= yesterday) g['Ontem'].push(c);
    else if (t >= weekAgo)   g['Esta semana'].push(c);
    else                     g['Mais antigo'].push(c);
  }
  return Object.entries(g).filter(([, v]) => v.length > 0);
}

// ── Conversation item ─────────────────────────────────────────

interface ItemProps {
  conv: ConversationSummary;
  isActive: boolean;
  onSelect: () => void;
  onRename: (t: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function Item({ conv, isActive, onSelect, onRename, onDelete }: ItemProps) {
  const [editing,  setEditing]  = useState(false);
  const [draft,    setDraft]    = useState('');
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hovered,  setHovered]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing]);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(conv.title ?? '');
    setEditing(true);
  };
  const cancel = (e?: React.MouseEvent) => { e?.stopPropagation(); setEditing(false); };
  const confirm = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const v = draft.trim();
    if (!v || v === conv.title) { setEditing(false); return; }
    setSaving(true);
    try { await onRename(v); } finally { setSaving(false); setEditing(false); }
  };
  const del = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(true);
    try { await onDelete(); } finally { setDeleting(false); }
  };

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '9px 10px', borderRadius: '10px', cursor: 'pointer',
        background: isActive
          ? 'hsl(250 40% 20% / 0.55)'
          : hovered ? 'hsl(220 14% 17%)' : 'transparent',
        border: `1px solid ${isActive ? 'hsl(250 50% 36% / 0.45)' : 'transparent'}`,
        transition: 'background 0.12s, border-color 0.12s',
      }}
    >
      {editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
             onClick={e => e.stopPropagation()}>
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') cancel(); }}
            maxLength={80}
            style={{
              flex: 1, fontSize: '12px', padding: '4px 8px', borderRadius: '7px',
              background: 'hsl(218 20% 9%)',
              border: '1px solid hsl(250 60% 44%)',
              color: 'hsl(215 18% 88%)', outline: 'none',
              boxShadow: '0 0 0 2px hsl(250 85% 60% / 0.12)',
            }}
          />
          <ActionBtn onClick={confirm} disabled={saving}>
            {saving
              ? <Loader2 size={12} style={{ animation: 'spin 0.7s linear infinite' }} />
              : <Check size={12} color="hsl(150 55% 52%)" />}
          </ActionBtn>
          <ActionBtn onClick={cancel}>
            <X size={12} color="hsl(215 10% 46%)" />
          </ActionBtn>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
            <span style={{
              flex: 1, fontSize: '12px', fontWeight: 500, lineHeight: 1.45,
              color: isActive ? 'hsl(215 16% 86%)' : 'hsl(215 10% 60%)',
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {conv.title ?? 'Conversa sem título'}
            </span>
            <div style={{
              display: 'flex', gap: '2px',
              opacity: hovered ? 1 : 0,
              transition: 'opacity 0.12s',
              flexShrink: 0,
            }}>
              <ActionBtn onClick={startEdit} title="Renomear">
                <Pencil size={11} color="hsl(215 10% 48%)" />
              </ActionBtn>
              <ActionBtn
                onClick={del}
                disabled={deleting}
                title="Excluir"
                dangerHover
              >
                {deleting
                  ? <Loader2 size={11} color="hsl(215 10% 48%)" style={{ animation: 'spin 0.7s linear infinite' }} />
                  : <Trash2 size={11} color="hsl(215 10% 48%)" />}
              </ActionBtn>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '5px' }}>
            {/* Status dot */}
            <span style={{
              width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0,
              background: conv.status === 'completed'
                ? 'hsl(150 55% 48%)'
                : 'hsl(250 85% 62%)',
              boxShadow: conv.status !== 'completed' && isActive
                ? '0 0 5px hsl(250 85% 60% / 0.6)'
                : 'none',
            }} />

            {conv.workflowType && (
              <span style={{
                fontSize: '10px', padding: '1px 5px', borderRadius: '4px',
                background: isActive ? 'hsl(250 40% 22%)' : 'hsl(220 14% 18%)',
                border: `1px solid ${isActive ? 'hsl(250 40% 32%)' : 'hsl(220 12% 24%)'}`,
                color: isActive ? 'hsl(250 50% 66%)' : 'hsl(215 8% 42%)',
              }}>
                {conv.workflowType.replace(/_/g, ' ')}
              </span>
            )}

            <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'hsl(215 8% 30%)' }}>
              {conv.turnCount > 0 && (
                <span style={{ marginRight: '5px', color: 'hsl(215 8% 34%)' }}>
                  {conv.turnCount}t
                </span>
              )}
              {relDate(conv.updatedAt)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function ActionBtn({
  onClick, disabled, title, dangerHover, children,
}: {
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  title?: string;
  dangerHover?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: '22px', height: '22px', borderRadius: '6px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0, transition: 'background 0.1s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = dangerHover ? 'hsl(0 40% 18%)' : 'hsl(220 12% 26%)';
      }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

// ── Sidebar ───────────────────────────────────────────────────

export function ConversationSidebar({
  open, conversations, activeId, isLoading,
  onToggle, onSelect, onRename, onDelete, onNewConversation,
}: Props) {
  const groups = groupByDate(conversations);

  return (
    <>
      {/* CSS da animação de width */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        .bepe-sidebar {
          width: 240px;
          overflow: hidden;
          transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                      opacity 0.22s ease;
          opacity: 1;
        }
        .bepe-sidebar.collapsed {
          width: 0;
          opacity: 0;
        }
        /* Conteúdo interno não encolhe — o overflow:hidden faz o clip */
        .bepe-sidebar-inner {
          width: 240px;
          height: 100%;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
        }
      `}</style>

      <aside
        className={`bepe-sidebar${open ? '' : ' collapsed'}`}
        style={{
          background: 'hsl(220 20% 10%)',
          borderRight: '1px solid hsl(220 14% 16%)',
          flexShrink: 0,
          height: '100%',
        }}
      >
        <div className="bepe-sidebar-inner">

          {/* ── Header: toggle + nova conversa ────────────────── */}
          <div style={{
            padding: '10px 10px 10px 12px',
            borderBottom: '1px solid hsl(220 14% 16%)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            {/* Toggle — abre/fecha a sidebar */}
            <SidebarBtn onClick={onToggle} title="Fechar painel" style={{ flexShrink: 0 }}>
              <PanelLeft size={14} />
            </SidebarBtn>

            {/* Nova conversa — ocupa o espaço restante */}
            <button
              onClick={onNewConversation}
              title="Nova conversa"
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '6px', height: '30px', borderRadius: '8px', cursor: 'pointer',
                background: 'hsl(220 14% 16%)',
                border: '1px solid hsl(220 12% 22%)',
                color: 'hsl(215 12% 58%)',
                fontSize: '12px', fontWeight: 500,
                transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'hsl(250 40% 20%)';
                e.currentTarget.style.borderColor = 'hsl(250 50% 36%)';
                e.currentTarget.style.color = 'hsl(250 60% 72%)';
                e.currentTarget.style.boxShadow = '0 0 0 1px hsl(250 85% 60% / 0.10)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'hsl(220 14% 16%)';
                e.currentTarget.style.borderColor = 'hsl(220 12% 22%)';
                e.currentTarget.style.color = 'hsl(215 12% 58%)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <PenSquare size={12} />
              Nova conversa
            </button>
          </div>

          {/* ── List ──────────────────────────────────────────── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
                <Loader2 size={16} style={{
                  color: 'hsl(250 50% 52%)',
                  animation: 'spin 0.7s linear infinite',
                }} />
              </div>
            )}

            {!isLoading && conversations.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px', margin: '0 auto 10px',
                  background: 'hsl(220 16% 16%)', border: '1px solid hsl(220 14% 22%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <MessageSquare size={16} color="hsl(215 8% 34%)" />
                </div>
                <p style={{ fontSize: '11px', color: 'hsl(215 8% 36%)', lineHeight: 1.6 }}>
                  Suas conversas salvas<br />aparecerão aqui.
                </p>
              </div>
            )}

            {!isLoading && groups.map(([label, items]) => (
              <div key={label} style={{ marginBottom: '16px' }}>
                <p style={{
                  fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.1em', color: 'hsl(215 8% 30%)',
                  padding: '0 10px', marginBottom: '4px',
                }}>
                  {label}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  {items.map(c => (
                    <Item
                      key={c.id} conv={c} isActive={c.id === activeId}
                      onSelect={() => onSelect(c.id)}
                      onRename={t => onRename(c.id, t)}
                      onDelete={() => onDelete(c.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ── Footer ────────────────────────────────────────── */}
          <div style={{
            padding: '10px 14px', flexShrink: 0,
            borderTop: '1px solid hsl(220 14% 16%)',
            display: 'flex', alignItems: 'center', gap: '7px',
          }}>
            <div style={{
              width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
              background: 'linear-gradient(135deg, hsl(250 85% 46%), hsl(215 85% 48%))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="2.5" fill="white" opacity="0.9" />
                <circle cx="8" cy="8" r="5.5" stroke="white" strokeWidth="0.8" opacity="0.35" />
              </svg>
            </div>
            <span style={{ fontSize: '11px', color: 'hsl(215 8% 32%)' }}>BepeAI</span>
            <span style={{
              marginLeft: 'auto', fontSize: '10px', padding: '2px 7px', borderRadius: '99px',
              background: 'hsl(250 40% 18%)', border: '1px solid hsl(250 40% 28%)',
              color: 'hsl(250 50% 62%)',
            }}>
              beta
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}

function SidebarBtn({
  onClick, title, style, children,
}: {
  onClick: () => void;
  title: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: '30px', height: '30px', borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'hsl(215 10% 44%)', transition: 'all 0.15s',
        ...style,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'hsl(220 14% 20%)';
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
