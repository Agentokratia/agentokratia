/**
 * On-chain ownership verification utilities
 *
 * These functions verify NFT ownership from the Identity Registry
 * to ensure the correct user has access to agent management.
 *
 * Pattern: Verify on write, cache on read
 * - Use isOnChainOwner() before any protected write operation
 * - Use getOwnedTokenIds() for wallet scanning (dashboard)
 */

import { createPublicClient, http, parseAbiItem, type PublicClient } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { IDENTITY_REGISTRY_ABI } from '@/lib/erc8004/contracts';
import { getNetworkConfig, type NetworkConfig } from '@/lib/network';

// Transfer event signature for ERC-721
const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
);

/**
 * Get a public client for the specified chain
 */
function getClient(chainId: number, rpcUrl: string) {
  const chain = chainId === 84532 ? baseSepolia : base;
  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

/**
 * Verify if an address owns a specific token on-chain
 * Use this before any protected write operation (update, delete, etc.)
 */
export async function isOnChainOwner(
  tokenId: string,
  address: string,
  chainId: number
): Promise<boolean> {
  try {
    const network = await getNetworkConfig(chainId);
    if (!network.identityRegistryAddress) {
      console.error(`[Ownership] No identity registry for chain ${chainId}`);
      return false;
    }

    const client = getClient(chainId, network.rpcUrl);

    const owner = await client.readContract({
      address: network.identityRegistryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)],
    });

    return (owner as string).toLowerCase() === address.toLowerCase();
  } catch (error) {
    console.error('[Ownership] Failed to verify ownership:', error);
    return false;
  }
}

/**
 * Get the current on-chain owner of a token
 */
export async function getOnChainOwner(
  tokenId: string,
  chainId: number
): Promise<string | null> {
  try {
    const network = await getNetworkConfig(chainId);
    if (!network.identityRegistryAddress) {
      return null;
    }

    const client = getClient(chainId, network.rpcUrl);

    const owner = await client.readContract({
      address: network.identityRegistryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)],
    });

    return owner as string;
  } catch (error) {
    console.error('[Ownership] Failed to get owner:', error);
    return null;
  }
}

/**
 * Get all token IDs owned by an address by scanning Transfer events
 * Use this for the "Claimable Agents" section in dashboard
 */
export async function getOwnedTokenIds(
  address: string,
  chainId: number
): Promise<string[]> {
  try {
    const network = await getNetworkConfig(chainId);
    if (!network.identityRegistryAddress) {
      return [];
    }

    const client = getClient(chainId, network.rpcUrl);
    const fromBlock = BigInt(network.deploymentBlock || 0);

    // Get all Transfer events TO this address
    const transfersIn = await client.getLogs({
      address: network.identityRegistryAddress,
      event: TRANSFER_EVENT,
      args: { to: address as `0x${string}` },
      fromBlock,
    });

    // Get all Transfer events FROM this address
    const transfersOut = await client.getLogs({
      address: network.identityRegistryAddress,
      event: TRANSFER_EVENT,
      args: { from: address as `0x${string}` },
      fromBlock,
    });

    // Calculate net ownership
    const owned = new Set<string>();
    for (const log of transfersIn) {
      if (log.args.tokenId) {
        owned.add(log.args.tokenId.toString());
      }
    }
    for (const log of transfersOut) {
      if (log.args.tokenId) {
        owned.delete(log.args.tokenId.toString());
      }
    }

    return Array.from(owned);
  } catch (error) {
    console.error('[Ownership] Failed to get owned token IDs:', error);
    return [];
  }
}

/**
 * Batch verify ownership for multiple tokens using multicall
 * More efficient than individual calls when checking many agents
 */
export async function batchVerifyOwnership(
  tokenIds: string[],
  chainId: number
): Promise<Map<string, string>> {
  const ownerMap = new Map<string, string>();

  if (tokenIds.length === 0) {
    return ownerMap;
  }

  try {
    const network = await getNetworkConfig(chainId);
    if (!network.identityRegistryAddress) {
      return ownerMap;
    }

    const client = getClient(chainId, network.rpcUrl);

    const results = await client.multicall({
      contracts: tokenIds.map(tokenId => ({
        address: network.identityRegistryAddress as `0x${string}`,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      })),
    });

    results.forEach((result, index) => {
      if (result.status === 'success' && result.result) {
        ownerMap.set(tokenIds[index], String(result.result).toLowerCase());
      }
    });

    return ownerMap;
  } catch (error) {
    console.error('[Ownership] Batch verification failed:', error);
    return ownerMap;
  }
}

export type OwnershipStatus = 'verified' | 'transferred' | 'draft' | 'error';
