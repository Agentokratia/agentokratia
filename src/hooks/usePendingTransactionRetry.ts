'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/store';
import {
  usePendingTransactionStore,
  retryPendingTransaction,
  TransactionType,
  PendingTransaction,
} from '@/lib/store/pendingTransactionStore';

interface RetryResult {
  type: TransactionType;
  success: boolean;
  error?: string;
}

/**
 * Hook that automatically retries pending transaction confirmations on mount.
 * Handles publish, enable_reviews, and review transactions.
 */
export function usePendingTransactionRetry(
  onSuccess?: (result: RetryResult) => void
) {
  const { token } = useAuthStore();
  const { getAllPending } = usePendingTransactionStore();
  const [isRetrying, setIsRetrying] = useState(false);
  const [results, setResults] = useState<RetryResult[]>([]);

  const retryAll = useCallback(async () => {
    const pending = getAllPending();
    if (pending.length === 0) return;

    setIsRetrying(true);
    const newResults: RetryResult[] = [];

    for (const tx of pending) {
      // Skip auth-required types if no token
      if ((tx.type === 'publish' || tx.type === 'enable_reviews') && !token) {
        continue;
      }

      const result = await retryPendingTransaction(tx, token || undefined);
      const retryResult: RetryResult = {
        type: tx.type,
        success: result.success,
        error: result.error,
      };

      newResults.push(retryResult);

      if (result.success) {
        onSuccess?.(retryResult);
      }
    }

    setResults(newResults);
    setIsRetrying(false);
  }, [token, getAllPending, onSuccess]);

  useEffect(() => {
    // Small delay to ensure hydration completes
    const timeout = setTimeout(retryAll, 1000);
    return () => clearTimeout(timeout);
  }, [retryAll]);

  return { isRetrying, results, retryAll };
}

/**
 * Hook to retry a specific transaction type
 */
export function usePendingTransactionRetryByType(
  type: TransactionType,
  onSuccess?: () => void
) {
  const { token } = useAuthStore();
  const { getPending } = usePendingTransactionStore();
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    const checkAndRetry = async () => {
      const pending = getPending(type);
      if (!pending) return;

      // Skip auth-required types if no token
      if ((type === 'publish' || type === 'enable_reviews') && !token) {
        return;
      }

      setIsRetrying(true);
      const result = await retryPendingTransaction(pending, token || undefined);
      setIsRetrying(false);

      if (result.success) {
        onSuccess?.();
      }
    };

    const timeout = setTimeout(checkAndRetry, 1000);
    return () => clearTimeout(timeout);
  }, [type, token, getPending, onSuccess]);

  return { isRetrying };
}
