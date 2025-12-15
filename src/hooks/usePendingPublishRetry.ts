'use client';

import { useEffect, useState } from 'react';
import { useAuthStore, usePendingPublishStore, retryPendingPublish } from '@/lib/store';

interface RetryResult {
  agentId: string;
  tokenId: string;
}

/**
 * Hook that automatically retries pending publish confirmations on mount.
 * Use this on pages where the user might return after a failed publish.
 *
 * @param onSuccess - Callback when retry succeeds (optional, can be used to show toast/refresh data)
 * @returns { isRetrying, retryResult }
 */
export function usePendingPublishRetry(onSuccess?: (result: RetryResult) => void) {
  const { token } = useAuthStore();
  const { getPending } = usePendingPublishStore();
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<RetryResult | null>(null);

  useEffect(() => {
    const checkAndRetry = async () => {
      // Only run on client
      if (typeof window === 'undefined') return;

      // Need auth token
      if (!token) return;

      // Check for pending
      const pending = getPending();
      if (!pending) return;

      setIsRetrying(true);

      const result = await retryPendingPublish(token);

      setIsRetrying(false);

      if (result.success && result.agentId && result.tokenId) {
        const successResult = { agentId: result.agentId, tokenId: result.tokenId };
        setRetryResult(successResult);
        onSuccess?.(successResult);
      }
    };

    // Small delay to ensure hydration completes
    const timeout = setTimeout(checkAndRetry, 1000);
    return () => clearTimeout(timeout);
  }, [token, getPending, onSuccess]);

  return { isRetrying, retryResult };
}
