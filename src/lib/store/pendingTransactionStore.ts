import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export type TransactionType = 'publish' | 'enable_reviews' | 'review';

export interface PendingTransaction {
  type: TransactionType;
  txHash: string;
  chainId: number;
  timestamp: number;
  // Type-specific data
  agentId?: string;      // publish, enable_reviews
  tokenId?: string;      // publish
  reviewId?: string;     // review
  ownerHandle?: string;  // review
  agentSlug?: string;    // review
}

interface PendingTransactionState {
  // Map of type -> pending transaction (one per type)
  pending: Partial<Record<TransactionType, PendingTransaction>>;

  // Actions
  setPending: (data: Omit<PendingTransaction, 'timestamp'>) => void;
  clearPending: (type: TransactionType) => void;
  getPending: (type: TransactionType) => PendingTransaction | null;
  getAllPending: () => PendingTransaction[];
}

export const usePendingTransactionStore = create<PendingTransactionState>()(
  persist(
    (set, get) => ({
      pending: {},

      setPending: (data) => {
        const transaction: PendingTransaction = {
          ...data,
          timestamp: Date.now(),
        };
        set((state) => ({
          pending: { ...state.pending, [data.type]: transaction },
        }));
      },

      clearPending: (type) => {
        set((state) => {
          const { [type]: _, ...rest } = state.pending;
          return { pending: rest };
        });
      },

      getPending: (type) => {
        const transaction = get().pending[type];
        if (!transaction) return null;

        // Check if stale
        if (Date.now() - transaction.timestamp > MAX_AGE_MS) {
          get().clearPending(type);
          return null;
        }

        return transaction;
      },

      getAllPending: () => {
        const { pending } = get();
        const now = Date.now();
        return Object.values(pending).filter(
          (tx): tx is PendingTransaction =>
            tx !== undefined && now - tx.timestamp <= MAX_AGE_MS
        );
      },
    }),
    {
      name: 'agentokratia-pending-transactions',
    }
  )
);

/**
 * Retry a pending transaction confirmation
 */
export async function retryPendingTransaction(
  transaction: PendingTransaction,
  token?: string
): Promise<{ success: boolean; error?: string }> {
  const { clearPending } = usePendingTransactionStore.getState();

  try {
    let url: string;
    let body: Record<string, unknown>;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };

    switch (transaction.type) {
      case 'publish':
        if (!token) return { success: false, error: 'Auth required' };
        url = `/api/agents/${transaction.agentId}/publish/confirm`;
        body = {
          txHash: transaction.txHash,
          chainId: transaction.chainId,
          tokenId: transaction.tokenId,
        };
        headers['Authorization'] = `Bearer ${token}`;
        break;

      case 'enable_reviews':
        if (!token) return { success: false, error: 'Auth required' };
        url = `/api/agents/${transaction.agentId}/reviews/confirm`;
        body = {
          txHash: transaction.txHash,
          chainId: transaction.chainId,
        };
        headers['Authorization'] = `Bearer ${token}`;
        break;

      case 'review':
        // No auth required - verified on-chain
        url = `/api/marketplace/${transaction.ownerHandle}/${transaction.agentSlug}/reviews`;
        body = {
          reviewId: transaction.reviewId,
          txHash: transaction.txHash,
          chainId: transaction.chainId,
        };
        break;

      default:
        return { success: false, error: 'Unknown transaction type' };
    }

    const res = await fetch(url, {
      method: transaction.type === 'review' ? 'PATCH' : 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (res.ok) {
      clearPending(transaction.type);
      return { success: true };
    }

    // 409 = already confirmed with different txHash, clear to avoid infinite retries
    if (res.status === 409) {
      clearPending(transaction.type);
      return { success: false, error: 'Already confirmed with different transaction' };
    }

    // 503 = retry later (transaction not yet indexed)
    if (res.status === 503) {
      return { success: false, error: 'Transaction not yet confirmed' };
    }

    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || 'Failed to confirm' };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}
