import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/db/supabase';
import { buildAgentCard } from '@/lib/erc8004/agentcard';

// POST /api/agents/[id]/publish
// Step 1: Validate agent and prepare AgentCard for on-chain registration
// Returns the tokenURI that the user will pass to the contract

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthenticatedUser(request);

  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get agent with ownership check
  const { data: agent, error } = await supabaseAdmin
    .from('agents')
    .select('*, users!agents_owner_id_fkey(handle)')
    .eq('id', id)
    .eq('owner_id', auth.userId)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // Validation checks
  const checks = {
    hasEndpoint: !!agent.endpoint_url,
    hasPrice: agent.price_per_call > 0,
    hasSecret: !!agent.agent_secret,
    notAlreadyPublished: !agent.erc8004_token_id,
  };

  if (!checks.hasEndpoint) {
    return NextResponse.json(
      { error: 'API endpoint required', code: 'MISSING_ENDPOINT' },
      { status: 400 }
    );
  }

  if (!checks.hasPrice) {
    return NextResponse.json(
      { error: 'Price per call required', code: 'MISSING_PRICE' },
      { status: 400 }
    );
  }

  if (!checks.hasSecret) {
    return NextResponse.json(
      { error: 'Secret key required. Generate one in the Integration tab.', code: 'MISSING_KEY' },
      { status: 400 }
    );
  }

  if (!checks.notAlreadyPublished) {
    return NextResponse.json(
      { error: 'Agent already published', code: 'ALREADY_PUBLISHED' },
      { status: 400 }
    );
  }

  try {
    // Build AgentCard metadata
    const agentCard = buildAgentCard(agent, auth.address);

    // The tokenURI where the AgentCard will be served
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agentokratia.com';
    const tokenURI = `${baseUrl}/api/agents/${id}/agentcard.json`;

    // Store the AgentCard JSON
    await supabaseAdmin
      .from('agents')
      .update({ agentcard_json: JSON.stringify(agentCard) })
      .eq('id', id);

    return NextResponse.json({
      success: true,
      tokenURI,
      agentCard,
      checks,
    });
  } catch (err) {
    console.error('Publish prepare failed:', err);
    return NextResponse.json(
      { error: 'Failed to prepare agent for publishing' },
      { status: 500 }
    );
  }
}
