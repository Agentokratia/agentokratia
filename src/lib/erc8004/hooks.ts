'use client';

// React hooks for ERC-8004 agent registration

import { useWriteContract, useWaitForTransactionReceipt, useAccount, useChainId, useEstimateGas, useGasPrice, useReadContract } from 'wagmi';
import { parseEventLogs, encodeFunctionData, type Log } from 'viem';
import { IDENTITY_REGISTRY_ABI } from './contracts';
import { useNetworkConfig } from '@/lib/network/client';

// Minimal log type for event parsing
type EventLog = Pick<Log, 'topics' | 'data' | 'address' | 'blockHash' | 'blockNumber' | 'transactionHash' | 'transactionIndex' | 'logIndex' | 'removed'>;

// ERC-721 Transfer event ABI for fallback parsing
const ERC721_TRANSFER_ABI = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: true, name: 'tokenId', type: 'uint256' },
    ],
  },
] as const;

// Hook for registering an agent on-chain
export function useRegisterAgent() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { data: networkConfig } = useNetworkConfig();
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess,
    data: receipt,
  } = useWaitForTransactionReceipt({ hash });

  const register = async (tokenURI: string): Promise<`0x${string}`> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    if (!networkConfig?.identityRegistryAddress) {
      throw new Error(`Chain ${chainId} not supported for agent registration`);
    }

    const txHash = await writeContractAsync({
      address: networkConfig.identityRegistryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args: [tokenURI],
    });

    return txHash;
  };

  return {
    register,
    hash,
    chainId,
    isPending,
    isConfirming,
    isSuccess,
    receipt,
    error,
  };
}

// Parse tokenId from transaction receipt logs
// Tries multiple methods: AgentRegistered event, Transfer event, raw log parsing
export function parseTokenIdFromLogs(logs: readonly { topics: readonly `0x${string}`[]; data: `0x${string}` }[]): bigint | null {
  // Convert to proper Log type for viem parsing
  const eventLogs: EventLog[] = logs.map((log, index) => ({
    topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    data: log.data,
    address: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    blockHash: null,
    blockNumber: null,
    transactionHash: null,
    transactionIndex: index,
    logIndex: index,
    removed: false,
  }));

  // Method 1: Try AgentRegistered event
  try {
    const parsed = parseEventLogs({
      abi: IDENTITY_REGISTRY_ABI,
      logs: eventLogs,
      eventName: 'AgentRegistered',
    });

    if (parsed.length > 0 && 'agentId' in parsed[0].args) {
      return parsed[0].args.agentId as bigint;
    }
  } catch {
    // Continue to next method
  }

  // Method 2: Try ERC-721 Transfer event (minting is Transfer from 0x0)
  try {
    const parsed = parseEventLogs({
      abi: ERC721_TRANSFER_ABI,
      logs: eventLogs,
      eventName: 'Transfer',
    });

    // Look for mint (from address is zero)
    const mintEvent = parsed.find(p =>
      'from' in p.args &&
      p.args.from === '0x0000000000000000000000000000000000000000'
    );

    if (mintEvent && 'tokenId' in mintEvent.args) {
      return mintEvent.args.tokenId as bigint;
    }
  } catch {
    // Continue to next method
  }

  // Method 3: Try to parse tokenId from raw log topics
  // Transfer event: topics[0]=sig, topics[1]=from, topics[2]=to, topics[3]=tokenId
  // AgentRegistered: topics[0]=sig, topics[1]=agentId, topics[2]=owner
  try {
    // Known event signatures
    const TRANSFER_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const AGENT_REGISTERED_SIG = '0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a';

    for (const log of logs) {
      const eventSig = log.topics[0]?.toLowerCase();

      // Check for Transfer event (tokenId in topics[3])
      if (eventSig === TRANSFER_SIG && log.topics.length >= 4) {
        const tokenId = BigInt(log.topics[3]);
        if (tokenId > BigInt(0) && tokenId < BigInt(1000000000)) {
          return tokenId;
        }
      }

      // Check for AgentRegistered event (agentId in topics[1])
      if (eventSig === AGENT_REGISTERED_SIG && log.topics.length >= 2) {
        const tokenId = BigInt(log.topics[1]);
        if (tokenId > BigInt(0) && tokenId < BigInt(1000000000)) {
          return tokenId;
        }
      }
    }
  } catch {
    // All methods failed
  }

  return null;
}

// Hook to check if reviews are enabled for an agent on-chain
// Uses isApprovedForAll to check if the platform signer is approved
export function useReviewsEnabled(
  ownerAddress: `0x${string}` | undefined,
  feedbackSignerAddress: string | null | undefined,
  agentChainId: number | null | undefined
) {
  const { data: networkConfig } = useNetworkConfig();
  const chainId = useChainId();

  // Only query if we have all required data and are on the right chain
  const shouldQuery = Boolean(
    ownerAddress &&
    feedbackSignerAddress &&
    agentChainId &&
    networkConfig?.identityRegistryAddress &&
    chainId === agentChainId
  );

  const { data: isApproved, isLoading, refetch } = useReadContract({
    address: networkConfig?.identityRegistryAddress as `0x${string}`,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'isApprovedForAll',
    args: shouldQuery ? [ownerAddress!, feedbackSignerAddress as `0x${string}`] : undefined,
    // Explicit scope key ensures re-query when feedbackSignerAddress changes
    scopeKey: feedbackSignerAddress ?? undefined,
    query: {
      enabled: shouldQuery,
      // Don't cache - always check fresh on-chain state
      staleTime: 0,
      gcTime: 0,
    },
  });

  return {
    reviewsEnabled: Boolean(isApproved),
    isLoading: shouldQuery ? isLoading : false,
    // If we can't check (wrong chain, no signer, etc), return unknown
    isUnknown: !shouldQuery,
    refetch,
  };
}

// Hook to estimate gas fee for registration
export function useEstimateRegistrationFee() {
  const { address } = useAccount();
  const { data: networkConfig } = useNetworkConfig();
  const contractAddress = networkConfig?.identityRegistryAddress;

  // Encode a sample call to estimate gas
  const data = contractAddress && address ? encodeFunctionData({
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'register',
    args: ['ipfs://QmSampleTokenURIForGasEstimation'],
  }) : undefined;

  const { data: gasEstimate } = useEstimateGas({
    to: contractAddress ?? undefined,
    data,
    account: address,
  });

  const { data: gasPrice } = useGasPrice();

  // Calculate fee in ETH
  const estimatedFee = gasEstimate && gasPrice
    ? Number(gasEstimate * gasPrice) / 1e18
    : null;

  // Format for display (Base has very low fees)
  const formattedFee = estimatedFee !== null
    ? estimatedFee < 0.0001
      ? '< $0.01'
      : `~$${(estimatedFee * 2000).toFixed(2)}` // Rough ETH price estimate
    : null;

  return {
    gasEstimate,
    gasPrice,
    estimatedFee,
    formattedFee,
  };
}
