import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = await verifyToken(token);
    if (!payload?.sub) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Parse optional limit parameter
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 100;

    // Get user's agent IDs first
    const { data: userAgents, error: agentsError } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('owner_id', payload.sub);

    if (agentsError) {
      console.error('[Payments API] Error fetching user agents:', agentsError);
      return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
    }

    if (!userAgents || userAgents.length === 0) {
      return NextResponse.json({ payments: [] });
    }

    const agentIds = userAgents.map((a) => a.id);

    // Get payment history for user's agents
    const { data: payments, error: paymentsError } = await supabaseAdmin
      .from('agent_payments')
      .select(
        `
        id,
        agent_id,
        caller_address,
        amount_cents,
        tx_hash,
        network,
        status,
        request_id,
        created_at,
        agents!inner(name)
      `
      )
      .in('agent_id', agentIds)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (paymentsError) {
      console.error('[Payments API] Error fetching payments:', paymentsError);
      return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
    }

    // Transform for client
    const transformedPayments = (payments || []).map((p) => {
      // Handle joined agent - could be object or array depending on Supabase response
      const agentData = p.agents as { name: string } | { name: string }[] | null;
      const agentName = Array.isArray(agentData) ? agentData[0]?.name : agentData?.name;

      return {
        id: p.id,
        agentId: p.agent_id,
        agentName: agentName || 'Unknown Agent',
        callerAddress: p.caller_address,
        amountCents: p.amount_cents,
        txHash: p.tx_hash,
        network: p.network,
        status: p.status,
        requestId: p.request_id,
        createdAt: p.created_at,
      };
    });

    return NextResponse.json({ payments: transformedPayments });
  } catch (error) {
    console.error('[Payments API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
