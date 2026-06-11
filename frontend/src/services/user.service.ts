import api from './api';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  company_name: string | null;
  brand_color: string | null;
  logo_base64: string | null;
}

export const userService = {
  getProfile: async (): Promise<UserProfile> => {
    const res = await api.get('/user/profile');
    return res.data;
  },

  uploadLogo: async (logoBase64: string): Promise<void> => {
    await api.put('/user/logo', { logoBase64 });
  },

  removeLogo: async (): Promise<void> => {
    await api.delete('/user/logo');
  },

  updateSettings: async (settings: {
    companyName?: string;
    brandColor?: string;
  }): Promise<void> => {
    await api.put('/user/settings', settings);
  },
};
