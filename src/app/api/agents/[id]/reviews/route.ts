import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { supabaseAdmin, DbAgentReview } from '@/lib/db/supabase';
import { shortenAddress } from '@/lib/utils/format';
import { generateFeedbackSignerKeypair, encryptPrivateKey } from '@/lib/erc8004/feedbackAuth';

// Convert score (0-100) to stars (1-5)
function scoreToStars(score: number): number {
  if (score >= 81) return 5;
  if (score >= 61) return 4;
  if (score >= 41) return 3;
  if (score >= 21) return 2;
  return 1;
}

interface ReviewResponse {
  id: string;
  score: number;
  stars: number;
  title: string | null;
  content: string | null;
  tag1: string | null;
  tag2: string | null;
  reviewerAddress: string;
  reviewerHandle: string | null;
  feedbackIndex: number | null;
  txHash: string | null;
  chainId: number | null;
  response: string | null;
  responseAt: string | null;
  createdAt: string;
}

// GET /api/agents/[id]/reviews - Get reviews for agent owner
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: agentId } = await params;
    const { searchParams } = new URL(request.url);

    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const limitParam = parseInt(searchParams.get('limit') || '10', 10);
    const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
    const limit = Number.isNaN(limitParam) ? 10 : Math.min(Math.max(limitParam, 1), 50);
    const sort = searchParams.get('sort') || 'recent';
    const offset = (page - 1) * limit;

    // Verify the user owns this agent
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('agents')
      .select('id, owner_id')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (agent.owner_id !== auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Build query for reviews
    let query = supabaseAdmin
      .from('agent_reviews')
      .select('*', { count: 'exact' })
      .eq('agent_id', agentId)
      .is('revoked_at', null);

    // Apply sorting
    switch (sort) {
      case 'score_high':
        query = query.order('score', { ascending: false });
        break;
      case 'score_low':
        query = query.order('score', { ascending: true });
        break;
      case 'unanswered':
        query = query.is('response', null).order('created_at', { ascending: false });
        break;
      case 'recent':
      default:
        query = query.order('created_at', { ascending: false });
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: reviewsData, error: reviewsError, count } = await query;

    if (reviewsError) {
      console.error('Error fetching reviews:', reviewsError);
      return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 });
    }

    // Fetch user handles for reviewer addresses
    const reviewerAddresses = [
      ...new Set((reviewsData || []).map((r: DbAgentReview) => r.reviewer_address)),
    ];
    const { data: usersData } =
      reviewerAddresses.length > 0
        ? await supabaseAdmin
            .from('users')
            .select('wallet_address, handle')
            .in('wallet_address', reviewerAddresses)
        : { data: [] };

    const handleMap = new Map(
      (usersData || []).map((u: { wallet_address: string; handle: string | null }) => [
        u.wallet_address.toLowerCase(),
        u.handle,
      ])
    );

    // Fetch stats from view
    const { data: statsData } = await supabaseAdmin
      .from('agent_review_stats')
      .select('*')
      .eq('agent_id', agentId)
      .single();

    // Transform reviews for response
    const reviews: ReviewResponse[] = (reviewsData || []).map((review: DbAgentReview) => ({
      id: review.id,
      score: review.score,
      stars: scoreToStars(review.score),
      title: review.title,
      content: review.content,
      tag1: review.tag1,
      tag2: review.tag2,
      reviewerAddress: shortenAddress(review.reviewer_address),
      reviewerHandle: handleMap.get(review.reviewer_address.toLowerCase()) || null,
      feedbackIndex: review.feedback_index,
      txHash: review.tx_hash,
      chainId: review.chain_id,
      response: review.response,
      responseAt: review.response_at,
      createdAt: review.created_at,
    }));

    // Build stats
    const stats = statsData
      ? {
          avgScore: statsData.avg_score || 0,
          avgRating: statsData.avg_rating || 0,
          reviewCount: statsData.review_count || 0,
          distribution: {
            5: statsData.five_star || 0,
            4: statsData.four_star || 0,
            3: statsData.three_star || 0,
            2: statsData.two_star || 0,
            1: statsData.one_star || 0,
          },
        }
      : {
          avgScore: 0,
          avgRating: 0,
          reviewCount: 0,
          distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        };

    return NextResponse.json({
      reviews,
      stats,
      pagination: {
        page,
        limit,
        total: count || 0,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error('Reviews fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/agents/[id]/reviews - Prepare to enable reviews
// Generates feedback signer keypair if not already present
// Returns feedbackSignerAddress for setApprovalForAll call
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: agentId } = await params;

    // Get agent with ownership check
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('agents')
      .select('id, owner_id, erc8004_token_id, erc8004_chain_id, feedback_signer_address')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (agent.owner_id !== auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Agent must be published first
    if (!agent.erc8004_token_id) {
      return NextResponse.json(
        { error: 'Agent must be published before enabling reviews', code: 'NOT_PUBLISHED' },
        { status: 400 }
      );
    }

    let feedbackSignerAddress = agent.feedback_signer_address;

    // Generate keypair if not present
    if (!feedbackSignerAddress) {
      const keypair = generateFeedbackSignerKeypair();
      feedbackSignerAddress = keypair.address;

      // Store encrypted private key in DB
      const { error: updateError } = await supabaseAdmin
        .from('agents')
        .update({
          feedback_signer_address: keypair.address,
          feedback_signer_private_key: encryptPrivateKey(keypair.privateKey),
        })
        .eq('id', agentId);

      if (updateError) {
        console.error('Failed to store feedback signer:', updateError);
        return NextResponse.json({ error: 'Failed to prepare reviews' }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      feedbackSignerAddress,
      chainId: agent.erc8004_chain_id,
    });
  } catch (error) {
    console.error('Enable reviews prepare error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
