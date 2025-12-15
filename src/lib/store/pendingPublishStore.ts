import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface PendingPublish {
  agentId: string;
  txHash: string;
  chainId: number;
  tokenId: string;
  timestamp: number;
}

interface PendingPublishState {
  pending: PendingPublish | null;

  // Actions
  setPending: (data: Omit<PendingPublish, 'timestamp'>) => void;
  clearPending: () => void;
  getPending: () => PendingPublish | null;
  hasPendingForAgent: (agentId: string) => boolean;
}

export const usePendingPublishStore = create<PendingPublishState>()(
  persist(
    (set, get) => ({
      pending: null,

      setPending: (data) => {
        const pending: PendingPublish = {
          ...data,
          timestamp: Date.now(),
        };
        set({ pending });
      },

      clearPending: () => {
        set({ pending: null });
      },

      getPending: () => {
        const { pending } = get();
        if (!pending) return null;

        // Check if it's too old (stale)
        if (Date.now() - pending.timestamp > MAX_AGE_MS) {
          set({ pending: null });
          return null;
        }

        return pending;
      },

      hasPendingForAgent: (agentId: string) => {
        const pending = get().getPending();
        return pending?.agentId === agentId;
      },
    }),
    {
      name: 'agentokratia-pending-publish',
    }
  )
);

/**
 * Retry a pending publish confirmation
 * Returns true if successful, false otherwise
 */
export async function retryPendingPublish(token: string): Promise<{
  success: boolean;
  agentId?: string;
  tokenId?: string;
  error?: string;
}> {
  const { getPending, clearPending } = usePendingPublishStore.getState();
  const pending = getPending();

  if (!pending) {
    return { success: false, error: 'No pending confirmation found' };
  }

  try {
    const res = await fetch(`/api/agents/${pending.agentId}/publish/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        txHash: pending.txHash,
        chainId: pending.chainId,
        tokenId: pending.tokenId,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      clearPending();
      return {
        success: true,
        agentId: pending.agentId,
        tokenId: data.tokenId,
      };
    }

    // Handle 409 Conflict - agent published with different txHash
    // This means someone else published, or there was a duplicate. Clear pending to avoid infinite retries.
    if (res.status === 409) {
      clearPending();
      return {
        success: false,
        error: 'Agent was published with a different transaction. Please refresh to see the latest status.',
      };
    }

    // Legacy check for older error messages
    if (data.error?.includes('already published') || data.error?.includes('already live')) {
      clearPending();
      return {
        success: true,
        agentId: pending.agentId,
        tokenId: pending.tokenId,
      };
    }

    return { success: false, error: data.error };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Network error';
    return { success: false, error };
  }
}
