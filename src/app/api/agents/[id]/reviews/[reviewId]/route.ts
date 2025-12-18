import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import { supabaseAdmin } from '@/lib/db/supabase';

// POST /api/agents/[id]/reviews/[reviewId] - Respond to a review
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
  try {
    // Verify auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    if (!payload?.sub) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { id: agentId, reviewId } = await params;
    const body = await request.json();
    const { response } = body;

    // Validate response
    if (!response || typeof response !== 'string') {
      return NextResponse.json({ error: 'Response is required' }, { status: 400 });
    }

    if (response.length > 1000) {
      return NextResponse.json(
        { error: 'Response must be under 1000 characters' },
        { status: 400 }
      );
    }

    // Verify the user owns this agent
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('agents')
      .select('id, owner_id')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (agent.owner_id !== payload.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Verify the review exists and belongs to this agent
    const { data: review, error: reviewError } = await supabaseAdmin
      .from('agent_reviews')
      .select('id, agent_id')
      .eq('id', reviewId)
      .eq('agent_id', agentId)
      .single();

    if (reviewError || !review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }

    // Update the review with the response
    const { data: updatedReview, error: updateError } = await supabaseAdmin
      .from('agent_reviews')
      .update({
        response,
        response_at: new Date().toISOString(),
      })
      .eq('id', reviewId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating review:', updateError);
      return NextResponse.json({ error: 'Failed to save response' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      review: {
        id: updatedReview.id,
        response: updatedReview.response,
        responseAt: updatedReview.response_at,
      },
    });
  } catch (error) {
    console.error('Review response error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/agents/[id]/reviews/[reviewId] - Delete response (not the review itself)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
  try {
    // Verify auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    if (!payload?.sub) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { id: agentId, reviewId } = await params;

    // Verify the user owns this agent
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('agents')
      .select('id, owner_id')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (agent.owner_id !== payload.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Remove the response from the review
    const { error: updateError } = await supabaseAdmin
      .from('agent_reviews')
      .update({
        response: null,
        response_at: null,
      })
      .eq('id', reviewId)
      .eq('agent_id', agentId);

    if (updateError) {
      console.error('Error removing response:', updateError);
      return NextResponse.json({ error: 'Failed to remove response' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Review response delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
