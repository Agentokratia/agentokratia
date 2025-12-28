'use client';

/**
 * React hook for signing exact scheme payments.
 *
 * Note: Escrow payments are now handled by useEscrowFetch which uses
 * the package's createEscrowFetch for automatic session management.
 * This hook is only needed for exact (pay-per-call) payments.
 */

import { useCallback } from 'react';
import { useAccount, useWalletClient, useChainId } from 'wagmi';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from '@x402/core/types';
import type { Address } from 'viem';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UsePaymentSignerOptions {
  // Reserved for future options
}

export interface UsePaymentSignerResult {
  signPayment: (paymentRequired: PaymentRequired, scheme?: 'exact') => Promise<PaymentPayload>;
  isConnected: boolean;
  address: Address | undefined;
}

export function usePaymentSigner(_options: UsePaymentSignerOptions = {}): UsePaymentSignerResult {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();

  // Create exact scheme on demand (stateless, no caching needed)
  const createExactScheme = useCallback(() => {
    if (!walletClient?.account) return null;
    return new ExactEvmScheme({
      address: walletClient.account.address,
      signTypedData: async (message) => {
        return walletClient.signTypedData({
          domain: message.domain as Parameters<typeof walletClient.signTypedData>[0]['domain'],
          types: message.types as Parameters<typeof walletClient.signTypedData>[0]['types'],
          primaryType: message.primaryType,
          message: message.message as Parameters<typeof walletClient.signTypedData>[0]['message'],
        });
      },
    });
  }, [walletClient]);

  const signPayment = useCallback(
    async (paymentRequired: PaymentRequired, _scheme?: 'exact'): Promise<PaymentPayload> => {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected');
      }

      // Find exact scheme requirements
      const requirements: PaymentRequirements | undefined = paymentRequired.accepts.find(
        (r) => r.scheme === 'exact'
      );

      if (!requirements) {
        throw new Error('Exact scheme not available for this payment');
      }

      // Validate network
      const walletNetwork = `eip155:${chainId}`;
      if (requirements.network !== walletNetwork) {
        throw new Error(
          `Wrong network. API requires ${requirements.network}, wallet is on ${walletNetwork}`
        );
      }

      // Create exact scheme and sign payment
      const exactScheme = createExactScheme();
      if (!exactScheme) {
        throw new Error('Failed to create exact scheme');
      }

      const partialPayload = await exactScheme.createPaymentPayload(
        paymentRequired.x402Version,
        requirements
      );

      return {
        ...partialPayload,
        resource: paymentRequired.resource,
        accepted: requirements,
      };
    },
    [address, walletClient, chainId, createExactScheme]
  );

  return {
    signPayment,
    isConnected,
    address,
  };
}
