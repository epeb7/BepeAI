import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../services/auth.service';
import { LogoBrain } from '../components/logo/LogoBrain';

interface LoginProps { onLogin?: () => void; }

export function Login({ onLogin }: LoginProps) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await authService.login(email, password);
      if (data.success) {
        localStorage.setItem('token', data.token);
        onLogin?.();
        navigate('/dashboard');
      } else setError('Credenciais inválidas');
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Credenciais inválidas'
      );
    } finally { setLoading(false); }
  };

  return (
    <AuthShell subtitle="Automação documental inteligente">
      <div style={cardStyle}>

        {/* Value strip */}
        <div style={valueStripStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {['Contratos', 'Propostas', 'Relatórios'].map((label, i) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                {i > 0 && <span style={{ color: 'hsl(215 10% 30%)', fontSize: '12px', lineHeight: 1 }}>·</span>}
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'hsl(250 60% 72%)' }}>
                  {label}
                </span>
              </span>
            ))}
          </div>
          <span style={{ fontSize: '11px', color: 'hsl(215 10% 40%)', whiteSpace: 'nowrap' }}>
            prontos em minutos
          </span>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

          <FormField label="E-mail">
            <AuthInput
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com" required disabled={loading}
              autoComplete="email"
            />
          </FormField>

          <FormField label="Senha">
            <PasswordInput
              value={password} onChange={e => setPassword(e.target.value)}
              show={showPw} onToggle={() => setShowPw(v => !v)}
              placeholder="Sua senha" required disabled={loading}
              autoComplete="current-password"
            />
          </FormField>

          {error && <ErrorBanner message={error} />}

          <button
            type="submit" disabled={loading}
            className="btn-brand"
            style={submitBtnStyle(loading)}
          >
            {loading ? <LoadingLabel label="Entrando…" /> : 'Entrar na plataforma'}
          </button>
        </form>
      </div>

      <p style={footnoteLinkStyle}>
        <Link to="/forgot-password" style={{ ...inlineLinkStyle, color: 'hsl(215 10% 42%)', fontWeight: 400 }}>
          Esqueci minha senha
        </Link>
        {' · '}
        Tem um convite?{' '}
        <Link to="/register" style={inlineLinkStyle}>Criar conta</Link>
      </p>
    </AuthShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared layout shell  (Login + Register usam o mesmo)
// ─────────────────────────────────────────────────────────────
export function AuthShell({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle: string;
}) {
  return (
    <div style={{
      minHeight: '100dvh',           // dvh: respeita teclado virtual no mobile
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'hsl(218 20% 7%)',
      position: 'relative',
      overflow: 'hidden',
      padding: '24px 16px 32px',    // breathing room no mobile
    }}>

      {/* Ambient glows */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', top: '-15%', left: '50%', transform: 'translateX(-50%)',
          width: 'min(700px, 150vw)', height: '380px', borderRadius: '50%',
          background: 'radial-gradient(ellipse, hsl(250 85% 50% / 0.11) 0%, transparent 65%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-8%', right: '10%',
          width: 'min(420px, 80vw)', height: '280px', borderRadius: '50%',
          background: 'radial-gradient(ellipse, hsl(215 85% 52% / 0.07) 0%, transparent 65%)',
        }} />
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.022,
          backgroundImage: `
            linear-gradient(hsl(250 85% 60%) 1px, transparent 1px),
            linear-gradient(90deg, hsl(250 85% 60%) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }} />
      </div>

      {/* Content column */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '400px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 0,
      }}>

        {/* Logo block */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          marginBottom: '28px',
        }}>
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <div className="animate-brand-ping" style={{
              position: 'absolute', inset: 0, borderRadius: '18px',
              background: 'hsl(250 85% 60% / 0.15)',
            }} />
            <div style={{
              position: 'relative',
              width: '58px', height: '58px', borderRadius: '18px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, hsl(250 85% 50%), hsl(215 85% 52%))',
              boxShadow: '0 8px 32px hsl(250 85% 50% / 0.32)',
            }}>
              <LogoBrain size={28} className="text-white" />
            </div>
          </div>

          <h1 className="brand-text" style={{
            fontSize: '24px', fontWeight: 800, letterSpacing: '-0.02em',
            margin: 0, lineHeight: 1.2,
          }}>
            BepeAI
          </h1>
          <p style={{
            color: 'hsl(215 10% 44%)', fontSize: '13px',
            margin: '6px 0 0', letterSpacing: '0.01em',
          }}>
            {subtitle}
          </p>
        </div>

        {children}

        <p style={{
          textAlign: 'center', marginTop: '20px',
          fontSize: '11px', color: 'hsl(215 8% 28%)',
        }}>
          © {new Date().getFullYear()} BepeAI · Todos os direitos reservados
        </p>
      </div>

      <style>{`
        /* Fix autofill amarelo em todos os browsers */
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 100px hsl(218 20% 11%) inset !important;
          -webkit-text-fill-color: hsl(215 18% 88%) !important;
          caret-color: hsl(215 18% 88%);
          transition: background-color 9999s ease-in-out 0s;
        }
        input::placeholder { color: hsl(215 8% 34%) !important; }
        @keyframes bepe-spin { to { transform: rotate(360deg); } }
        .bepe-spin { animation: bepe-spin 0.7s linear infinite; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared form primitives  (Login + Register reutilizam)
// ─────────────────────────────────────────────────────────────
export function FormField({ label, children, hint }: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      <label style={{
        fontSize: '11px', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em',
        color: 'hsl(215 10% 48%)',
      }}>
        {label}
      </label>
      {children}
      {hint && (
        <p style={{ margin: 0, fontSize: '11px', color: 'hsl(215 10% 38%)', lineHeight: 1.4 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export const baseInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px 16px',          // mín. 44px height (13*2 + ~18 line-height)
  borderRadius: '12px',
  background: 'hsl(218 20% 10%)',
  border: '1.5px solid hsl(220 14% 21%)',
  color: 'hsl(215 18% 88%)',
  fontSize: '16px',              // CRÍTICO: abaixo de 16px → iOS faz zoom
  lineHeight: '1.4',
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  WebkitAppearance: 'none',      // remove estilo nativo iOS
  appearance: 'none',
  boxSizing: 'border-box',
};

export function AuthInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={baseInputStyle}
      onFocus={e => {
        e.currentTarget.style.borderColor = 'hsl(250 85% 58%)';
        e.currentTarget.style.boxShadow   = '0 0 0 3px hsl(250 85% 60% / 0.15)';
        props.onFocus?.(e);
      }}
      onBlur={e => {
        e.currentTarget.style.borderColor = 'hsl(220 14% 21%)';
        e.currentTarget.style.boxShadow   = 'none';
        props.onBlur?.(e);
      }}
    />
  );
}

export function PasswordInput({
  value, onChange, show, onToggle, ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        {...rest}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        style={{ ...baseInputStyle, paddingRight: '48px' }}
        onFocus={e => {
          e.currentTarget.style.borderColor = 'hsl(250 85% 58%)';
          e.currentTarget.style.boxShadow   = '0 0 0 3px hsl(250 85% 60% / 0.15)';
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = 'hsl(220 14% 21%)';
          e.currentTarget.style.boxShadow   = 'none';
        }}
      />
      <button
        type="button"
        onClick={onToggle}
        tabIndex={-1}
        aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
        style={{
          position: 'absolute', right: '14px', top: '50%',
          transform: 'translateY(-50%)',
          background: 'none', border: 'none', padding: '4px',
          cursor: 'pointer', color: 'hsl(215 10% 44%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minWidth: '32px', minHeight: '32px',  // touch target
        }}
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px',
      padding: '12px 14px', borderRadius: '12px',
      background: 'hsl(0 68% 58% / 0.08)',
      border: '1.5px solid hsl(0 68% 58% / 0.22)',
      color: 'hsl(0 68% 70%)', fontSize: '13px', lineHeight: 1.5,
    }}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: '1px' }}>
        <path d="M8 5v4m0 2h.01M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      {message}
    </div>
  );
}

export function LoadingLabel({ label }: { label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
      <span className="bepe-spin" style={{
        width: '15px', height: '15px', flexShrink: 0,
        border: '2px solid rgba(255,255,255,0.25)',
        borderTopColor: '#fff', borderRadius: '50%',
        display: 'inline-block',
      }} />
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared style constants
// ─────────────────────────────────────────────────────────────
export const cardStyle: React.CSSProperties = {
  background: 'hsl(220 18% 12%)',
  border: '1.5px solid hsl(220 14% 19%)',
  borderRadius: '20px',
  padding: '28px 24px',
  boxShadow: '0 24px 64px -16px hsl(250 85% 8% / 0.8), 0 0 0 1px hsl(220 14% 16%)',
};

export const valueStripStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  flexWrap: 'wrap',
  marginBottom: '24px',
  padding: '10px 14px',
  borderRadius: '12px',
  background: 'hsl(250 60% 18% / 0.5)',
  border: '1px solid hsl(250 40% 28% / 0.4)',
};

export const footnoteLinkStyle: React.CSSProperties = {
  textAlign: 'center',
  margin: '14px 0 0',
  fontSize: '13px',
  color: 'hsl(215 10% 38%)',
};

export const inlineLinkStyle: React.CSSProperties = {
  color: 'hsl(250 70% 68%)',
  textDecoration: 'none',
  fontWeight: 600,
};

export function submitBtnStyle(loading: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '14px',              // touch-friendly height ~48px
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: 600,
    color: '#fff',
    border: 'none',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.72 : 1,
    marginTop: '4px',
    letterSpacing: '0.01em',
  };
}

// ─────────────────────────────────────────────────────────────
// Icon components
// ─────────────────────────────────────────────────────────────
export function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="3"
        stroke="currentColor" strokeWidth="1.6"/>
    </svg>
  );
}

export function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

export default Login;
