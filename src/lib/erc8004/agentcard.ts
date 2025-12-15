// AgentCard - ERC-8004 metadata format (simplified for MVP)
// This is the JSON stored at the tokenURI describing the agent

import { DbAgent } from '@/lib/db/supabase';
import { centsToDollars } from '@/lib/utils/format';

export interface AgentCard {
  // NFT standard fields
  name: string;
  description: string;
  image: string;
  // Agent-specific
  category: string;
  owner: string;
  endpoint: string;
  pricePerCall: string; // USDC
  // Link back to marketplace
  externalUrl: string;
}

// Build AgentCard metadata from database agent
export function buildAgentCard(
  agent: DbAgent,
  ownerAddress: string
): AgentCard {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agentokratia.com';

  return {
    name: agent.name,
    description: agent.description || '',
    image: agent.icon_url || `${baseUrl}/agents/${agent.id}/icon.png`,
    category: agent.category,
    owner: ownerAddress,
    endpoint: `${baseUrl}/api/v1/agents/${agent.id}`,
    pricePerCall: centsToDollars(agent.price_per_call),
    externalUrl: `${baseUrl}/marketplace/${agent.id}`,
  };
}
