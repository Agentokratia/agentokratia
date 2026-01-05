'use client';

/**
 * React hook for x402 escrow payments using the package's createEscrowFetch.
 *
 * This hook provides:
 * - Wrapped fetch with automatic 402 payment handling
 * - Automatic session storage via withSessionExtraction
 * - Session selection options (auto, new, specific ID)
 *
 * @example
 * ```typescript
 * const { fetch: escrowFetch, scheme, isReady } = useEscrowFetch({ depositAmount });
 *
 * // Auto-select best session (default)
 * await escrowFetch('/api/v1/call/agent/endpoint', {
 *   method: 'POST',
 *   body: JSON.stringify(data),
 * });
 *
 * // Force new session
 * await escrowFetch(url, { session: 'new', method: 'POST', body });
 *
 * // Use specific session
 * await escrowFetch(url, { session: 'session-abc-123', method: 'POST', body });
 *
 * // List sessions for a receiver
 * const sessions = scheme?.sessions.getAllForReceiver(receiverAddress);
 * ```
 */

import { useMemo, useRef } from 'react';
import { useWalletClient } from 'wagmi';
import {
  createEscrowFetch,
  type EscrowScheme,
  type EscrowFetch,
} from '@agentokratia/x402-escrow/client';
// Use local x402 types for compatibility with local package linking
import type { x402Client } from '@x402/core/client';
import { SESSION_DURATION_SECONDS, REFUND_WINDOW_SECONDS } from './constants';

export interface UseEscrowFetchOptions {
  /** Custom deposit amount in atomic units (e.g., "10000000" for $10 USDC) */
  depositAmount?: string;
}

export interface UseEscrowFetchResult {
  /** Wrapped fetch with session options: { session: 'auto' | 'new' | sessionId } */
  fetch: EscrowFetch | null;
  /** Access to escrow scheme for session management */
  scheme: EscrowScheme | null;
  /** x402 client for adding hooks */
  x402: x402Client | null;
  /** Whether the fetch is ready to use (wallet connected) */
  isReady: boolean;
}

export function useEscrowFetch(options: UseEscrowFetchOptions = {}): UseEscrowFetchResult {
  const { depositAmount } = options;
  const { data: walletClient } = useWalletClient();

  // Cache the result to avoid recreating on every render with same params
  const cacheRef = useRef<{
    address: string;
    depositAmount: string | undefined;
    result: { fetch: EscrowFetch; scheme: EscrowScheme; x402: x402Client };
  } | null>(null);

  const result = useMemo(() => {
    if (!walletClient?.account) {
      return { fetch: null, scheme: null, x402: null, isReady: false };
    }

    const currentAddress = walletClient.account.address;

    // Return cached result if params match
    if (
      cacheRef.current?.address === currentAddress &&
      cacheRef.current?.depositAmount === depositAmount
    ) {
      return { ...cacheRef.current.result, isReady: true };
    }

    // Create new escrow fetch with the package's helper
    // Type assertion needed for local package linking (viem versions may differ)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { fetch, scheme, x402 } = createEscrowFetch(walletClient as any, {
      storage: 'localStorage',
      sessionDuration: SESSION_DURATION_SECONDS,
      refundWindow: REFUND_WINDOW_SECONDS,
      depositAmount,
    });

    // Cache the result (cast x402 to local type for compatibility)
    const castedResult = {
      fetch,
      scheme,
      x402: x402 as unknown as x402Client,
    };

    cacheRef.current = {
      address: currentAddress,
      depositAmount,
      result: castedResult,
    };

    return { ...castedResult, isReady: true };
  }, [walletClient, depositAmount]);

  return result;
}
