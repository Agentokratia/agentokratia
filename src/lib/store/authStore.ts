import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  // Persisted - minimum needed
  token: string | null;
  walletAddress: string | null;

  // Actions
  setAuth: (token: string, walletAddress: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      walletAddress: null,

      setAuth: (token, walletAddress) => {
        set({ token, walletAddress: walletAddress.toLowerCase() });
      },

      clearAuth: () => {
        set({ token: null, walletAddress: null });
      },
    }),
    {
      name: 'agentokratia-auth',
      partialize: (state) => ({
        token: state.token,
        walletAddress: state.walletAddress,
      }),
    }
  )
);

// API helpers for auth
export const authApi = {
  async getNonce(): Promise<string> {
    const res = await fetch('/api/auth/nonce');
    if (!res.ok) throw new Error('Failed to get nonce');
    const data = await res.json();
    return data.nonce;
  },

  async verify(
    message: string,
    signature: string,
    email?: string,
    handle?: string
  ): Promise<{ token: string; walletAddress: string; handle?: string }> {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, signature, email, handle }),
    });

    if (!res.ok) {
      const error = await res.json();
      // Include error code for special handling
      const err = new Error(error.error || 'Verification failed') as Error & { code?: string };
      err.code = error.code;
      throw err;
    }

    const data = await res.json();
    return {
      token: data.token,
      walletAddress: data.user.walletAddress,
    };
  },

  async getProfile(token: string) {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get profile');
    }

    const data = await res.json();
    return data.user;
  },

  async updateProfile(
    token: string,
    updates: { handle?: string; email?: string; name?: string; bio?: string }
  ) {
    const res = await fetch('/api/users/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to update profile');
    }

    return res.json();
  },

  async logout(token: string) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Ignore logout errors
    }
  },
};
