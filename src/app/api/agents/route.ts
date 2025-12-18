import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DbAgent } from '@/lib/db/supabase';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { createAgentSchema, validate } from '@/lib/validations/schemas';
import { centsToDollars, dollarsToCents } from '@/lib/utils/format';
import { slugify } from '@/lib/utils/slugify';

// Helper to format agent for API response
function formatAgent(agent: DbAgent) {
  return {
    id: agent.id,
    name: agent.name,
    slug: agent.slug,
    description: agent.description,
    category: agent.category,
    endpointUrl: agent.endpoint_url,
    pricePerCall: agent.price_per_call, // Cents - formatted by formatUsdc in UI
    status: agent.status,
    totalCalls: agent.total_calls,
    totalEarned: Number(centsToDollars(agent.total_earned_cents)),
    tags: agent.tags,
    iconUrl: agent.icon_url,
    createdAt: agent.created_at,
    updatedAt: agent.updated_at,
    publishedAt: agent.published_at,
  };
}

// GET /api/agents - List user's agents
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('agents')
      .select('*')
      .eq('owner_id', auth.userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching agents:', error);
      return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
    }

    const agents = (data as DbAgent[]).map(formatAgent);

    return NextResponse.json({ agents });
  } catch (error) {
    console.error('Get agents error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/agents - Create a new agent
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Zod validation
    const validation = validate(createAgentSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { name, description, category, endpointUrl, pricePerCall } = validation.data;

    // Convert price from dollars to cents using viem
    const priceInCents = dollarsToCents(pricePerCall);

    // Generate slug from name
    let slug = slugify(name);

    // Check if slug already exists for this owner
    const { data: existingSlug } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('owner_id', auth.userId)
      .eq('slug', slug)
      .single();

    // If slug exists, append timestamp to make unique
    if (existingSlug) {
      slug = `${slug}-${Date.now()}`;
    }

    const { data: newAgent, error } = await supabaseAdmin
      .from('agents')
      .insert({
        owner_id: auth.userId,
        name,
        slug,
        description: description || null,
        category,
        endpoint_url: endpointUrl,
        price_per_call: priceInCents,
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating agent:', error);
      return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
    }

    return NextResponse.json({ agent: formatAgent(newAgent as DbAgent) }, { status: 201 });
  } catch (error) {
    console.error('Create agent error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
