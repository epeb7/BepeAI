import api from './api';

export interface InviteToken {
  id: string;
  token: string;
  email: string | null;
  note: string | null;
  created_by: string;
  used_at: string | null;
  used_by: string | null;
  used_by_name: string | null;
  used_by_email: string | null;
  used_ip: string | null;
  used_user_agent: string | null;
  view_count: number;
  last_viewed_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface CreateInvitePayload {
  email?: string;
  expiresIn?: number;
  note?: string;
}

export interface CreateInviteResult {
  id: string;
  token: string;
  email: string | null;
  note: string | null;
  expires_at: string;
  registerUrl: string;
}

export const adminService = {
  createInvite: async (payload: CreateInvitePayload = {}): Promise<CreateInviteResult> => {
    const res = await api.post('/admin/invites', payload);
    return res.data;
  },

  listInvites: async (): Promise<InviteToken[]> => {
    const res = await api.get('/admin/invites');
    return res.data;
  },
};
