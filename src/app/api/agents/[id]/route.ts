import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DbAgent, AgentCategory, AgentStatus } from '@/lib/db/supabase';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { isOnChainOwner } from '@/lib/ownership';
import { centsToDollars } from '@/lib/utils/format';

// Helper to format agent for API response
function formatAgent(agent: DbAgent & { users?: { handle: string | null } }, ownerHandle?: string) {
  return {
    id: agent.id,
    name: agent.name,
    slug: agent.slug,
    description: agent.description,
    category: agent.category,
    endpointUrl: agent.endpoint_url,
    timeoutMs: agent.timeout_ms || 30000,
    pricePerCall: agent.price_per_call, // Cents - formatted by formatUsdc in UI
    status: agent.status,
    totalCalls: agent.total_calls,
    totalEarned: Number(centsToDollars(agent.total_earned_cents)),
    tags: agent.tags,
    iconUrl: agent.icon_url,
    inputSchema: agent.input_schema,
    outputSchema: agent.output_schema,
    readme: agent.readme,
    createdAt: agent.created_at,
    updatedAt: agent.updated_at,
    publishedAt: agent.published_at,
    // ERC-8004 on-chain identity
    erc8004TokenId: agent.erc8004_token_id,
    erc8004TxHash: agent.erc8004_tx_hash,
    erc8004ChainId: agent.erc8004_chain_id,
    // Reviews/Feedback - check on-chain via isApprovedForAll, not DB state
    feedbackSignerAddress: agent.feedback_signer_address || null,
    // Owner handle for URL construction
    ownerHandle: ownerHandle || agent.users?.handle || null,
  };
}

// GET /api/agents/[id] - Get a single agent
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('agents')
      .select('*, users!agents_owner_id_fkey(handle)')
      .eq('id', id)
      .eq('owner_id', auth.userId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    return NextResponse.json({ agent: formatAgent(data as DbAgent & { users?: { handle: string | null } }) });
  } catch (error) {
    console.error('Get agent error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/agents/[id] - Update an agent
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify DB ownership
    const { data: existingAgent } = await supabaseAdmin
      .from('agents')
      .select('*')
      .eq('id', id)
      .eq('owner_id', auth.userId)
      .single();

    if (!existingAgent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // For on-chain agents, verify NFT ownership (prevents old owner from modifying after transfer)
    if (existingAgent.erc8004_token_id && existingAgent.erc8004_chain_id) {
      const ownsOnChain = await isOnChainOwner(
        existingAgent.erc8004_token_id,
        auth.address,
        existingAgent.erc8004_chain_id
      );
      if (!ownsOnChain) {
        return NextResponse.json(
          { error: 'Agent ownership transferred on-chain. Please have the new owner claim it.' },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const { name, description, category, endpointUrl, timeoutMs, pricePerCall, status, inputSchema, outputSchema, readme } = body;

    // Build update object
    const updates: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.length < 2 || name.length > 100) {
        return NextResponse.json(
          { error: 'Name must be 2-100 characters' },
          { status: 400 }
        );
      }
      updates.name = name.trim();
    }

    if (description !== undefined) {
      updates.description = description?.trim() || null;
    }

    if (category !== undefined) {
      const validCategories: AgentCategory[] = ['ai', 'data', 'content', 'tools', 'other'];
      if (!validCategories.includes(category)) {
        return NextResponse.json(
          { error: 'Invalid category' },
          { status: 400 }
        );
      }
      updates.category = category;
    }

    if (endpointUrl !== undefined) {
      try {
        new URL(endpointUrl);
      } catch {
        return NextResponse.json(
          { error: 'Invalid endpoint URL format' },
          { status: 400 }
        );
      }
      updates.endpoint_url = endpointUrl.trim();
    }

    if (timeoutMs !== undefined) {
      if (typeof timeoutMs !== 'number' || timeoutMs < 1000 || timeoutMs > 300000) {
        return NextResponse.json(
          { error: 'Timeout must be between 1 second (1000ms) and 5 minutes (300000ms)' },
          { status: 400 }
        );
      }
      updates.timeout_ms = timeoutMs;
    }

    if (pricePerCall !== undefined) {
      if (typeof pricePerCall !== 'number' || pricePerCall <= 0) {
        return NextResponse.json(
          { error: 'Price per call must be a positive number' },
          { status: 400 }
        );
      }
      // pricePerCall is already in cents from frontend (PricingTab sends cents)
      updates.price_per_call = Math.round(pricePerCall);
    }

    if (status !== undefined) {
      const validStatuses: AgentStatus[] = ['draft', 'pending', 'live', 'paused', 'rejected'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: 'Invalid status' },
          { status: 400 }
        );
      }
      updates.status = status;

      // Set published_at when first going live
      if (status === 'live' && !existingAgent.published_at) {
        updates.published_at = new Date().toISOString();
      }
    }

    if (inputSchema !== undefined) {
      // Validate it's valid JSON if provided as string
      if (typeof inputSchema === 'string') {
        try {
          updates.input_schema = JSON.parse(inputSchema);
        } catch {
          return NextResponse.json(
            { error: 'Invalid input schema JSON' },
            { status: 400 }
          );
        }
      } else {
        updates.input_schema = inputSchema;
      }
    }

    if (outputSchema !== undefined) {
      // Validate it's valid JSON if provided as string
      if (typeof outputSchema === 'string') {
        try {
          updates.output_schema = JSON.parse(outputSchema);
        } catch {
          return NextResponse.json(
            { error: 'Invalid output schema JSON' },
            { status: 400 }
          );
        }
      } else {
        updates.output_schema = outputSchema;
      }
    }

    if (readme !== undefined) {
      updates.readme = readme?.trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const { data: updatedAgent, error } = await supabaseAdmin
      .from('agents')
      .update(updates)
      .eq('id', id)
      .select('*, users!agents_owner_id_fkey(handle)')
      .single();

    if (error) {
      console.error('Error updating agent:', error);
      return NextResponse.json(
        { error: 'Failed to update agent' },
        { status: 500 }
      );
    }

    return NextResponse.json({ agent: formatAgent(updatedAgent as DbAgent & { users?: { handle: string | null } }) });
  } catch (error) {
    console.error('Update agent error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/agents/[id] - Delete an agent
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify DB ownership
    const { data: existingAgent } = await supabaseAdmin
      .from('agents')
      .select('id, erc8004_token_id, erc8004_chain_id')
      .eq('id', id)
      .eq('owner_id', auth.userId)
      .single();

    if (!existingAgent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // For on-chain agents, verify NFT ownership (prevents old owner from deleting after transfer)
    if (existingAgent.erc8004_token_id && existingAgent.erc8004_chain_id) {
      const ownsOnChain = await isOnChainOwner(
        existingAgent.erc8004_token_id,
        auth.address,
        existingAgent.erc8004_chain_id
      );
      if (!ownsOnChain) {
        return NextResponse.json(
          { error: 'Agent ownership transferred on-chain. You cannot delete it.' },
          { status: 403 }
        );
      }
    }

    const { error } = await supabaseAdmin
      .from('agents')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting agent:', error);
      return NextResponse.json(
        { error: 'Failed to delete agent' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete agent error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
