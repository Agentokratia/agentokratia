import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { generateAgentSecret } from '@/lib/crypto';

// GET /api/agents/[id]/secret - Get agent's secret info
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

    // Verify ownership
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id, owner_id, agent_secret, agent_secret_created_at')
      .eq('id', id)
      .eq('owner_id', auth.userId)
      .single();

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Return secret info
    return NextResponse.json({
      hasKey: !!agent.agent_secret,
      secret: agent.agent_secret || null,
      createdAt: agent.agent_secret_created_at || null,
    });
  } catch (error) {
    console.error('Get secret error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/agents/[id]/secret - Generate a new secret
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify ownership
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id, owner_id')
      .eq('id', id)
      .eq('owner_id', auth.userId)
      .single();

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Generate new secret
    const secret = generateAgentSecret();

    // Store in database
    const { error } = await supabaseAdmin
      .from('agents')
      .update({
        agent_secret: secret,
        agent_secret_created_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error storing secret:', error);
      return NextResponse.json(
        { error: 'Failed to generate secret' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      secret,
      message: 'Secret generated. Configure your proxy to check the X-Agent-Secret header.',
    });
  } catch (error) {
    console.error('Generate secret error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/agents/[id]/secret - Revoke/delete the secret
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

    // Verify ownership
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id, owner_id')
      .eq('id', id)
      .eq('owner_id', auth.userId)
      .single();

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Remove secret
    const { error } = await supabaseAdmin
      .from('agents')
      .update({
        agent_secret: null,
        agent_secret_created_at: null,
      })
      .eq('id', id);

    if (error) {
      console.error('Error deleting secret:', error);
      return NextResponse.json(
        { error: 'Failed to delete secret' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete secret error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
