'use client';

import { useState, useCallback, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { callAgentWithPayment, type X402Response } from './client';
import { usePaymentSigner } from './usePaymentSigner';
import { usdcUnitsToDollars } from '@/lib/utils/format';
import type { PaymentRequired } from '@x402/core/types';
import type { StoredSession } from '@agentokratia/x402-escrow/client';

// Simple states - no need for implementation details like 'creating-session'
export type AgentCallState = 'idle' | 'loading' | 'success' | 'error';

export interface UseAgentCallOptions {
  /** Agent owner address - required to check for existing session */
  receiverAddress?: string;
  /** Custom deposit amount in atomic units (e.g., "10000000" for $10 USDC) */
  depositAmount?: string;
}

export interface UseAgentCallResult<T = unknown> {
  state: AgentCallState;
  response: X402Response<T> | null;
  error: string | null;
  paymentInfo: {
    agentName: string;
    priceUsdc: number;
    network: string;
  } | null;

  // Session info - available when receiverAddress is provided
  session: StoredSession | null;
  hasActiveSession: boolean;

  // Actions
  call: (handle: string, slug: string, body: unknown) => Promise<X402Response<T>>;
  reset: () => void;

  // Computed
  isLoading: boolean;
  isConnected: boolean;
}

export function useAgentCall<T = unknown>(
  options: UseAgentCallOptions = {}
): UseAgentCallResult<T> {
  const { receiverAddress, depositAmount } = options;
  const { isConnected } = useAccount();
  const { signPayment, getSession, hasValidSession, updateSessionBalance } = usePaymentSigner({
    depositAmount,
  });

  const [state, setState] = useState<AgentCallState>('idle');
  const [response, setResponse] = useState<X402Response<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<{
    agentName: string;
    priceUsdc: number;
    network: string;
  } | null>(null);

  // Session info - memoized to avoid unnecessary lookups
  const session = useMemo(
    () => (receiverAddress ? getSession(receiverAddress) : null),
    [receiverAddress, getSession]
  );

  const hasActiveSession = useMemo(
    () => (receiverAddress ? hasValidSession(receiverAddress) : false),
    [receiverAddress, hasValidSession]
  );

  const reset = useCallback(() => {
    setState('idle');
    setResponse(null);
    setError(null);
    setPaymentInfo(null);
  }, []);

  const call = useCallback(
    async (handle: string, slug: string, body: unknown): Promise<X402Response<T>> => {
      reset();
      setState('loading');

      try {
        const createPaymentPayload = async (paymentRequired: PaymentRequired) => {
          const firstAccept = paymentRequired.accepts[0];
          if (firstAccept) {
            setPaymentInfo({
              agentName: paymentRequired.resource.description || 'Agent',
              priceUsdc: usdcUnitsToDollars(firstAccept.amount),
              network: firstAccept.network,
            });
          }
          return signPayment(paymentRequired);
        };

        const result = await callAgentWithPayment<T>(handle, slug, body, createPaymentPayload);

        setResponse(result);
        setState(result.success ? 'success' : 'error');

        if (!result.success) {
          setError(result.error || 'Call failed');
        }

        // Update session balance in localStorage after successful escrow payment
        if (result.success && result.sessionInfo?.sessionId && result.sessionInfo?.balance) {
          updateSessionBalance(result.sessionInfo.sessionId, result.sessionInfo.balance);
        }

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setState('error');
        setError(errorMessage);
        const result: X402Response<T> = { success: false, error: errorMessage };
        setResponse(result);
        return result;
      }
    },
    [reset, signPayment, updateSessionBalance]
  );

  return {
    state,
    response,
    error,
    paymentInfo,
    session,
    hasActiveSession,
    call,
    reset,
    isLoading: state === 'loading',
    isConnected,
  };
}
