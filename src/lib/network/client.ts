// Client-side network config hook
'use client';

import { useQuery } from '@tanstack/react-query';
import { useChainId } from 'wagmi';

export interface ClientNetworkConfig {
  chainId: number;
  network: string;
  name: string;
  rpcUrl: string;
  identityRegistryAddress: `0x${string}` | null;
  reputationRegistryAddress: `0x${string}` | null;
  blockExplorerUrl: string;
  isTestnet: boolean;
}

async function fetchAllNetworks(): Promise<ClientNetworkConfig[]> {
  const res = await fetch('/api/network');
  if (!res.ok) {
    throw new Error('Failed to fetch networks');
  }
  return res.json();
}

// Hook for all supported networks - fetched once and cached
export function useAllNetworks() {
  return useQuery({
    queryKey: ['all-networks'],
    queryFn: fetchAllNetworks,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

// Hook for current network config based on connected wallet chain
// Uses the all-networks cache and looks up by chainId
export function useNetworkConfig() {
  const chainId = useChainId();
  const { data: networks } = useAllNetworks();

  // Find the network config for the connected chain
  const networkConfig = networks?.find((n) => n.chainId === chainId);

  return {
    data: networkConfig,
    isLoading: !networks,
    chainId,
  };
}

// Helper to get explorer URL for a transaction
export function getExplorerTxUrl(blockExplorerUrl: string, txHash: string): string {
  return `${blockExplorerUrl}/tx/${txHash}`;
}

// Helper to get explorer URL for an address
export function getExplorerAddressUrl(blockExplorerUrl: string, address: string): string {
  return `${blockExplorerUrl}/address/${address}`;
}

// Helper to get explorer URL by chain ID (use with useAllNetworks)
export function getExplorerUrlForChain(
  networks: ClientNetworkConfig[] | undefined,
  chainId: number | null,
  txHash: string | null
): string | null {
  if (!networks || !chainId || !txHash) return null;
  const network = networks.find((n) => n.chainId === chainId);
  if (!network) return null;
  return getExplorerTxUrl(network.blockExplorerUrl, txHash);
}

// Helper to get network name by chain ID
export function getNetworkName(
  networks: ClientNetworkConfig[] | undefined,
  chainId: number | null
): string {
  if (!networks || !chainId) return `Chain ${chainId || 'Unknown'}`;
  const network = networks.find((n) => n.chainId === chainId);
  return network?.name || `Chain ${chainId}`;
}
