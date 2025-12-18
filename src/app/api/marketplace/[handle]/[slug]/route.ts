import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DbAgent } from '@/lib/db/supabase';

// Public API - no auth required
// Returns a single live/public agent by handle/slug with full details

interface MarketplaceAgentDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  pricePerCall: number;
  totalCalls: number;
  tags: string[] | null;
  iconUrl: string | null;
  createdAt: string;
  publishedAt: string | null;
  readme: string | null;
  ownerId: string;
  ownerHandle: string;
  ownerName: string | null;
  inputSchema: object | null;
  outputSchema: object | null;
  // ERC-8004 on-chain identity
  erc8004TokenId: string | null;
  erc8004TxHash: string | null;
  erc8004ChainId: number | null;
  // Reviews enabled (feedbackSigner is set up)
  reviewsEnabled: boolean;
  // Performance stats
  stats?: {
    uptime: number;
    avgResponseMs: number;
    errorRate: number;
  };
  // Review stats
  reviewStats?: {
    avgScore: number;
    avgRating: number;
    reviewCount: number;
    distribution: {
      5: number;
      4: number;
      3: number;
      2: number;
      1: number;
    };
  };
}

// GET /api/marketplace/[handle]/[slug] - Get single public agent by handle/slug
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string; slug: string }> }
) {
  try {
    const { handle, slug } = await params;

    // First find the user by handle
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, handle, name')
      .eq('handle', handle.toLowerCase())
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    // Fetch agent by owner_id and slug
    const { data, error } = await supabaseAdmin
      .from('agents')
      .select('*')
      .eq('owner_id', user.id)
      .eq('slug', slug.toLowerCase())
      .eq('status', 'live')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const agent = data as DbAgent;

    // Fetch performance stats from view
    const { data: statsData } = await supabaseAdmin
      .from('agent_performance_stats')
      .select('uptime_pct, avg_response_ms, error_rate_pct')
      .eq('agent_id', agent.id)
      .single();

    // Fetch review stats from view
    const { data: reviewStatsData } = await supabaseAdmin
      .from('agent_review_stats')
      .select('*')
      .eq('agent_id', agent.id)
      .single();

    const result: MarketplaceAgentDetail = {
      id: agent.id,
      name: agent.name,
      slug: agent.slug,
      description: agent.description ?? null,
      category: agent.category,
      pricePerCall: agent.price_per_call,
      totalCalls: agent.total_calls,
      tags: agent.tags ?? null,
      iconUrl: agent.icon_url ?? null,
      createdAt: agent.created_at,
      publishedAt: agent.published_at ?? null,
      readme: agent.readme ?? null,
      ownerId: agent.owner_id,
      ownerHandle: user.handle,
      ownerName: user.name ?? null,
      inputSchema: agent.input_schema ?? null,
      outputSchema: agent.output_schema ?? null,
      // ERC-8004 on-chain identity
      erc8004TokenId: agent.erc8004_token_id ?? null,
      erc8004TxHash: agent.erc8004_tx_hash ?? null,
      erc8004ChainId: agent.erc8004_chain_id ?? null,
      // Reviews enabled (feedbackSigner is set up and operator approved)
      reviewsEnabled: !!(agent.feedback_signer_address && agent.feedback_operator_set_at),
      // Performance stats
      stats: statsData
        ? {
            uptime: statsData.uptime_pct,
            avgResponseMs: statsData.avg_response_ms,
            errorRate: statsData.error_rate_pct,
          }
        : undefined,
      // Review stats
      reviewStats: reviewStatsData
        ? {
            avgScore: reviewStatsData.avg_score || 0,
            avgRating: reviewStatsData.avg_rating || 0,
            reviewCount: reviewStatsData.review_count || 0,
            distribution: {
              5: reviewStatsData.five_star || 0,
              4: reviewStatsData.four_star || 0,
              3: reviewStatsData.three_star || 0,
              2: reviewStatsData.two_star || 0,
              1: reviewStatsData.one_star || 0,
            },
          }
        : undefined,
    };

    return NextResponse.json({ agent: result });
  } catch (error) {
    console.error('Marketplace detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
