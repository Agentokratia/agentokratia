import { supabaseAdmin } from '@/lib/db/supabase';

/**
 * Resolves a handle/slug pair to an agent ID
 * Returns null if not found
 */
export async function resolveAgentByHandleSlug(
  handle: string,
  slug: string
): Promise<{ agentId: string; ownerId: string } | null> {
  // First find the user by handle
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('handle', handle.toLowerCase())
    .single();

  if (userError || !user) {
    return null;
  }

  // Then find the agent by owner_id and slug
  const { data: agent, error: agentError } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('owner_id', user.id)
    .eq('slug', slug.toLowerCase())
    .single();

  if (agentError || !agent) {
    return null;
  }

  return { agentId: agent.id, ownerId: user.id };
}
