import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService, InviteToken } from '../services/admin.service';
import {
  AuthShell, FormField, AuthInput, ErrorBanner, LoadingLabel,
  cardStyle, submitBtnStyle, baseInputStyle,
} from './Login';

interface AdminProps {
  onLogout?: () => void;
}

export function Admin({ onLogout }: AdminProps) {
  const navigate = useNavigate();

  const [invites, setInvites]           = useState<InviteToken[]>([]);
  const [listLoading, setListLoading]   = useState(true);
  const [listError, setListError]       = useState('');

  const [email, setEmail]               = useState('');
  const [note, setNote]                 = useState('');
  const [expiresIn, setExpiresIn]       = useState('7');
  const [creating, setCreating]         = useState(false);
  const [createError, setCreateError]   = useState('');
  const [newLink, setNewLink]           = useState('');
  const [copied, setCopied]             = useState(false);

  const [expanded, setExpanded]         = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const data = await adminService.listInvites();
      setInvites(data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) { navigate('/dashboard'); return; }
      setListError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Erro ao carregar convites'
      );
    } finally {
      setListLoading(false);
    }
  }, [navigate]);

  useEffect(() => { loadInvites(); }, [loadInvites]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    setNewLink('');
    setCopied(false);
    try {
      const result = await adminService.createInvite({
        email:     email.trim() || undefined,
        expiresIn: parseInt(expiresIn, 10) || 7,
        note:      note.trim() || undefined,
      });
      setNewLink(result.registerUrl);
      setEmail('');
      setNote('');
      loadInvites();
    } catch (err: unknown) {
      setCreateError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Erro ao gerar convite'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(newLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* noop */ }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const isExpired = (iso: string) => new Date(iso) < new Date();

  const statusOf = (inv: InviteToken) =>
    inv.used_at ? 'usado' : isExpired(inv.expires_at) ? 'expirado' : 'ativo';

  const STATUS_COLOR: Record<string, string> = {
    usado:    'hsl(215 10% 40%)',
    expirado: 'hsl(0 68% 58%)',
    ativo:    'hsl(150 55% 52%)',
  };

  const UA_SHORT = (ua: string | null) => {
    if (!ua) return '—';
    if (/iPhone|iPad/i.test(ua)) return 'iOS';
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Mac OS/i.test(ua)) return 'macOS';
    if (/Linux/i.test(ua)) return 'Linux';
    return ua.slice(0, 40);
  };

  return (
    <AuthShell subtitle="Painel de administração">
      <div style={{ ...cardStyle, maxWidth: '500px', width: '100%' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'hsl(215 18% 90%)' }}>
              Convites de acesso
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'hsl(215 10% 44%)' }}>
              Links únicos para novos usuários criarem conta
            </p>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'none', border: '1.5px solid hsl(220 14% 22%)',
              borderRadius: '10px', padding: '7px 14px',
              fontSize: '13px', color: 'hsl(215 10% 52%)', cursor: 'pointer',
            }}
          >
            ← Voltar
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          <FormField label="E-mail do destinatário (opcional)"
            hint="Deixe vazio para um convite aberto — qualquer pessoa com o link pode se cadastrar.">
            <AuthInput
              type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="destinatario@empresa.com"
              disabled={creating} autoComplete="off"
            />
          </FormField>

          <FormField label="Observação (opcional)"
            hint="Identifica para quem/para que este convite foi criado. Visível só para admins.">
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder='ex: "Cliente Acme Corp — reunião 12/06"'
              maxLength={200}
              disabled={creating}
              style={{ ...baseInputStyle }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'hsl(250 85% 58%)';
                e.currentTarget.style.boxShadow   = '0 0 0 3px hsl(250 85% 60% / 0.15)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'hsl(220 14% 21%)';
                e.currentTarget.style.boxShadow   = 'none';
              }}
            />
          </FormField>

          <FormField label="Validade">
            <div style={{ display: 'flex', gap: '8px' }}>
              {[['1', '1 dia'], ['7', '7 dias'], ['14', '14 dias'], ['30', '30 dias']].map(([val, label]) => (
                <button key={val} type="button" onClick={() => setExpiresIn(val)} style={{
                  flex: 1, padding: '10px 0', borderRadius: '10px', fontSize: '13px', fontWeight: 500,
                  border: '1.5px solid',
                  borderColor: expiresIn === val ? 'hsl(250 85% 58%)' : 'hsl(220 14% 21%)',
                  background:  expiresIn === val ? 'hsl(250 60% 20% / 0.6)' : 'hsl(218 20% 10%)',
                  color:       expiresIn === val ? 'hsl(250 85% 72%)' : 'hsl(215 10% 52%)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  {label}
                </button>
              ))}
            </div>
          </FormField>

          {createError && <ErrorBanner message={createError} />}

          <button type="submit" disabled={creating} className="btn-brand" style={submitBtnStyle(creating)}>
            {creating ? <LoadingLabel label="Gerando link…" /> : 'Gerar link de convite'}
          </button>
        </form>

        {/* Link gerado */}
        {newLink && (
          <div style={{
            marginTop: '16px', padding: '14px 16px', borderRadius: '12px',
            background: 'hsl(150 55% 12% / 0.5)',
            border: '1.5px solid hsl(150 55% 30% / 0.4)',
          }}>
            <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 600, color: 'hsl(150 55% 60%)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Link gerado — compartilhe com o destinatário
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input readOnly value={newLink} style={{
                flex: 1, padding: '9px 12px', borderRadius: '9px', fontSize: '12px',
                background: 'hsl(218 20% 9%)', border: '1px solid hsl(220 14% 20%)',
                color: 'hsl(215 18% 72%)', outline: 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} onClick={e => (e.target as HTMLInputElement).select()} />
              <button onClick={handleCopy} style={{
                padding: '9px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: 600,
                border: '1.5px solid',
                borderColor: copied ? 'hsl(150 55% 40%)' : 'hsl(220 14% 24%)',
                background:  copied ? 'hsl(150 55% 15% / 0.6)' : 'hsl(220 18% 14%)',
                color:       copied ? 'hsl(150 55% 60%)' : 'hsl(215 10% 68%)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {copied ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        )}

        {/* Divisor */}
        <div style={{ margin: '24px 0 20px', borderTop: '1px solid hsl(220 14% 18%)' }} />

        {/* Lista */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'hsl(215 10% 52%)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Convites ({invites.length})
          </h3>
          <button onClick={loadInvites} style={{
            background: 'none', border: 'none', fontSize: '12px', color: 'hsl(250 60% 60%)',
            cursor: 'pointer', padding: '4px 8px', borderRadius: '6px',
          }}>
            Atualizar
          </button>
        </div>

        {listLoading ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'hsl(215 10% 44%)', fontSize: '13px' }}>
            Carregando…
          </div>
        ) : listError ? (
          <ErrorBanner message={listError} />
        ) : invites.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'hsl(215 10% 40%)', fontSize: '13px', padding: '16px 0', margin: 0 }}>
            Nenhum convite gerado ainda.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
            {invites.map(inv => {
              const status = statusOf(inv);
              const isOpen = expanded === inv.id;

              return (
                <div key={inv.id} style={{
                  borderRadius: '12px',
                  background: 'hsl(218 20% 10%)',
                  border: `1px solid ${status === 'ativo' ? 'hsl(220 14% 22%)' : 'hsl(220 14% 17%)'}`,
                  opacity: status === 'usado' ? 0.7 : 1,
                  overflow: 'hidden',
                }}>
                  {/* Linha principal — clicável para expandir */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : inv.id)}
                    style={{
                      width: '100%', padding: '12px 14px', background: 'none', border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', color: 'hsl(215 18% 82%)', fontWeight: 500 }}>
                          {inv.email ?? <span style={{ color: 'hsl(215 10% 44%)', fontStyle: 'italic', fontWeight: 400 }}>Aberto</span>}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: STATUS_COLOR[status], textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {status}
                        </span>
                        {inv.view_count > 0 && (
                          <span style={{ fontSize: '11px', color: 'hsl(215 10% 40%)', background: 'hsl(220 14% 16%)', borderRadius: '5px', padding: '1px 6px' }}>
                            👁 {inv.view_count}×
                          </span>
                        )}
                      </div>
                      {inv.note && (
                        <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'hsl(215 10% 44%)', lineHeight: 1.4 }}>
                          {inv.note}
                        </p>
                      )}
                    </div>
                    <span style={{ fontSize: '11px', color: 'hsl(215 10% 36%)', flexShrink: 0 }}>
                      {isOpen ? '▲' : '▼'}
                    </span>
                  </button>

                  {/* Detalhe expandido */}
                  {isOpen && (
                    <div style={{
                      padding: '0 14px 14px',
                      borderTop: '1px solid hsl(220 14% 16%)',
                      display: 'flex', flexDirection: 'column', gap: '10px',
                    }}>
                      <DetailGrid rows={[
                        ['Criado em',    fmt(inv.created_at)],
                        ['Expira em',    fmt(inv.expires_at)],
                        ['Visualizações', String(inv.view_count)],
                        ['Último acesso', inv.last_viewed_at ? fmt(inv.last_viewed_at) : '—'],
                      ]} />

                      {inv.used_at && (
                        <>
                          <p style={{ margin: '6px 0 4px', fontSize: '11px', fontWeight: 600, color: 'hsl(215 10% 44%)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Usado por
                          </p>
                          <DetailGrid rows={[
                            ['Nome',       inv.used_by_name  ?? '—'],
                            ['E-mail',     inv.used_by_email ?? '—'],
                            ['ID usuário', inv.used_by       ?? '—'],
                            ['IP',         inv.used_ip       ?? '—'],
                            ['Dispositivo', UA_SHORT(inv.used_user_agent)],
                            ['Data/hora',  fmt(inv.used_at)],
                          ]} />
                        </>
                      )}

                      <div style={{ marginTop: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <CopyBtn label="Copiar token" value={inv.token} />
                        {status === 'ativo' && (
                          <CopyBtn label="Copiar link" value={`${window.location.origin}/register?token=${inv.token}`} />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AuthShell>
  );
}

// ── Sub-componentes locais ────────────────────────────────────

function DetailGrid({ rows }: { rows: [string, string][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 12px' }}>
      {rows.map(([label, value]) => (
        <>
          <span key={`l-${label}`} style={{ fontSize: '11px', color: 'hsl(215 10% 40%)', lineHeight: 1.5 }}>
            {label}
          </span>
          <span key={`v-${label}`} style={{ fontSize: '12px', color: 'hsl(215 14% 72%)', lineHeight: 1.5, wordBreak: 'break-all' }}>
            {value}
          </span>
        </>
      ))}
    </div>
  );
}

function CopyBtn({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); } catch { /* noop */ }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  };
  return (
    <button onClick={copy} style={{
      padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
      border: '1px solid hsl(220 14% 22%)',
      background: done ? 'hsl(150 55% 14% / 0.5)' : 'hsl(220 18% 14%)',
      color: done ? 'hsl(150 55% 55%)' : 'hsl(215 10% 60%)',
      cursor: 'pointer', transition: 'all 0.15s',
    }}>
      {done ? '✓ Copiado' : label}
    </button>
  );
}

export default Admin;
