import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/db/supabase';
import { createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { getNetworkConfig } from '@/lib/network';
import { enableReviewsSchema, validate } from '@/lib/validations/schemas';
import { withRetry } from '@/lib/utils/retry';

// POST /api/agents/[id]/reviews/confirm
// Confirms the setApprovalForAll transaction for enabling reviews
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;

  const auth = await getAuthenticatedUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  // Zod validation
  const validation = validate(enableReviewsSchema, body);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { txHash, chainId } = validation.data;

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

  // Get agent with ownership check
  const { data: agent, error: agentError } = await supabaseAdmin
    .from('agents')
    .select('id, owner_id, erc8004_token_id, erc8004_chain_id, feedback_signer_address, feedback_operator_tx_hash')
    .eq('id', agentId)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.owner_id !== auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Agent must be published
  if (!agent.erc8004_token_id) {
    return NextResponse.json(
      { error: 'Agent not published' },
      { status: 400 }
    );
  }

  // Must have feedback signer address
  if (!agent.feedback_signer_address) {
    return NextResponse.json(
      { error: 'Reviews not prepared. Call POST /api/agents/[id]/reviews first.' },
      { status: 400 }
    );
  }

  // Idempotency check - already confirmed
  if (agent.feedback_operator_tx_hash === txHash) {
    return NextResponse.json({
      success: true,
      txHash: agent.feedback_operator_tx_hash,
      idempotent: true,
    });
  }

  try {
    // Create public client for the chain
    const chain = chainId === base.id ? base : baseSepolia;
    const publicClient = createPublicClient({
      chain,
      transport: http(networkConfig.rpcUrl),
    });

    // Wait for transaction confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      timeout: 60_000,
      confirmations: 1,
    });

    if (receipt.status !== 'success') {
      return NextResponse.json(
        { error: 'Transaction failed on-chain' },
        { status: 400 }
      );
    }

    // Update agent with operator tx hash
    const { error: updateError } = await supabaseAdmin
      .from('agents')
      .update({
        feedback_operator_tx_hash: txHash,
        feedback_operator_set_at: new Date().toISOString(),
      })
      .eq('id', agentId);

    if (updateError) {
      console.error('Failed to update agent:', updateError);
      return NextResponse.json(
        { error: 'Failed to update agent record' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      txHash,
    });
  } catch (err) {
    console.error('Enable reviews confirm failed:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to confirm transaction: ${errorMessage}` },
      { status: 500 }
    );
  }
}
