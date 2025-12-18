'use client';

import { useCallback } from 'react';
import { useAccount, useWalletClient, useChainId } from 'wagmi';
import { ExactEvmScheme } from '@x402/evm';
import type { PaymentPayload, PaymentRequired } from '@x402/core/types';
import type { WalletClient } from 'viem';

// Adapt wagmi WalletClient to @x402/evm ClientEvmSigner interface
function createClientEvmSigner(walletClient: WalletClient) {
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
        domain: params.domain as any,
        types: params.types as any,
        primaryType: params.primaryType as any,
        message: params.message as any,
      });
    },
  };
}

export interface UsePaymentSignerResult {
  signPayment: (paymentRequired: PaymentRequired) => Promise<PaymentPayload>;
  isConnected: boolean;
  address: `0x${string}` | undefined;
}

export function usePaymentSigner(): UsePaymentSignerResult {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();

  const signPayment = useCallback(
    async (paymentRequired: PaymentRequired): Promise<PaymentPayload> => {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected');
      }

      // Get the first accepted payment scheme
      const requirements = paymentRequired.accepts[0];
      if (!requirements) {
        throw new Error('No payment requirements found');
      }

      // Validate we support this network
      const expectedNetwork = `eip155:${chainId}`;
      if (requirements.network !== expectedNetwork) {
        throw new Error(`Wrong network. Expected ${requirements.network}, got ${expectedNetwork}`);
      }

      // Create the EVM signer adapter
      const signer = createClientEvmSigner(walletClient);

      // Create payment payload using the official scheme
      const scheme = new ExactEvmScheme(signer);
      const partialPayload = await scheme.createPaymentPayload(
        paymentRequired.x402Version,
        requirements
      );

      // Construct full PaymentPayload
      const paymentPayload: PaymentPayload = {
        ...partialPayload,
        resource: paymentRequired.resource,
        accepted: requirements,
      };

      return paymentPayload;
    },
    [address, walletClient, chainId]
  );

  return {
    signPayment,
    isConnected,
    address,
  };
}
