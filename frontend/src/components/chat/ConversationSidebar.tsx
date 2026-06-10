import { useState, useRef, useEffect } from 'react';
import { ConversationSummary } from '../../services/history.service';
import { Pencil, Trash2, Check, X, Loader2, MessageSquare, PenSquare, PanelLeft, Search } from 'lucide-react';

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
  const date = new Date(iso);
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - 86_400_000;
  const t = date.getTime();

  const hhmm = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  if (t >= todayStart)     return hhmm;
  if (t >= yesterdayStart) return hhmm;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
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
  searchQuery: string;
  onSelect: () => void;
  onRename: (t: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{
        background: 'hsl(250 85% 60% / 0.25)',
        color: 'hsl(250 85% 78%)',
        borderRadius: '2px',
        padding: '0 1px',
      }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function Item({ conv, isActive, searchQuery, onSelect, onRename, onDelete }: ItemProps) {
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

  const title = conv.title ?? 'Conversa sem título';

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '8px 10px', borderRadius: '10px', cursor: 'pointer',
        background: isActive
          ? 'hsl(250 40% 20% / 0.6)'
          : hovered ? 'hsl(220 14% 17%)' : 'transparent',
        border: `1px solid ${isActive ? 'hsl(250 50% 36% / 0.5)' : 'transparent'}`,
        transition: 'background 0.12s, border-color 0.12s',
        position: 'relative',
      }}
    >
      {/* Active left bar */}
      {isActive && (
        <div style={{
          position: 'absolute', left: 0, top: '20%', bottom: '20%',
          width: '2px', borderRadius: '0 2px 2px 0',
          background: 'hsl(250 85% 62%)',
        }} />
      )}

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
              {highlightMatch(title, searchQuery)}
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
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
                maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {conv.workflowType.replace(/_/g, ' ')}
              </span>
            )}

            <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'hsl(215 8% 30%)', whiteSpace: 'nowrap' }}>
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
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = search.trim()
    ? conversations.filter(c =>
        (c.title ?? 'Conversa sem título').toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  const groups = groupByDate(filtered);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes sidebarItemIn {
          from { opacity: 0; transform: translateX(-4px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        .bepe-sidebar {
          width: 240px;
          overflow: hidden;
          transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                      opacity 0.22s ease;
          opacity: 1;
          flex-shrink: 0;
        }
        .bepe-sidebar.collapsed {
          width: 0 !important;
          opacity: 0;
          border-right: none !important;
          pointer-events: none;
        }
        .bepe-sidebar-inner {
          width: 240px;
          height: 100%;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          min-width: 240px;
        }

        /* Mobile: sidebar flutua sobre o conteúdo em vez de empurrar */
        @media (max-width: 640px) {
          .bepe-sidebar {
            position: fixed;
            left: 0;
            top: 0;
            bottom: 0;
            z-index: 50;
            width: 240px !important;
            transform: translateX(0);
            transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                        opacity 0.22s ease;
          }
          .bepe-sidebar.collapsed {
            transform: translateX(-100%);
            width: 240px !important;
            opacity: 0;
            border-right: 1px solid hsl(220 14% 16%) !important;
          }
          .bepe-sidebar-backdrop {
            display: block;
          }
        }
        .bepe-sidebar-backdrop {
          display: none;
          position: fixed;
          inset: 0;
          z-index: 49;
          background: hsl(220 20% 5% / 0.6);
          backdrop-filter: blur(2px);
        }
        .bepe-search-input::placeholder { color: hsl(215 8% 36%); }
        .bepe-search-input:focus { outline: none; }
        .bepe-new-conv-btn:hover {
          background: hsl(250 40% 20%) !important;
          border-color: hsl(250 50% 36%) !important;
          color: hsl(250 60% 72%) !important;
        }
        .bepe-sidebar-list {
          scrollbar-width: thin;
          scrollbar-color: hsl(220 12% 22%) transparent;
        }
        .bepe-sidebar-list::-webkit-scrollbar { width: 3px; }
        .bepe-sidebar-list::-webkit-scrollbar-thumb { background: hsl(220 12% 22%); border-radius: 99px; }
      `}</style>

      {/* Backdrop mobile — toque fora fecha a sidebar */}
      {open && (
        <div
          className="bepe-sidebar-backdrop"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}

      <aside
        className={`bepe-sidebar${open ? '' : ' collapsed'}`}
        style={{
          background: 'hsl(220 20% 10%)',
          borderRight: '1px solid hsl(220 14% 16%)',
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
            <SidebarBtn onClick={onToggle} title="Fechar painel" style={{ flexShrink: 0 }}>
              <PanelLeft size={14} />
            </SidebarBtn>

            <button
              onClick={onNewConversation}
              title="Nova conversa"
              className="bepe-new-conv-btn"
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '6px', height: '30px', borderRadius: '8px', cursor: 'pointer',
                background: 'hsl(220 14% 16%)',
                border: '1px solid hsl(220 12% 22%)',
                color: 'hsl(215 12% 58%)',
                fontSize: '12px', fontWeight: 500,
                transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden',
              }}
            >
              <PenSquare size={12} />
              Nova conversa
            </button>
          </div>

          {/* ── Search ────────────────────────────────────────── */}
          <div style={{ padding: '8px 10px 6px', flexShrink: 0 }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '5px 10px', borderRadius: '8px',
                background: 'hsl(220 16% 14%)',
                border: `1px solid ${search ? 'hsl(250 50% 34%)' : 'hsl(220 12% 20%)'}`,
                transition: 'border-color 0.15s', cursor: 'text',
              }}
              onClick={() => searchRef.current?.focus()}
            >
              <Search size={11} color="hsl(215 8% 36%)" style={{ flexShrink: 0 }} />
              <input
                ref={searchRef}
                className="bepe-search-input"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar conversas..."
                style={{
                  flex: 1, fontSize: '11px', background: 'transparent',
                  border: 'none', color: 'hsl(215 12% 70%)', padding: 0,
                }}
              />
              {search && (
                <button
                  onClick={e => { e.stopPropagation(); setSearch(''); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', padding: 0,
                  }}
                >
                  <X size={11} color="hsl(215 8% 40%)" />
                </button>
              )}
            </div>
          </div>

          {/* ── List ──────────────────────────────────────────── */}
          <div className="bepe-sidebar-list" style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 8px' }}>
            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
                <Loader2 size={16} style={{
                  color: 'hsl(250 50% 52%)',
                  animation: 'spin 0.7s linear infinite',
                }} />
              </div>
            )}

            {!isLoading && conversations.length === 0 && (
              <div style={{ textAlign: 'center', padding: '36px 16px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px', margin: '0 auto 10px',
                  background: 'hsl(220 16% 16%)', border: '1px solid hsl(220 14% 22%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <MessageSquare size={16} color="hsl(215 8% 34%)" />
                </div>
                <p style={{ fontSize: '11px', color: 'hsl(215 8% 36%)', lineHeight: 1.6, margin: 0 }}>
                  Suas conversas salvas<br />aparecerão aqui.
                </p>
              </div>
            )}

            {!isLoading && conversations.length > 0 && filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '28px 16px' }}>
                <p style={{ fontSize: '11px', color: 'hsl(215 8% 36%)', lineHeight: 1.6, margin: 0 }}>
                  Nenhuma conversa encontrada<br />
                  para "<strong style={{ color: 'hsl(215 8% 50%)' }}>{search}</strong>"
                </p>
              </div>
            )}

            {!isLoading && groups.map(([label, items]) => (
              <div key={label} style={{ marginBottom: '14px' }}>
                <p style={{
                  fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.1em', color: 'hsl(215 8% 28%)',
                  padding: '0 10px', marginBottom: '3px', marginTop: 0,
                }}>
                  {label}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  {items.map(c => (
                    <Item
                      key={c.id} conv={c} isActive={c.id === activeId}
                      searchQuery={search}
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
