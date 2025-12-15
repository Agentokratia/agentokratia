import { NextRequest, NextResponse } from 'next/server';
import { keccak256, stringToBytes } from 'viem';
import { supabaseAdmin, DbAgentReview, DbAgentReviewStats } from '@/lib/db/supabase';
import { shortenAddress } from '@/lib/utils/format';
import { FEEDBACK_TAGS, EMPTY_BYTES32 } from '@/lib/erc8004/contracts';

// Valid tags for validation
const VALID_TAGS = Object.keys(FEEDBACK_TAGS);

// Public API - GET reviews (no auth required)
// POST requires feedbackAuth from x402 payment

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

interface ReviewStats {
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
}

// Convert score (0-100) to stars (1-5)
function scoreToStars(score: number): number {
  if (score >= 81) return 5;
  if (score >= 61) return 4;
  if (score >= 41) return 3;
  if (score >= 21) return 2;
  return 1;
}

// GET /api/marketplace/[id]/reviews - Get reviews for an agent
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params;
    const { searchParams } = new URL(request.url);

    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const limitParam = parseInt(searchParams.get('limit') || '10', 10);
    const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
    const limit = Number.isNaN(limitParam) ? 10 : Math.min(Math.max(limitParam, 1), 50);
    const sort = searchParams.get('sort') || 'recent';
    const offset = (page - 1) * limit;

    // Verify agent exists and is live
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('agents')
      .select('id, status')
      .eq('id', agentId)
      .eq('status', 'live')
      .single();

    if (agentError || !agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
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
      case 'recent':
      default:
        query = query.order('created_at', { ascending: false });
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: reviewsData, error: reviewsError, count } = await query;

    if (reviewsError) {
      console.error('Error fetching reviews:', reviewsError);
      return NextResponse.json(
        { error: 'Failed to fetch reviews' },
        { status: 500 }
      );
    }

    // Fetch user handles for reviewer addresses
    const reviewerAddresses = [...new Set((reviewsData || []).map((r: DbAgentReview) => r.reviewer_address))];
    const { data: usersData } = reviewerAddresses.length > 0
      ? await supabaseAdmin
          .from('users')
          .select('wallet_address, handle')
          .in('wallet_address', reviewerAddresses)
      : { data: [] };

    const handleMap = new Map((usersData || []).map((u: { wallet_address: string; handle: string | null }) =>
      [u.wallet_address.toLowerCase(), u.handle]
    ));

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
    const stats: ReviewStats = statsData
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
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/marketplace/[id]/reviews - Submit a new review
// Requires feedbackAuth from x402 payment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params;
    const body = await request.json();

    const { feedbackAuth, score, title, content, tag1, tag2 } = body;

    // Validate required fields
    if (!feedbackAuth) {
      return NextResponse.json(
        { error: 'feedbackAuth is required' },
        { status: 400 }
      );
    }

    if (typeof score !== 'number' || score < 0 || score > 100) {
      return NextResponse.json(
        { error: 'score must be a number between 0 and 100' },
        { status: 400 }
      );
    }

    // Validate tags if provided
    if (tag1 && !VALID_TAGS.includes(tag1)) {
      return NextResponse.json(
        { error: `Invalid tag1. Must be one of: ${VALID_TAGS.join(', ')}` },
        { status: 400 }
      );
    }
    if (tag2 && !VALID_TAGS.includes(tag2)) {
      return NextResponse.json(
        { error: `Invalid tag2. Must be one of: ${VALID_TAGS.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate optional title/content length
    if (title && (typeof title !== 'string' || title.length > 200)) {
      return NextResponse.json(
        { error: 'title must be a string with max 200 characters' },
        { status: 400 }
      );
    }
    if (content && (typeof content !== 'string' || content.length > 2000)) {
      return NextResponse.json(
        { error: 'content must be a string with max 2000 characters' },
        { status: 400 }
      );
    }

    // Verify agent exists and is live
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('agents')
      .select('id, erc8004_token_id, erc8004_chain_id')
      .eq('id', agentId)
      .eq('status', 'live')
      .single();

    if (agentError || !agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Find the feedback auth token
    const { data: authToken, error: authError } = await supabaseAdmin
      .from('feedback_auth_tokens')
      .select('*')
      .eq('agent_id', agentId)
      .eq('signature', feedbackAuth)
      .is('used_at', null)
      .single();

    if (authError || !authToken) {
      return NextResponse.json(
        { error: 'Invalid or expired feedbackAuth' },
        { status: 401 }
      );
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    const expiry = parseInt(authToken.expiry, 10);
    if (Number.isNaN(expiry) || expiry < now) {
      return NextResponse.json(
        { error: 'feedbackAuth has expired' },
        { status: 401 }
      );
    }

    // Get the payment record to determine who was PAID (not current owner)
    // This ensures review is attributed to the owner at payment time
    const { data: paymentRecord, error: paymentError } = await supabaseAdmin
      .from('agent_payments')
      .select('id, recipient_address')
      .eq('id', authToken.payment_id)
      .single();

    if (paymentError || !paymentRecord?.recipient_address) {
      return NextResponse.json(
        { error: 'Payment record not found' },
        { status: 500 }
      );
    }

    const ownerAtPayment = paymentRecord.recipient_address;

    // Check if payment already has a review
    const { data: existingReview } = await supabaseAdmin
      .from('agent_reviews')
      .select('id')
      .eq('payment_id', authToken.payment_id)
      .single();

    if (existingReview) {
      return NextResponse.json(
        { error: 'Review already submitted for this payment' },
        { status: 409 }
      );
    }

    // Generate content hash using keccak256
    const reviewContent = {
      version: '1.0',
      agentId,
      erc8004AgentId: agent.erc8004_token_id,
      title: title || null,
      content: content || null,
      score,
      tag1: tag1 || null,
      tag2: tag2 || null,
      createdAt: new Date().toISOString(),
    };

    // Proper keccak256 hash of review content
    const contentHash = keccak256(stringToBytes(JSON.stringify(reviewContent)));

    // Calculate feedback index from authToken's index_limit
    // index_limit = currentFeedbackIndex + 1, so feedback_index = index_limit - 1
    const indexLimit = parseInt(authToken.index_limit, 10);
    if (Number.isNaN(indexLimit) || indexLimit < 1) {
      return NextResponse.json(
        { error: 'Invalid feedback auth token' },
        { status: 400 }
      );
    }
    const feedbackIndex = indexLimit - 1;

    // Create the review
    const { data: review, error: reviewError } = await supabaseAdmin
      .from('agent_reviews')
      .insert({
        agent_id: agentId,
        erc8004_agent_id: agent.erc8004_token_id,
        payment_id: authToken.payment_id,
        reviewer_address: authToken.client_address,
        owner_address_at_review: ownerAtPayment,  // Owner who was PAID (from payment record)
        feedback_index: feedbackIndex,
        score,
        tag1: tag1 || null,
        tag2: tag2 || null,
        title: title || null,
        content: content || null,
        content_hash: contentHash,
        chain_id: authToken.chain_id,
      })
      .select()
      .single();

    if (reviewError) {
      console.error('Error creating review:', reviewError);
      return NextResponse.json(
        { error: 'Failed to create review' },
        { status: 500 }
      );
    }

    // Mark the auth token as used
    await supabaseAdmin
      .from('feedback_auth_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', authToken.id);

    // Return the review with on-chain data for client to call giveFeedback()
    const fileuri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://api.agentokratia.com'}/api/reviews/${review.id}`;

    return NextResponse.json({
      review: {
        id: review.id,
        fileuri,
        filehash: contentHash,
        score: review.score,
        title: review.title,
        content: review.content,
        createdAt: review.created_at,
      },
      onchain: {
        agentId: agent.erc8004_token_id,
        score: review.score,
        tag1: tag1 && VALID_TAGS.includes(tag1) ? FEEDBACK_TAGS[tag1 as keyof typeof FEEDBACK_TAGS] : EMPTY_BYTES32,
        tag2: tag2 && VALID_TAGS.includes(tag2) ? FEEDBACK_TAGS[tag2 as keyof typeof FEEDBACK_TAGS] : EMPTY_BYTES32,
        fileuri,
        filehash: contentHash,
        feedbackAuth,
      },
    });
  } catch (error) {
    console.error('Review creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
