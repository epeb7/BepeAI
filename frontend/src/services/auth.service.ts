import api from './api';

export const authService = {
  login: async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    return res.data as { success: boolean; token: string };
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      localStorage.removeItem('token');
      window.dispatchEvent(new Event('auth:logout'));
    }
  },

  validateInvite: async (token: string): Promise<{ valid: boolean; email: string | null }> => {
    const res = await api.get('/auth/invite/validate', { params: { token } });
    return res.data;
  },

  register: async (payload: {
    token: string;
    name: string;
    email: string;
    password: string;
  }): Promise<{ success: boolean; token: string }> => {
    const res = await api.post('/auth/register', payload);
    return res.data;
  },
};
