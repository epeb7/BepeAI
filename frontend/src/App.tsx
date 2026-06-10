import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, lazy, Suspense } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { isAdminToken } from './lib/utils';

// Code splitting: cada rota vira um chunk separado, reduzindo o bundle inicial.
const Login          = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Register       = lazy(() => import('./pages/Register').then(m => ({ default: m.Register })));
const ChatBot        = lazy(() => import('./pages/ChatBot').then(m => ({ default: m.ChatBot })));
const Admin          = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })));
const ForgotPassword = lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ForgotPassword })));
const ResetPassword  = lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPassword })));

const queryClient = new QueryClient();

// Fallback exibido enquanto o chunk da rota carrega.
function RouteFallback() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'hsl(220 18% 10%)',
    }}>
      <div style={{
        width: '28px', height: '28px', borderRadius: '50%',
        border: '3px solid hsl(220 14% 22%)', borderTopColor: 'hsl(250 70% 60%)',
        animation: 'app-spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes app-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Componente interno que tem acesso ao navigate do router
function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  useEffect(() => {
    const handleLogout = () => navigate('/login', { replace: true });
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, [navigate]);

  return <>{children}</>;
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    // Sincroniza quando token muda em outra aba ou via evento
    const handleStorage = () => setToken(localStorage.getItem('token'));
    const handleLogout  = () => setToken(null);

    window.addEventListener('storage', handleStorage);
    window.addEventListener('auth:logout', handleLogout);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('auth:logout', handleLogout);
    };
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthGuard>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/login"           element={<Login    onLogin={() => setToken(localStorage.getItem('token'))} />} />
                <Route path="/register"       element={<Register onLogin={() => setToken(localStorage.getItem('token'))} />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password"  element={<ResetPassword />} />
                <Route path="/dashboard"      element={token ? <ChatBot /> : <Navigate to="/login" replace />} />
                <Route path="/admin"          element={token && isAdminToken(token) ? <Admin onLogout={() => setToken(null)} /> : <Navigate to="/login" replace />} />
                <Route path="/"              element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </AuthGuard>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
