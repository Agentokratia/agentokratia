'use client';

import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import {
  callAgentWithPayment,
  type X402Response
} from './client';
import { usePaymentSigner } from './usePaymentSigner';
import { usdcUnitsToDollars } from '@/lib/utils/format';
import type { PaymentRequired } from '@x402/core/types';

export type AgentCallState = 'idle' | 'loading' | 'signing' | 'processing' | 'success' | 'error';

export interface UseAgentCallResult<T = unknown> {
  // State
  state: AgentCallState;
  response: X402Response<T> | null;
  error: string | null;
  paymentInfo: {
    agentName: string;
    priceUsdc: number;
    network: string;
  } | null;

  // Actions
  call: (handle: string, slug: string, body: unknown) => Promise<X402Response<T>>;
  reset: () => void;

  // Computed
  isLoading: boolean;
  needsPayment: boolean;
  isConnected: boolean;
}

export function useAgentCall<T = unknown>(): UseAgentCallResult<T> {
  const { isConnected } = useAccount();
  const { signPayment } = usePaymentSigner();

  const [state, setState] = useState<AgentCallState>('idle');
  const [response, setResponse] = useState<X402Response<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<{
    agentName: string;
    priceUsdc: number;
    network: string;
  } | null>(null);

  const reset = useCallback(() => {
    setState('idle');
    setResponse(null);
    setError(null);
    setPaymentInfo(null);
  }, []);

  const call = useCallback(async (handle: string, slug: string, body: unknown): Promise<X402Response<T>> => {
    reset();
    setState('loading');
    setError(null);

    try {
      // Create payment signer function
      const createPaymentPayload = async (paymentRequired: PaymentRequired) => {
        // Extract payment info from the 402 response
        const firstAccept = paymentRequired.accepts[0];
        if (firstAccept) {
          setPaymentInfo({
            agentName: paymentRequired.resource.description || 'Agent',
            priceUsdc: usdcUnitsToDollars(firstAccept.amount),
            network: firstAccept.network,
          });
        }
        setState('signing');
        return signPayment(paymentRequired);
      };

      const result = await callAgentWithPayment<T>(handle, slug, body, createPaymentPayload);

      setResponse(result);

      if (result.success) {
        setState('success');
      } else {
        setState('error');
        setError(result.error || 'Call failed');
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setState('error');
      setError(errorMessage);
      const result: X402Response<T> = {
        success: false,
        error: errorMessage,
      };
      setResponse(result);
      return result;
    }
  }, [reset, signPayment]);

  return {
    state,
    response,
    error,
    paymentInfo,
    call,
    reset,
    isLoading: state === 'loading' || state === 'signing' || state === 'processing',
    needsPayment: response?.paymentRequired !== undefined,
    isConnected,
  };
}
