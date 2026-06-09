import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Login } from './pages/Login';
import { ChatBot } from './pages/ChatBot';
import { useState, useEffect } from 'react';

const queryClient = new QueryClient();

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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthGuard>
          <Routes>
            <Route path="/login"     element={<Login onLogin={() => setToken(localStorage.getItem('token'))} />} />
            <Route path="/dashboard" element={token ? <ChatBot /> : <Navigate to="/login" replace />} />
            <Route path="/"          element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthGuard>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
