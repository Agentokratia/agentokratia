// Network configuration - reads from DB only (no hardcoded fallbacks)
import { supabaseAdmin } from '@/lib/db/supabase';
import type { Network } from '@x402/core/types';

export interface NetworkConfig {
  chainId: number;
  network: Network;
  name: string;
  rpcUrl: string;
  usdcAddress: `0x${string}`;
  identityRegistryAddress: `0x${string}` | null;
  reputationRegistryAddress: `0x${string}` | null;
  blockExplorerUrl: string;
  deploymentBlock: number | null;  // Block when Identity Registry was deployed
  isTestnet: boolean;
  // EIP-712 domain for USDC (required for EIP-3009 signatures)
  usdcEip712Domain: {
    name: string;
    version: string;
  };
}

// Cache network config (refreshed on server restart)
let networkCache: Map<number, NetworkConfig> | null = null;

async function loadNetworks(): Promise<Map<number, NetworkConfig>> {
  const { data, error } = await supabaseAdmin
    .from('supported_networks')
    .select('*')
    .eq('is_enabled', true);

  if (error) {
    throw new Error(`Failed to load networks from database: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('No enabled networks found in supported_networks table');
  }

  const cache = new Map<number, NetworkConfig>();
  for (const row of data) {
    // Validate required fields
    if (!row.usdc_eip712_domain) {
      throw new Error(`Network ${row.chain_id} missing usdc_eip712_domain in database`);
    }
    if (!row.rpc_url) {
      throw new Error(`Network ${row.chain_id} missing rpc_url in database`);
    }

    cache.set(row.chain_id, {
      chainId: row.chain_id,
      network: row.network as Network,
      name: row.name,
      rpcUrl: row.rpc_url,
      usdcAddress: row.usdc_address as `0x${string}`,
      identityRegistryAddress: row.identity_registry_address as `0x${string}` | null,
      reputationRegistryAddress: row.reputation_registry_address as `0x${string}` | null,
      blockExplorerUrl: row.block_explorer_url,
      deploymentBlock: row.deployment_block ? Number(row.deployment_block) : null,
      isTestnet: row.is_testnet,
      usdcEip712Domain: row.usdc_eip712_domain,
    });
  }

  return cache;
}

export async function getNetworkConfig(chainId: number): Promise<NetworkConfig> {
  if (!networkCache) {
    networkCache = await loadNetworks();
  }

  const config = networkCache.get(chainId);
  if (!config) {
    throw new Error(`Network ${chainId} not supported or not enabled`);
  }

  return config;
}

export async function getAllNetworks(): Promise<NetworkConfig[]> {
  if (!networkCache) {
    networkCache = await loadNetworks();
  }
  return Array.from(networkCache.values());
}

// Get default network (first enabled network from DB)
export async function getDefaultNetworkConfig(): Promise<NetworkConfig> {
  const networks = await getAllNetworks();
  if (networks.length === 0) {
    throw new Error('No networks configured');
  }
  return networks[0];
}

export function getExplorerTxUrl(config: NetworkConfig, txHash: string): string {
  return `${config.blockExplorerUrl}/tx/${txHash}`;
}

export function getExplorerAddressUrl(config: NetworkConfig, address: string): string {
  return `${config.blockExplorerUrl}/address/${address}`;
}

// Clear cache (useful for testing or admin updates)
export function clearNetworkCache(): void {
  networkCache = null;
}
