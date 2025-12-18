import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';

// Public API - serves review content for fileuri
// This is the canonical JSON used for filehash verification on-chain

// Canonical review content structure for hash verification
// MUST match exactly what POST /api/marketplace/[id]/reviews uses for contentHash
interface ReviewContent {
  version: string;
  agentId: string;
  erc8004AgentId: string | null;
  title: string | null;
  content: string | null;
  score: number;
  tag1: string | null;
  tag2: string | null;
  createdAt: string;
}

// GET /api/reviews/[id] - Get review content (fileuri endpoint)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const { data: review, error } = await supabaseAdmin
      .from('agent_reviews')
      .select('*')
      .eq('id', id)
      .is('revoked_at', null)
      .single();

    if (error || !review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }

    // Return canonical JSON for on-chain filehash verification
    // Structure MUST match POST /api/marketplace/[id]/reviews hash input
    const content: ReviewContent = {
      version: '1.0',
      agentId: review.agent_id,
      erc8004AgentId: review.erc8004_agent_id,
      title: review.title,
      content: review.content,
      score: review.score,
      tag1: review.tag1,
      tag2: review.tag2,
      createdAt: review.created_at,
    };

    return NextResponse.json(content, {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Review content error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
