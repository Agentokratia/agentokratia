'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useAccount, useWalletClient, useChainId } from 'wagmi';
import { EscrowScheme, type StoredSession } from '@agentokratia/x402-escrow/client';
import type { PaymentPayload, PaymentRequired } from '@x402/core/types';
import type { WalletClient, Address } from 'viem';
import { SESSION_DURATION_SECONDS, REFUND_WINDOW_SECONDS } from './constants';

// Adapt wagmi WalletClient to @agentokratia/x402-escrow signer interface
function createWalletSigner(walletClient: WalletClient) {
  return {
    address: walletClient.account!.address,
    async signTypedData(params: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }): Promise<`0x${string}`> {
      return walletClient.signTypedData({
        account: walletClient.account!,
        domain: params.domain as Parameters<WalletClient['signTypedData']>[0]['domain'],
        types: params.types as Parameters<WalletClient['signTypedData']>[0]['types'],
        primaryType: params.primaryType,
        message: params.message as Parameters<WalletClient['signTypedData']>[0]['message'],
      });
    },
  };
}

export interface UsePaymentSignerOptions {
  /** Custom deposit amount in atomic units (e.g., "10000000" for $10 USDC) */
  depositAmount?: string;
}

export interface UsePaymentSignerResult {
  signPayment: (paymentRequired: PaymentRequired) => Promise<PaymentPayload>;
  isConnected: boolean;
  address: Address | undefined;
  getSession: (receiver: string) => StoredSession | null;
  hasValidSession: (receiver: string, minAmount?: string) => boolean;
  updateSessionBalance: (sessionId: string, balance: string) => void;
}

export function usePaymentSigner(options: UsePaymentSignerOptions = {}): UsePaymentSignerResult {
  const { depositAmount } = options;
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();

  // Track current scheme key (address + depositAmount)
  const schemeRef = useRef<{
    scheme: EscrowScheme;
    address: string;
    depositAmount: string | undefined;
  } | null>(null);

  // Create or reuse scheme for current wallet and depositAmount
  // Sessions persist in localStorage, so recreating scheme is safe
  const scheme = useMemo(() => {
    if (!walletClient?.account) return null;

    const currentAddress = walletClient.account.address;

    // Reuse existing scheme if same wallet AND same depositAmount
    if (
      schemeRef.current?.address === currentAddress &&
      schemeRef.current?.depositAmount === depositAmount
    ) {
      return schemeRef.current.scheme;
    }

    // Create new scheme with current depositAmount
    const signer = createWalletSigner(walletClient);
    const newScheme = new EscrowScheme(signer, {
      storage: 'localStorage',
      sessionDuration: SESSION_DURATION_SECONDS,
      refundWindow: REFUND_WINDOW_SECONDS,
      depositAmount,
    });

    schemeRef.current = { scheme: newScheme, address: currentAddress, depositAmount };
    return newScheme;
  }, [walletClient, depositAmount]);

  const signPayment = useCallback(
    async (paymentRequired: PaymentRequired): Promise<PaymentPayload> => {
      if (!address || !walletClient || !scheme) {
        throw new Error('Wallet not connected');
      }

      const requirements = paymentRequired.accepts[0];
      if (!requirements) {
        throw new Error('No payment requirements found');
      }

      const expectedNetwork = `eip155:${chainId}`;
      if (requirements.network !== expectedNetwork) {
        throw new Error(`Wrong network. Expected ${requirements.network}, got ${expectedNetwork}`);
      }

      const partialPayload = await scheme.createPaymentPayload(
        paymentRequired.x402Version,
        requirements
      );

      return {
        ...partialPayload,
        resource: paymentRequired.resource,
        accepted: requirements,
      };
    },
    [address, walletClient, chainId, scheme]
  );

  // Simple session accessors - no wrapper abstraction
  const getSession = useCallback(
    (receiver: string): StoredSession | null => {
      return scheme?.sessions.getForReceiver(receiver as Address) ?? null;
    },
    [scheme]
  );

  const hasValidSession = useCallback(
    (receiver: string, minAmount?: string): boolean => {
      return scheme?.sessions.hasValid(receiver as Address, minAmount) ?? false;
    },
    [scheme]
  );

  // Update session balance after successful payment
  const updateSessionBalance = useCallback(
    (sessionId: string, balance: string): void => {
      scheme?.sessions.updateBalance(sessionId, balance);
    },
    [scheme]
  );

  return {
    signPayment,
    isConnected,
    address,
    getSession,
    hasValidSession,
    updateSessionBalance,
  };
}
