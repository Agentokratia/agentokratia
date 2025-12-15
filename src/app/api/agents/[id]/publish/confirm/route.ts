import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/db/supabase';
import { createPublicClient, http, parseEventLogs, type TransactionReceipt } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { IDENTITY_REGISTRY_ABI } from '@/lib/erc8004/contracts';
import { getNetworkConfig } from '@/lib/network';
import { publishConfirmSchema, validate } from '@/lib/validations/schemas';
import { withRetry } from '@/lib/utils/retry';

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

// Server-side log parsing - tries multiple methods
function parseTokenIdFromLogs(logs: readonly { topics: readonly `0x${string}`[]; data: `0x${string}` }[]): bigint | null {
  // Method 1: Try AgentRegistered event
  try {
    const parsed = parseEventLogs({
      abi: IDENTITY_REGISTRY_ABI,
      logs: logs as any,
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
      logs: logs as any,
      eventName: 'Transfer',
    });

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
  try {
    const TRANSFER_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const AGENT_REGISTERED_SIG = '0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a';

    for (const log of logs) {
      const eventSig = log.topics[0]?.toLowerCase();

      if (eventSig === TRANSFER_SIG && log.topics.length >= 4) {
        const tokenId = BigInt(log.topics[3]);
        if (tokenId > BigInt(0) && tokenId < BigInt(1000000000)) {
          return tokenId;
        }
      }

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

// POST /api/agents/[id]/publish/confirm
// Step 2: After user signs the transaction, verify and update DB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthenticatedUser(request);

  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  // Zod validation
  const validation = validate(publishConfirmSchema, body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { txHash, chainId, tokenId: clientTokenId } = validation.data;

  // Get network config from DB
  let networkConfig;
  try {
    networkConfig = await getNetworkConfig(chainId);
  } catch {
    return NextResponse.json(
      { error: 'Unsupported chain' },
      { status: 400 }
    );
  }

  if (!networkConfig.identityRegistryAddress) {
    return NextResponse.json(
      { error: 'Identity registry not deployed on this network' },
      { status: 400 }
    );
  }

  // Get agent with ownership check
  const { data: agent, error } = await supabaseAdmin
    .from('agents')
    .select('*')
    .eq('id', id)
    .eq('owner_id', auth.userId)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // IDEMPOTENCY CHECK: If already published, check if it's the same transaction
  if (agent.erc8004_token_id) {
    if (agent.erc8004_tx_hash === txHash) {
      return NextResponse.json({
        success: true,
        tokenId: agent.erc8004_token_id,
        txHash: agent.erc8004_tx_hash,
        chainId: agent.erc8004_chain_id,
        idempotent: true,
      });
    }

    return NextResponse.json(
      { error: 'Agent already published with a different transaction' },
      { status: 409 }
    );
  }

  try {
    // Create public client for the chain using RPC URL from DB
    const chain = chainId === base.id ? base : baseSepolia;

    const publicClient = createPublicClient({
      chain,
      transport: http(networkConfig.rpcUrl),
    });

    let tokenId: bigint | null = null;
    let receipt: TransactionReceipt | null = null;

    // Try to get transaction receipt with retries
    try {
      receipt = await withRetry(async () => {
        return await publicClient.waitForTransactionReceipt({
          hash: txHash as `0x${string}`,
          timeout: 30_000,
          confirmations: 1,
        });
      }, 5, 3000);

      if (receipt.status !== 'success') {
        return NextResponse.json(
          { error: 'Transaction failed on-chain' },
          { status: 400 }
        );
      }

      tokenId = parseTokenIdFromLogs(receipt.logs);
    } catch {
      // If client provided a tokenId, verify and use as fallback
      if (clientTokenId) {
        try {
          const tx = await publicClient.getTransaction({
            hash: txHash as `0x${string}`,
          });

          if (tx) {
            tokenId = BigInt(clientTokenId);
          }
        } catch {
          return NextResponse.json(
            { error: 'Could not verify transaction. Please try again in a few moments.' },
            { status: 503 }
          );
        }
      } else {
        return NextResponse.json(
          { error: 'Transaction not yet confirmed. Please try again in a few moments.' },
          { status: 503 }
        );
      }
    }

    if (!tokenId) {
      return NextResponse.json(
        { error: 'Could not determine token ID from transaction' },
        { status: 500 }
      );
    }

    // Update agent with on-chain data
    const { error: updateError } = await supabaseAdmin
      .from('agents')
      .update({
        erc8004_token_id: tokenId.toString(),
        erc8004_tx_hash: txHash,
        erc8004_chain_id: chainId,
        status: 'live',
        published_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      console.error('Failed to update agent:', updateError);
      return NextResponse.json(
        { error: 'Failed to update agent record' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      tokenId: tokenId.toString(),
      txHash,
      chainId,
    });
  } catch (err) {
    console.error('Confirm failed:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to confirm transaction: ${errorMessage}` },
      { status: 500 }
    );
  }
}
