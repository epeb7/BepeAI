import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { LogoBrain } from '../components/logo/LogoBrain';

export function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { email, password });
      if (res.data.success) {
        localStorage.setItem('token', res.data.token);
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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
         style={{ background: 'hsl(218 20% 7%)' }}>

      {/* ── Background ambient ──────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {/* Top violet glow */}
        <div style={{
          position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)',
          width: '700px', height: '400px', borderRadius: '50%',
          background: 'radial-gradient(ellipse, hsl(250 85% 50% / 0.10) 0%, transparent 65%)',
        }} />
        {/* Bottom blue glow */}
        <div style={{
          position: 'absolute', bottom: '-10%', right: '20%',
          width: '400px', height: '300px', borderRadius: '50%',
          background: 'radial-gradient(ellipse, hsl(215 85% 52% / 0.07) 0%, transparent 65%)',
        }} />
        {/* Subtle grid */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.025,
          backgroundImage: `
            linear-gradient(hsl(250 85% 60%) 1px, transparent 1px),
            linear-gradient(90deg, hsl(250 85% 60%) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }} />
      </div>

      <div className="relative w-full max-w-[380px] mx-5">

        {/* ── Logo / brand ────────────────────────────────── */}
        <div className="flex flex-col items-center mb-8">
          {/* Pulsing ring */}
          <div className="relative mb-5">
            <div className="animate-brand-ping absolute inset-0 rounded-2xl"
                 style={{ background: 'hsl(250 85% 60% / 0.15)' }} />
            <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, hsl(250 85% 50%), hsl(215 85% 52%))' }}>
              <LogoBrain size={28} className="text-white" />
            </div>
          </div>

          <h1 className="text-[22px] font-bold tracking-tight brand-text">BepeAI</h1>
          <p style={{ color: 'hsl(215 10% 46%)', fontSize: '12px', marginTop: '4px' }}>
            Automação documental inteligente
          </p>
        </div>

        {/* ── Card ────────────────────────────────────────── */}
        <div style={{
          background: 'hsl(220 18% 12%)',
          border: '1px solid hsl(220 14% 19%)',
          borderRadius: '20px',
          padding: '28px',
          boxShadow: '0 32px 80px -16px hsl(250 85% 10% / 0.7), 0 0 0 1px hsl(220 14% 16%)',
        }}>

          {/* Value prop strip */}
          <div style={{
            display: 'flex', gap: '6px', marginBottom: '24px',
            padding: '10px 14px', borderRadius: '12px',
            background: 'hsl(250 60% 18% / 0.5)',
            border: '1px solid hsl(250 40% 28% / 0.4)',
          }}>
            {['Contratos', 'Propostas', 'Relatórios'].map((label, i) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {i > 0 && <span style={{ color: 'hsl(215 10% 30%)', fontSize: '11px' }}>·</span>}
                <span style={{ fontSize: '11px', fontWeight: 500, color: 'hsl(250 60% 72%)' }}>
                  {label}
                </span>
              </span>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'hsl(215 10% 40%)' }}>
              prontos em minutos
            </span>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Field label="Email">
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com" required disabled={loading}
                autoComplete="email"
                className="bepe-input"
                style={inputStyle}
                onFocus={e => applyFocus(e.target as HTMLInputElement)}
                onBlur={e => removeFocus(e.target as HTMLInputElement)}
              />
            </Field>

            <Field label="Senha">
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required disabled={loading}
                autoComplete="current-password"
                style={inputStyle}
                onFocus={e => applyFocus(e.target as HTMLInputElement)}
                onBlur={e => removeFocus(e.target as HTMLInputElement)}
              />
            </Field>

            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 14px', borderRadius: '10px',
                background: 'hsl(0 68% 58% / 0.08)',
                border: '1px solid hsl(0 68% 58% / 0.22)',
                color: 'hsl(0 68% 68%)', fontSize: '12px',
              }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M8 5v4m0 2h.01M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="btn-brand"
              style={{
                width: '100%', padding: '11px', borderRadius: '12px',
                fontSize: '13px', fontWeight: 600, color: '#fff',
                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1, marginTop: '4px',
              }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span style={{
                    width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.25)',
                    borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                    display: 'inline-block',
                  }} />
                  Entrando...
                </span>
              ) : 'Entrar na plataforma'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center', marginTop: '20px', fontSize: '11px',
          color: 'hsl(215 8% 32%)',
        }}>
          © {new Date().getFullYear()} BepeAI · Todos os direitos reservados
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .bepe-input::placeholder { color: hsl(215 8% 32%); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: '10px', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'hsl(215 10% 46%)', marginBottom: '6px',
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: '10px',
  background: 'hsl(218 20% 9%)', border: '1px solid hsl(220 14% 22%)',
  color: 'hsl(215 18% 88%)', fontSize: '13px', outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

function applyFocus(el: HTMLInputElement) {
  el.style.borderColor = 'hsl(250 85% 60%)';
  el.style.boxShadow   = '0 0 0 3px hsl(250 85% 60% / 0.14)';
}
function removeFocus(el: HTMLInputElement) {
  el.style.borderColor = 'hsl(220 14% 22%)';
  el.style.boxShadow   = 'none';
}

export default Login;
