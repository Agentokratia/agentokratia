import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';
import { getAuthenticatedUser } from '@/lib/auth/session';
import {
  getOwnedTokenIds,
  batchVerifyOwnership,
  type OwnershipStatus,
} from '@/lib/ownership';

/**
 * GET /api/agents/dashboard
 *
 * Returns a unified view of agents combining database and on-chain data.
 * This solves the ownership sync problem:
 * - Shows agents you control in DB (with ownership status)
 * - Shows agents you own on-chain but haven't claimed yet
 *
 * Query params:
 * - chainId: Chain to check ownership on (default: 84532 for Base Sepolia)
 */

interface ControlledAgent {
  id: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  pricePerCall: number;
  totalCalls: number;
  totalEarnedCents: number;
  iconUrl: string | null;
  erc8004TokenId: string | null;
  erc8004ChainId: number | null;
  ownershipStatus: OwnershipStatus;
  onChainOwner?: string;
  createdAt: string;
  updatedAt: string;
}

interface ClaimableAgent {
  id: string;
  name: string;
  description: string | null;
  category: string;
  iconUrl: string | null;
  tokenId: string;
  chainId: number;
  currentDbOwnerAddress: string;
}

interface DashboardResponse {
  controlled: ControlledAgent[];
  claimable: ClaimableAgent[];
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth?.userId || !auth?.address) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const walletAddress = auth.address;

    const { searchParams } = new URL(request.url);
    const chainId = parseInt(searchParams.get('chainId') || '84532', 10);

    // 1. Get agents I control in DB
    const { data: dbAgents, error: dbError } = await supabaseAdmin
      .from('agents')
      .select(`
        id, name, description, category, status, price_per_call,
        total_calls, total_earned_cents, icon_url,
        erc8004_token_id, erc8004_chain_id,
        created_at, updated_at
      `)
      .eq('owner_id', auth.userId)
      .order('created_at', { ascending: false });

    if (dbError) {
      console.error('[Dashboard] DB query error:', dbError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // 2. Get token IDs I own on-chain
    const ownedTokenIds = await getOwnedTokenIds(walletAddress, chainId);
    const ownedTokenIdSet = new Set(ownedTokenIds);

    // 3. Batch verify ownership for on-chain agents
    const onChainAgents = (dbAgents || []).filter(
      a => a.erc8004_token_id && a.erc8004_chain_id === chainId
    );
    const tokenIdsToVerify = onChainAgents.map(a => a.erc8004_token_id!);
    const ownershipMap = await batchVerifyOwnership(tokenIdsToVerify, chainId);

    // 4. Build controlled list with ownership status
    const controlled: ControlledAgent[] = (dbAgents || []).map(agent => {
      let ownershipStatus: OwnershipStatus = 'draft';
      let onChainOwner: string | undefined;

      if (agent.erc8004_token_id && agent.erc8004_chain_id) {
        const verifiedOwner = ownershipMap.get(agent.erc8004_token_id);
        if (verifiedOwner) {
          if (verifiedOwner === walletAddress.toLowerCase()) {
            ownershipStatus = 'verified';
          } else {
            ownershipStatus = 'transferred';
            onChainOwner = verifiedOwner;
          }
        } else {
          ownershipStatus = 'error';
        }
      }

      return {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        category: agent.category,
        status: agent.status,
        pricePerCall: agent.price_per_call,
        totalCalls: agent.total_calls || 0,
        totalEarnedCents: agent.total_earned_cents || 0,
        iconUrl: agent.icon_url,
        erc8004TokenId: agent.erc8004_token_id,
        erc8004ChainId: agent.erc8004_chain_id,
        ownershipStatus,
        onChainOwner,
        createdAt: agent.created_at,
        updatedAt: agent.updated_at,
      };
    });

    // 5. Find claimable agents (I own NFT but DB says someone else owns it)
    const myDbTokenIds = new Set(
      (dbAgents || [])
        .filter(a => a.erc8004_token_id)
        .map(a => a.erc8004_token_id)
    );

    const claimableTokenIds = ownedTokenIds.filter(
      tid => !myDbTokenIds.has(tid)
    );

    let claimable: ClaimableAgent[] = [];

    if (claimableTokenIds.length > 0) {
      // Look up these agents in DB
      const { data: claimableAgents } = await supabaseAdmin
        .from('agents')
        .select(`
          id, name, description, category, icon_url,
          erc8004_token_id, erc8004_chain_id,
          users!agents_owner_id_fkey(wallet_address)
        `)
        .in('erc8004_token_id', claimableTokenIds)
        .eq('erc8004_chain_id', chainId);

      claimable = (claimableAgents || []).map(agent => {
        const userData = agent.users as
          | { wallet_address: string }
          | { wallet_address: string }[]
          | null;
        const currentOwnerWallet = Array.isArray(userData)
          ? userData[0]?.wallet_address
          : userData?.wallet_address;

        return {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          category: agent.category,
          iconUrl: agent.icon_url,
          tokenId: agent.erc8004_token_id!,
          chainId: agent.erc8004_chain_id!,
          currentDbOwnerAddress: currentOwnerWallet || 'unknown',
        };
      });
    }

    const response: DashboardResponse = { controlled, claimable };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Dashboard] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
