import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DbAgent } from '@/lib/db/supabase';

// Public API - no auth required
// Returns only live/published agents

interface MarketplaceAgent {
  id: string;
  name: string;
  description: string | null;
  category: string;
  pricePerCall: number;
  totalCalls: number;
  tags: string[] | null;
  iconUrl: string | null;
  createdAt: string;
  ownerHandle: string | null;
}

function formatMarketplaceAgent(agent: DbAgent & { users?: { handle: string | null } }): MarketplaceAgent {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    category: agent.category,
    pricePerCall: agent.price_per_call,
    totalCalls: agent.total_calls,
    tags: agent.tags,
    iconUrl: agent.icon_url,
    createdAt: agent.created_at,
    ownerHandle: agent.users?.handle || null,
  };
}

// GET /api/marketplace - List public/live agents
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const sort = searchParams.get('sort') || 'popular';

    let query = supabaseAdmin
      .from('agents')
      .select('*, users!agents_owner_id_fkey(handle)')
      .eq('status', 'live');

    if (category && category !== 'All') {
      const categoryMap: Record<string, string> = {
        'AI / ML': 'ai',
        'Data': 'data',
        'Content': 'content',
        'Dev Tools': 'tools',
      };
      const dbCategory = categoryMap[category] || category.toLowerCase();
      query = query.eq('category', dbCategory);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Sorting
    switch (sort) {
      case 'rating':
        query = query.order('total_calls', { ascending: false }); // Use calls as proxy
        break;
      case 'price-low':
        query = query.order('price_per_call', { ascending: true });
        break;
      case 'price-high':
        query = query.order('price_per_call', { ascending: false });
        break;
      default: // popular
        query = query.order('total_calls', { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching marketplace agents:', error);
      return NextResponse.json(
        { error: 'Failed to fetch agents' },
        { status: 500 }
      );
    }

    const agents = (data || []).map(formatMarketplaceAgent);

    return NextResponse.json({ agents });
  } catch (error) {
    console.error('Marketplace error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
