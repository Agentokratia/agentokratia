import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DbUser, DbAgent } from '@/lib/db/supabase';
import { centsToDollars } from '@/lib/utils/format';

// Public API - no auth required
// Returns a creator's public profile and their published agents

interface CreatorAgent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  pricePerCall: number;
  totalCalls: number;
}

interface CreatorProfile {
  id: string;
  handle: string | null;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  walletAddress: string;
  memberSince: string;
  isVerified: boolean;
  stats: {
    totalAgents: number;
    totalCalls: number;
    totalEarned: number;
  };
  agents: CreatorAgent[];
}

// Check if string looks like a UUID
function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// GET /api/creator/[handle] - Get creator public profile
// Supports lookup by ID (UUID) or handle
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle } = await params;

    // Try to find user - by ID if UUID, otherwise by handle
    let userData: DbUser | null = null;

    if (isUUID(handle)) {
      // Lookup by ID
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', handle)
        .single();
      if (!error && data) userData = data as DbUser;
    }

    // If not found by ID (or wasn't a UUID), try by handle
    if (!userData) {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('handle', handle)
        .single();
      if (!error && data) userData = data as DbUser;
    }

    if (!userData) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    const user = userData;

    // Get all live agents for this creator
    const { data: agentsData, error: agentsError } = await supabaseAdmin
      .from('agents')
      .select('*')
      .eq('owner_id', user.id)
      .eq('status', 'live')
      .order('total_calls', { ascending: false });

    if (agentsError) {
      console.error('Error fetching creator agents:', agentsError);
      return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
    }

    const agents = (agentsData || []) as DbAgent[];

    // Calculate stats
    const totalCalls = agents.reduce((sum, a) => sum + a.total_calls, 0);
    const totalEarnedCents = agents.reduce((sum, a) => sum + a.total_earned_cents, 0);
    const totalEarned = Number(centsToDollars(totalEarnedCents));

    // Build response
    const profile: CreatorProfile = {
      id: user.id,
      handle: user.handle,
      name: user.name,
      bio: user.bio,
      avatarUrl: user.avatar_url,
      walletAddress: user.wallet_address,
      memberSince: user.created_at,
      isVerified: user.is_whitelisted,
      stats: {
        totalAgents: agents.length,
        totalCalls,
        totalEarned,
      },
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
        description: agent.description,
        category: agent.category,
        pricePerCall: agent.price_per_call,
        totalCalls: agent.total_calls,
      })),
    };

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Creator profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
