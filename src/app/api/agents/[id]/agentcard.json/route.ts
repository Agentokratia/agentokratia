import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';

// GET /api/agents/[id]/agentcard.json
// Serves the AgentCard metadata for on-chain tokenURI

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Get agent (public endpoint - no auth needed)
  const { data: agent, error } = await supabaseAdmin
    .from('agents')
    .select('agentcard_json')
    .eq('id', id)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (!agent.agentcard_json) {
    return NextResponse.json({ error: 'AgentCard not available' }, { status: 404 });
  }

  // Parse and return the stored AgentCard
  const agentCard = JSON.parse(agent.agentcard_json);

  return NextResponse.json(agentCard, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    },
  });
}
