import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';
import {
  AuthShell, FormField, PasswordInput, ErrorBanner, LoadingLabel,
  cardStyle, submitBtnStyle,
} from './Login';

// ── Tela 1: Solicitar reset (usuário digita o e-mail) ─────────
export function ForgotPassword() {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [sent,    setSent]    = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/password-reset/request', { email: email.trim() });
      setSent(true);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Erro ao processar solicitação. Tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell subtitle="Redefinição de senha">
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '50%', margin: '0 auto 20px',
            background: 'hsl(150 55% 14%)', border: '2px solid hsl(150 55% 32%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
          }}>
            ✉️
          </div>
          <h2 style={{ margin: '0 0 10px', fontSize: '17px', fontWeight: 700, color: 'hsl(215 18% 90%)' }}>
            Verifique seu e-mail
          </h2>
          <p style={{ margin: '0 0 24px', fontSize: '14px', color: 'hsl(215 10% 52%)', lineHeight: 1.6 }}>
            Se <strong style={{ color: 'hsl(215 18% 80%)' }}>{email}</strong> estiver cadastrado,
            você receberá um link para redefinir a senha em alguns instantes.
          </p>
          <p style={{ margin: '0 0 20px', fontSize: '12px', color: 'hsl(215 10% 40%)', lineHeight: 1.5 }}>
            Verifique também a pasta de spam. O link expira em <strong>1 hora</strong>.
          </p>
          <Link to="/login" style={{
            display: 'block', padding: '12px', borderRadius: '10px', textAlign: 'center',
            background: 'hsl(220 18% 14%)', border: '1.5px solid hsl(220 14% 22%)',
            color: 'hsl(215 10% 62%)', fontSize: '14px', fontWeight: 500, textDecoration: 'none',
          }}>
            Voltar para o login
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Redefinição de senha">
      <div style={cardStyle}>
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700, color: 'hsl(215 18% 90%)' }}>
            Esqueceu a senha?
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'hsl(215 10% 46%)', lineHeight: 1.5 }}>
            Informe seu e-mail e enviaremos um link para criar uma nova senha.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <FormField label="E-mail cadastrado">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              disabled={loading}
              autoFocus
              style={{
                width: '100%', padding: '13px 16px', borderRadius: '12px',
                background: 'hsl(218 20% 10%)', border: '1.5px solid hsl(220 14% 21%)',
                color: 'hsl(215 18% 88%)', fontSize: '16px', outline: 'none',
                WebkitAppearance: 'none', appearance: 'none', boxSizing: 'border-box',
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

          {error && <ErrorBanner message={error} />}

          <button type="submit" disabled={loading} className="btn-brand" style={submitBtnStyle(loading)}>
            {loading ? <LoadingLabel label="Enviando…" /> : 'Enviar link de redefinição'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '18px', fontSize: '13px', color: 'hsl(215 10% 38%)' }}>
          Lembrou a senha?{' '}
          <Link to="/login" style={{ color: 'hsl(250 70% 68%)', textDecoration: 'none', fontWeight: 600 }}>
            Voltar ao login
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

// ── Tela 2: Definir nova senha (chegou pelo link do e-mail) ───
export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate        = useNavigate();
  const token           = searchParams.get('token') ?? '';

  const [status,      setStatus]      = useState<'validating' | 'invalid' | 'form' | 'success'>('validating');
  const [tokenError,  setTokenError]  = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  useEffect(() => {
    if (!token) { setStatus('invalid'); setTokenError('Link inválido — token ausente.'); return; }
    api.get('/auth/password-reset/validate', { params: { token } })
      .then(() => setStatus('form'))
      .catch(err => {
        setStatus('invalid');
        setTokenError(
          err?.response?.data?.error ?? 'Link inválido ou expirado.'
        );
      });
  }, [token]);

  const RULES = [
    { label: 'Ao menos 8 caracteres',          ok: password.length >= 8 },
    { label: 'Uma letra maiúscula',             ok: /[A-Z]/.test(password) },
    { label: 'Uma letra minúscula',             ok: /[a-z]/.test(password) },
    { label: 'Um número',                       ok: /\d/.test(password) },
    { label: 'Um símbolo (!@#$%...)',           ok: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password) },
  ];
  const allRulesMet = RULES.every(r => r.ok);
  const passwordsMatch = password === confirm && confirm.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRulesMet) return;
    if (!passwordsMatch) { setError('As senhas não coincidem'); return; }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/password-reset/confirm', { token, password });
      setStatus('success');
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Erro ao redefinir senha. Tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (status === 'validating') {
    return (
      <AuthShell subtitle="Redefinição de senha">
        <div style={{ ...cardStyle, textAlign: 'center', padding: '40px 24px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%', margin: '0 auto',
            border: '3px solid hsl(220 14% 22%)', borderTopColor: 'hsl(250 70% 60%)',
            animation: 'bepe-spin 0.7s linear infinite',
          }} />
          <p style={{ marginTop: '16px', fontSize: '13px', color: 'hsl(215 10% 44%)' }}>
            Validando link…
          </p>
        </div>
      </AuthShell>
    );
  }

  if (status === 'invalid') {
    return (
      <AuthShell subtitle="Redefinição de senha">
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '50%', margin: '0 auto 20px',
            background: 'hsl(0 68% 14%)', border: '2px solid hsl(0 68% 32%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
          }}>⚠️</div>
          <h2 style={{ margin: '0 0 10px', fontSize: '16px', fontWeight: 700, color: 'hsl(215 18% 85%)' }}>
            Link inválido
          </h2>
          <p style={{ margin: '0 0 24px', fontSize: '13px', color: 'hsl(215 10% 50%)', lineHeight: 1.5 }}>
            {tokenError}
          </p>
          <Link to="/forgot-password" style={{
            display: 'block', padding: '12px', borderRadius: '10px', textAlign: 'center',
            background: 'linear-gradient(135deg,hsl(250 85% 55%),hsl(215 85% 52%))',
            color: '#fff', fontSize: '14px', fontWeight: 600, textDecoration: 'none',
          }}>
            Solicitar novo link
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (status === 'success') {
    return (
      <AuthShell subtitle="Redefinição de senha">
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '50%', margin: '0 auto 20px',
            background: 'hsl(150 55% 14%)', border: '2px solid hsl(150 55% 32%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
          }}>✓</div>
          <h2 style={{ margin: '0 0 10px', fontSize: '17px', fontWeight: 700, color: 'hsl(215 18% 90%)' }}>
            Senha redefinida!
          </h2>
          <p style={{ margin: '0 0 24px', fontSize: '13px', color: 'hsl(215 10% 52%)', lineHeight: 1.5 }}>
            Sua nova senha foi salva com sucesso.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="btn-brand"
            style={{ ...submitBtnStyle(false), width: '100%' }}
          >
            Fazer login
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Redefinição de senha">
      <div style={cardStyle}>
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700, color: 'hsl(215 18% 90%)' }}>
            Criar nova senha
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'hsl(215 10% 46%)' }}>
            Escolha uma senha forte para sua conta.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <FormField label="Nova senha">
            <PasswordInput
              value={password} onChange={e => setPassword(e.target.value)}
              show={showPw} onToggle={() => setShowPw(v => !v)}
              placeholder="Mínimo 8 caracteres" required disabled={loading}
              autoComplete="new-password"
            />
          </FormField>

          {/* Checklist de regras */}
          {password.length > 0 && !allRulesMet && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px',
              padding: '12px 14px', borderRadius: '10px',
              background: 'hsl(220 16% 11%)', border: '1px solid hsl(220 14% 18%)',
            }}>
              {RULES.map(r => (
                <span key={r.label} style={{ fontSize: '11px', color: r.ok ? 'hsl(150 55% 50%)' : 'hsl(215 10% 40%)' }}>
                  {r.ok ? '✓' : '○'} {r.label}
                </span>
              ))}
            </div>
          )}

          <FormField label="Confirmar senha">
            <PasswordInput
              value={confirm} onChange={e => setConfirm(e.target.value)}
              show={showConfirm} onToggle={() => setShowConfirm(v => !v)}
              placeholder="Repita a nova senha" required disabled={loading}
              autoComplete="new-password"
              style={{
                borderColor: confirm.length > 0
                  ? (passwordsMatch ? 'hsl(150 55% 38%)' : 'hsl(0 68% 42%)')
                  : undefined,
              }}
            />
          </FormField>

          {error && <ErrorBanner message={error} />}

          <button
            type="submit"
            disabled={loading || !allRulesMet || !passwordsMatch}
            className="btn-brand"
            style={submitBtnStyle(loading || !allRulesMet || !passwordsMatch)}
          >
            {loading ? <LoadingLabel label="Salvando…" /> : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}

export default ResetPassword;
