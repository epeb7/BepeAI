import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { authService } from '../services/auth.service';
import {
  AuthShell, FormField, AuthInput, PasswordInput, ErrorBanner, LoadingLabel,
  cardStyle, footnoteLinkStyle, inlineLinkStyle, submitBtnStyle,
} from './Login';

interface RegisterProps { onLogin?: () => void; }

// ── Regras de senha ────────────────────────────────────────────
const PW_RULES = [
  { label: '8 caracteres',      test: (p: string) => p.length >= 8 },
  { label: 'Letra maiúscula',   test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Letra minúscula',   test: (p: string) => /[a-z]/.test(p) },
  { label: 'Número',            test: (p: string) => /\d/.test(p) },
  { label: 'Símbolo (!@#$…)',   test: (p: string) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
];

function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  const n = PW_RULES.filter(r => r.test(pw)).length;
  if (n <= 1) return 0;
  if (n <= 2) return 1;
  if (n <= 4) return 2;
  return 3;
}

const STRENGTH_LABELS = ['Muito fraca', 'Fraca', 'Boa', 'Forte'];
const STRENGTH_COLORS = [
  'hsl(0 68% 60%)',
  'hsl(30 88% 56%)',
  'hsl(45 88% 54%)',
  'hsl(150 55% 50%)',
];

export function Register({ onLogin }: RegisterProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token') ?? '';

  const [step, setStep]             = useState<'validating' | 'invalid' | 'form' | 'success'>('validating');
  const [invalidReason, setInvalid] = useState('');
  const [lockedEmail, setLockedEmail] = useState<string | null>(null);

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPw,   setShowPw]   = useState(false);

  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);

  const strength  = passwordStrength(password);
  const pwOk      = PW_RULES.every(r => r.test(password));
  const confirmOk = confirm.length > 0 && confirm === password;
  const formReady = !!name.trim() && !!email.trim() && pwOk && confirmOk && !loading;

  // ── Validar token ao montar ──────────────────────────────────
  useEffect(() => {
    if (!inviteToken) {
      setInvalid('Nenhum token de convite encontrado na URL.');
      setStep('invalid');
      return;
    }
    authService.validateInvite(inviteToken)
      .then(({ email: locked }) => {
        if (locked) { setLockedEmail(locked); setEmail(locked); }
        setStep('form');
        setTimeout(() => nameRef.current?.focus(), 80);
      })
      .catch((err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setInvalid(msg ?? 'Este convite é inválido, já foi usado ou expirou.');
        setStep('invalid');
      });
  }, [inviteToken]);

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formReady) return;
    setError('');
    setLoading(true);
    try {
      const data = await authService.register({
        token: inviteToken, name: name.trim(), email: email.trim(), password,
      });
      if (data.success) {
        localStorage.setItem('token', data.token);
        onLogin?.();
        setStep('success');
        setTimeout(() => navigate('/dashboard'), 1600);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Erro ao criar conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // ── Validating ────────────────────────────────────────────────
  if (step === 'validating') {
    return (
      <AuthShell subtitle="Criar conta">
        <div style={{ ...cardStyle, textAlign: 'center', padding: '40px 24px' }}>
          <div style={{
            width: '36px', height: '36px', margin: '0 auto 16px',
            border: '3px solid hsl(220 14% 22%)', borderTopColor: 'hsl(250 70% 60%)',
            borderRadius: '50%', animation: 'bepe-spin 0.7s linear infinite',
          }} />
          <p style={{ margin: 0, color: 'hsl(215 10% 46%)', fontSize: '14px' }}>
            Verificando convite…
          </p>
        </div>
        <style>{`@keyframes bepe-spin { to { transform: rotate(360deg); } }`}</style>
      </AuthShell>
    );
  }

  // ── Invalid token ─────────────────────────────────────────────
  if (step === 'invalid') {
    return (
      <AuthShell subtitle="Criar conta">
        <div style={{ ...cardStyle, textAlign: 'center', padding: '36px 24px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '16px',
            margin: '0 auto 18px',
            background: 'hsl(0 68% 58% / 0.10)',
            border: '1.5px solid hsl(0 68% 58% / 0.24)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 9v4m0 4h.01M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"
                stroke="hsl(0 68% 68%)" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <h2 style={{ color: 'hsl(215 18% 88%)', fontSize: '17px', fontWeight: 700, margin: '0 0 10px' }}>
            Convite inválido
          </h2>
          <p style={{ color: 'hsl(215 10% 46%)', fontSize: '14px', margin: '0 0 24px', lineHeight: 1.6 }}>
            {invalidReason}
          </p>
          <Link to="/login" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '11px 22px', borderRadius: '12px',
            background: 'hsl(250 60% 18%)', border: '1.5px solid hsl(250 40% 28%)',
            color: 'hsl(250 60% 72%)', fontSize: '14px', fontWeight: 600,
            textDecoration: 'none',
          }}>
            Voltar ao login
          </Link>
        </div>
      </AuthShell>
    );
  }

  // ── Success ───────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <AuthShell subtitle="Criar conta">
        <div style={{ ...cardStyle, textAlign: 'center', padding: '40px 24px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '18px',
            margin: '0 auto 20px',
            background: 'hsl(150 55% 48% / 0.12)',
            border: '1.5px solid hsl(150 55% 48% / 0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7"
                stroke="hsl(150 55% 60%)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 style={{ color: 'hsl(215 18% 88%)', fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>
            Conta criada!
          </h2>
          <p style={{ color: 'hsl(215 10% 46%)', fontSize: '14px', margin: 0 }}>
            Redirecionando para o dashboard…
          </p>
        </div>
      </AuthShell>
    );
  }

  // ── Form ──────────────────────────────────────────────────────
  return (
    <AuthShell subtitle="Criar conta">
      <div style={cardStyle}>

        {/* Invite banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          marginBottom: '24px', padding: '10px 14px', borderRadius: '12px',
          background: 'hsl(250 60% 18% / 0.5)',
          border: '1px solid hsl(250 40% 28% / 0.4)',
        }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <path d="M8 1l1.8 3.8 4.2.6-3 2.9.7 4.2L8 10.5 4.3 12.5l.7-4.2-3-2.9 4.2-.6L8 1z"
              fill="hsl(250 60% 68%)" />
          </svg>
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'hsl(250 60% 72%)' }}>
            Você recebeu um convite para o BepeAI
          </span>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

          <FormField label="Nome completo">
            <input
              ref={nameRef}
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Seu nome" required disabled={loading}
              autoComplete="name" maxLength={80}
              style={{
                width: '100%', padding: '13px 16px', borderRadius: '12px',
                background: 'hsl(218 20% 10%)', border: '1.5px solid hsl(220 14% 21%)',
                color: 'hsl(215 18% 88%)', fontSize: '16px', lineHeight: '1.4',
                outline: 'none', WebkitAppearance: 'none', appearance: 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s', boxSizing: 'border-box',
              }}
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

          <FormField
            label="E-mail"
            hint={lockedEmail ? 'Convite vinculado a este e-mail' : undefined}
          >
            <AuthInput
              type="email" value={email}
              onChange={e => !lockedEmail && setEmail(e.target.value)}
              placeholder="seu@email.com" required
              disabled={loading || !!lockedEmail}
              autoComplete="email"
              style={{
                width: '100%', padding: '13px 16px', borderRadius: '12px',
                background: 'hsl(218 20% 10%)', border: '1.5px solid hsl(220 14% 21%)',
                color: 'hsl(215 18% 88%)', fontSize: '16px', lineHeight: '1.4',
                outline: 'none', WebkitAppearance: 'none', appearance: 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s', boxSizing: 'border-box',
                opacity: lockedEmail ? 0.6 : 1,
                cursor: lockedEmail ? 'not-allowed' : 'text',
              }}
            />
          </FormField>

          <FormField label="Senha">
            <PasswordInput
              value={password} onChange={e => setPassword(e.target.value)}
              show={showPw} onToggle={() => setShowPw(v => !v)}
              placeholder="Mín. 8 chars com símbolo"
              required disabled={loading} autoComplete="new-password"
            />

            {/* Strength bar */}
            {password.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ display: 'flex', gap: '5px', marginBottom: '6px' }}>
                  {[0,1,2,3].map(i => (
                    <div key={i} style={{
                      flex: 1, height: '3px', borderRadius: '2px',
                      background: i <= strength ? STRENGTH_COLORS[strength] : 'hsl(220 14% 20%)',
                      transition: 'background 0.2s',
                    }} />
                  ))}
                </div>
                <p style={{ margin: 0, fontSize: '11px', color: STRENGTH_COLORS[strength], fontWeight: 500 }}>
                  {STRENGTH_LABELS[strength]}
                </p>
              </div>
            )}

            {/* Rule checklist — só mostra enquanto não satisfaz tudo */}
            {password.length > 0 && !pwOk && (
              <div style={{
                marginTop: '10px', display: 'grid',
                gridTemplateColumns: '1fr 1fr', gap: '4px 12px',
              }}>
                {PW_RULES.map(r => {
                  const ok = r.test(password);
                  return (
                    <div key={r.label} style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      fontSize: '11.5px',
                      color: ok ? 'hsl(150 55% 52%)' : 'hsl(215 10% 40%)',
                      transition: 'color 0.15s',
                    }}>
                      {ok
                        ? <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="hsl(150 55% 52%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        : <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4" stroke="hsl(220 14% 30%)" strokeWidth="1" fill="none"/></svg>
                      }
                      {r.label}
                    </div>
                  );
                })}
              </div>
            )}
          </FormField>

          <FormField label="Confirmar senha">
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Repita a senha" required disabled={loading}
                autoComplete="new-password"
                style={{
                  width: '100%', padding: '13px 48px 13px 16px', borderRadius: '12px',
                  background: 'hsl(218 20% 10%)',
                  border: `1.5px solid ${
                    confirm.length === 0     ? 'hsl(220 14% 21%)' :
                    confirmOk                ? 'hsl(150 55% 40%)'  :
                                               'hsl(0 68% 48%)'
                  }`,
                  color: 'hsl(215 18% 88%)', fontSize: '16px', lineHeight: '1.4',
                  outline: 'none', WebkitAppearance: 'none', appearance: 'none',
                  transition: 'border-color 0.15s, box-shadow 0.15s', boxSizing: 'border-box',
                }}
                onFocus={e => {
                  if (confirm.length === 0)
                    e.currentTarget.style.boxShadow = '0 0 0 3px hsl(250 85% 60% / 0.15)';
                }}
                onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
              />
              {confirm.length > 0 && (
                <span style={{
                  position: 'absolute', right: '14px', top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '16px', lineHeight: 1,
                  color: confirmOk ? 'hsl(150 55% 52%)' : 'hsl(0 68% 60%)',
                  pointerEvents: 'none',
                }}>
                  {confirmOk ? '✓' : '✗'}
                </span>
              )}
            </div>
          </FormField>

          {error && <ErrorBanner message={error} />}

          <button
            type="submit"
            disabled={!formReady}
            className="btn-brand"
            style={submitBtnStyle(!formReady)}
          >
            {loading ? <LoadingLabel label="Criando conta…" /> : 'Criar minha conta'}
          </button>
        </form>
      </div>

      <p style={footnoteLinkStyle}>
        Já tem uma conta?{' '}
        <Link to="/login" style={inlineLinkStyle}>Entrar</Link>
      </p>
    </AuthShell>
  );
}

export default Register;
