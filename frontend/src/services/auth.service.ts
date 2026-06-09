import api from './api';

export const authService = {
  login: async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    return res.data as { success: boolean; token: string };
  },

  logout: async () => {
    try {
      // Tenta revogar o token no servidor (best-effort)
      await api.post('/auth/logout');
    } finally {
      // Sempre limpa o estado local, mesmo se o servidor falhar
      localStorage.removeItem('token');
      window.dispatchEvent(new Event('auth:logout'));
    }
  },
};
