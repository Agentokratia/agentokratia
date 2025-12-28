'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { callAgentWithPayment, type X402Response } from './client';
import { useEscrowFetch } from './useEscrowFetch';
import { usePaymentSigner } from './usePaymentSigner';
import { usdcUnitsToDollars } from '@/lib/utils/format';
import type { PaymentRequired } from '@x402/core/types';
import type { StoredSession } from '@agentokratia/x402-escrow/client';
import type { Address } from 'viem';

// Simple states - no need for implementation details like 'creating-session'
export type AgentCallState = 'idle' | 'loading' | 'success' | 'error';

export interface UseAgentCallOptions {
  /** Agent owner address - required to check for existing session */
  receiverAddress?: string;
  /** Custom deposit amount in atomic units (e.g., "10000000" for $10 USDC) */
  depositAmount?: string;
}

export interface CallOptions {
  /** Payment scheme to use */
  scheme?: 'exact' | 'escrow';
  /**
   * Session selection mode (only for escrow):
   * - 'auto' (default): Auto-select best available session
   * - 'new': Force create new session
   * - string: Use specific session by ID
   */
  session?: 'auto' | 'new' | string;
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
  allSessions: StoredSession[];
  hasActiveSession: boolean;

  // Actions
  call: (
    handle: string,
    slug: string,
    body: unknown,
    options?: CallOptions
  ) => Promise<X402Response<T>>;
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

  // Use escrowFetch from package for escrow payments (auto session handling)
  const { fetch: escrowFetch, scheme: escrowScheme } = useEscrowFetch({ depositAmount });

  // Keep usePaymentSigner for exact scheme payments only
  const { signPayment } = usePaymentSigner({});

  const [state, setState] = useState<AgentCallState>('idle');
  const [response, setResponse] = useState<X402Response<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<{
    agentName: string;
    priceUsdc: number;
    network: string;
  } | null>(null);

  // Session state - refreshed after calls and on mount
  const [allSessions, setAllSessions] = useState<StoredSession[]>([]);

  // Refresh sessions from storage
  const refreshSessions = useCallback(() => {
    if (receiverAddress && escrowScheme) {
      setAllSessions(escrowScheme.sessions.getAllForReceiver(receiverAddress as Address));
    }
  }, [receiverAddress, escrowScheme]);

  // Load sessions on mount and when receiver/scheme changes
  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  // Derived from allSessions
  const session = allSessions[0] ?? null;
  const hasActiveSession = allSessions.length > 0;

  const reset = useCallback(() => {
    setState('idle');
    setResponse(null);
    setError(null);
    setPaymentInfo(null);
  }, []);

  const call = useCallback(
    async (
      handle: string,
      slug: string,
      body: unknown,
      callOptions?: CallOptions
    ): Promise<X402Response<T>> => {
      reset();
      setState('loading');

      const url = `/api/v1/call/${handle}/${slug}`;

      // Determine which scheme to use
      // Auto-prefer escrow if there's an active session
      const schemeToUse = callOptions?.scheme ?? (hasActiveSession ? 'escrow' : undefined);

      try {
        // For escrow scheme, use the package's escrowFetch (with session option)
        if (schemeToUse === 'escrow' && escrowFetch) {
          const fetchResponse = await escrowFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            session: callOptions?.session, // Pass session option: 'auto', 'new', or session ID
          });

          // Extract our custom metadata from headers
          const requestId = fetchResponse.headers.get('X-Agentokratia-Request-Id') || undefined;
          const feedbackAuth = fetchResponse.headers.get('X-Feedback-Auth') || undefined;
          const feedbackExpiry = fetchResponse.headers.get('X-Feedback-Expires') || undefined;

          if (fetchResponse.ok) {
            const data = await fetchResponse.json();
            const result: X402Response<T> = {
              success: true,
              data,
              httpStatus: fetchResponse.status,
              requestId,
              feedbackAuth,
              feedbackExpiry,
            };
            setResponse(result);
            setState('success');
            refreshSessions();

            return result;
          }

          // Handle error response
          const errorData = await fetchResponse.json().catch(() => ({ error: 'Request failed' }));

          // Check for session errors and mark session as inactive
          if (
            (errorData.reason === 'session_inactive' || errorData.reason === 'session_expired') &&
            escrowScheme
          ) {
            const sessionIdToMark =
              callOptions?.session &&
              callOptions.session !== 'auto' &&
              callOptions.session !== 'new'
                ? callOptions.session
                : session?.sessionId;

            if (sessionIdToMark) {
              const status = errorData.reason === 'session_expired' ? 'expired' : 'inactive';
              escrowScheme.sessions.setStatus(sessionIdToMark, status);
              refreshSessions();
            }
          }

          const result: X402Response<T> = {
            success: false,
            error: errorData.error || errorData.reason || 'Request failed',
            errorDetails: errorData.details,
            errorReason: errorData.reason,
            httpStatus: fetchResponse.status,
            requestId,
          };
          setResponse(result);
          setState('error');
          setError(result.error || 'Call failed');
          return result;
        }

        // For exact scheme or when escrow not available, use manual flow
        const createPaymentPayload = async (paymentRequired: PaymentRequired) => {
          const firstAccept = paymentRequired.accepts[0];
          if (firstAccept) {
            setPaymentInfo({
              agentName: paymentRequired.resource.description || 'Agent',
              priceUsdc: usdcUnitsToDollars(firstAccept.amount),
              network: firstAccept.network,
            });
          }
          // For exact scheme, use signPayment
          return signPayment(paymentRequired, 'exact');
        };

        const result = await callAgentWithPayment<T>(handle, slug, body, createPaymentPayload);

        setResponse(result);
        setState(result.success ? 'success' : 'error');

        if (!result.success) {
          setError(result.error || 'Call failed');
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
    [reset, escrowFetch, escrowScheme, signPayment, hasActiveSession, session, refreshSessions]
  );

  return {
    state,
    response,
    error,
    paymentInfo,
    session,
    allSessions,
    hasActiveSession,
    call,
    reset,
    isLoading: state === 'loading',
    isConnected,
  };
}
