import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { isOnChainOwner } from '@/lib/ownership';
import { randomBytes } from 'crypto';

/**
 * POST /api/agents/[id]/claim
 *
 * Claim an agent that you own the NFT for but don't control in the database.
 * This happens when an agent NFT is transferred to you on-chain.
 *
 * Requirements:
 * - User must be authenticated
 * - User's wallet must own the agent's NFT on-chain
 * - Agent must be published on-chain (have erc8004_token_id)
 *
 * Effects:
 * - Updates agent's owner_id to the new owner
 * - Generates a new agent_secret (security measure)
 * - Clears feedback signer (new owner needs to set up their own)
 * - Logs the claim in sync_log
 */

function generateAgentSecret(): string {
  return `agk_${randomBytes(32).toString('hex')}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params;
    const auth = await getAuthenticatedUser(request);

    if (!auth?.userId || !auth?.address) {
      return NextResponse.json(
        { error: 'Wallet not connected' },
        { status: 401 }
      );
    }
    const walletAddress = auth.address;

    // Get the agent with current owner info
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('agents')
      .select(`
        id, name, owner_id, erc8004_token_id, erc8004_chain_id,
        users!agents_owner_id_fkey(id, wallet_address)
      `)
      .eq('id', agentId)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Agent must be published on-chain
    if (!agent.erc8004_token_id || !agent.erc8004_chain_id) {
      return NextResponse.json(
        { error: 'Agent is not published on-chain' },
        { status: 400 }
      );
    }

    // Verify caller owns the NFT on-chain
    const ownsNft = await isOnChainOwner(
      agent.erc8004_token_id,
      walletAddress,
      agent.erc8004_chain_id
    );

    if (!ownsNft) {
      return NextResponse.json(
        { error: 'You do not own this agent NFT' },
        { status: 403 }
      );
    }

    // Check if already the owner
    if (agent.owner_id === auth.userId) {
      return NextResponse.json(
        { error: 'You already own this agent' },
        { status: 400 }
      );
    }

    // Get previous owner info for logging
    const previousOwner = agent.users as
      | { id: string; wallet_address: string }
      | { id: string; wallet_address: string }[]
      | null;
    const previousOwnerId = agent.owner_id;
    const previousOwnerWallet = Array.isArray(previousOwner)
      ? previousOwner[0]?.wallet_address
      : previousOwner?.wallet_address;

    // Generate new secret for security
    const newSecret = generateAgentSecret();

    // Transfer ownership in DB (atomic: only if owner_id hasn't changed)
    const { data: updateResult, error: updateError } = await supabaseAdmin
      .from('agents')
      .update({
        owner_id: auth.userId,
        agent_secret: newSecret,
        agent_secret_created_at: new Date().toISOString(),
        // Clear feedback signer - new owner needs to set up
        feedback_signer_address: null,
        feedback_signer_private_key: null,
        feedback_operator_tx_hash: null,
        feedback_operator_set_at: null,
      })
      .eq('id', agentId)
      .eq('owner_id', previousOwnerId)  // Atomic: only update if owner hasn't changed
      .select('id');

    if (updateError) {
      console.error('[Claim] Update failed:', updateError);
      return NextResponse.json(
        { error: 'Failed to claim agent' },
        { status: 500 }
      );
    }

    // Check if update actually happened (race condition protection)
    if (!updateResult || updateResult.length === 0) {
      return NextResponse.json(
        { error: 'Agent already claimed by another user' },
        { status: 409 }
      );
    }

    // Log the claim
    await supabaseAdmin.from('sync_log').insert({
      entity_type: 'agent',
      entity_id: agentId,
      action: 'claim',
      result: 'success',
      details: {
        previous_owner_id: previousOwnerId,
        previous_owner_wallet: previousOwnerWallet,
        new_owner_id: auth.userId,
        new_owner_wallet: walletAddress,
        token_id: agent.erc8004_token_id,
        chain_id: agent.erc8004_chain_id,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Agent claimed successfully',
      agent: {
        id: agentId,
        name: agent.name,
      },
      // Return new secret so owner can update their endpoint
      newSecret,
      // Remind about feedback setup
      note: 'You will need to set up feedback signing again if you want to enable reviews.',
    });
  } catch (error) {
    console.error('[Claim] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
