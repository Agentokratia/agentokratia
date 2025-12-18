import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

// Admin client for server-side operations (full access)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Type definitions for database tables
export interface DbUser {
  id: string;
  wallet_address: string;
  handle: string | null;
  email: string | null;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_whitelisted: boolean;
  whitelisted_at: string | null;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbAuthNonce {
  id: string;
  nonce: string;
  wallet_address: string | null;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface DbUserSession {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  revoked_at: string | null;
}

// Agent types
export type AgentStatus = 'draft' | 'pending' | 'live' | 'paused' | 'rejected';
export type AgentCategory = 'ai' | 'data' | 'content' | 'tools' | 'other';

export interface DbAgent {
  id: string;
  owner_id: string; // Current owner (FK to users) - changes on claim
  name: string;
  slug: string; // URL-friendly identifier (unique per owner)
  description: string | null;
  category: AgentCategory;
  endpoint_url: string;
  timeout_ms: number; // Timeout for endpoint calls (ms)
  price_per_call: number; // in cents
  status: AgentStatus;
  total_calls: number;
  total_earned_cents: number;
  tags: string[] | null;
  icon_url: string | null;
  readme: string | null; // Documentation/README content
  // API Schema definitions (JSON Schema format)
  input_schema: object | null; // JSON Schema for request body
  output_schema: object | null; // JSON Schema for response body
  // Agent secret for authentication
  agent_secret: string | null; // Secret added as X-Agentokratia-Secret header
  agent_secret_created_at: string | null; // When the secret was generated
  // ERC-8004 on-chain identity
  erc8004_token_id: string | null; // On-chain token ID
  erc8004_tx_hash: string | null; // Registration transaction hash
  erc8004_chain_id: number | null; // Chain ID (e.g., 8453 for Base)
  agentcard_json: string | null; // AgentCard metadata JSON
  // Feedback signer (delegated operator for review signing)
  feedback_signer_address: string | null; // Platform-generated signer address
  feedback_signer_private_key: string | null; // Encrypted private key
  feedback_operator_tx_hash: string | null; // setOperator() tx hash
  feedback_operator_set_at: string | null; // When operator was set on-chain
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface DbAgentCall {
  id: string;
  agent_id: string;
  caller_id: string | null;
  request_id: string;
  price_cents: number;
  paid: boolean;
  payment_tx: string | null;
  ip_address: string | null;
  user_agent: string | null;
  response_status: number | null;
  response_time_ms: number | null;
  created_at: string;
}

// Agent Reviews (EIP-8004 Reputation Registry)
export interface DbAgentReview {
  id: string;
  agent_id: string;
  erc8004_agent_id: string | null;
  payment_id: string | null;
  // Review parties (snapshots at time of review)
  reviewer_address: string; // Who submitted the review
  owner_address_at_review: string; // Agent owner when review was submitted
  feedback_index: number | null;
  score: number; // 0-100 scale
  tag1: string | null;
  tag2: string | null;
  title: string | null;
  content: string | null;
  content_hash: string | null;
  tx_hash: string | null;
  chain_id: number | null;
  response: string | null;
  response_hash: string | null;
  response_tx_hash: string | null;
  response_at: string | null;
  revoked_at: string | null;
  revoke_tx_hash: string | null;
  created_at: string;
  updated_at: string;
}

// Review stats from view
export interface DbAgentReviewStats {
  agent_id: string;
  review_count: number;
  avg_score: number; // 0-100 scale
  avg_rating: number; // 1-5 stars
  five_star: number;
  four_star: number;
  three_star: number;
  two_star: number;
  one_star: number;
}

// Feedback auth tokens
export interface DbFeedbackAuthToken {
  id: string;
  payment_id: string;
  agent_id: string;
  erc8004_agent_id: string;
  client_address: string;
  index_limit: string; // bigint as string
  expiry: string; // bigint as string
  chain_id: number;
  signer_address: string;
  signature: string;
  used_at: string | null;
  created_at: string;
}

// Agent payment records (x402 payments)
export type PaymentStatus = 'verified' | 'settled' | 'failed';

export interface DbAgentPayment {
  id: string;
  agent_id: string;
  // Payment parties (snapshots at time of payment)
  caller_address: string; // Who paid
  recipient_address: string; // Who received (owner at time of payment)
  amount_cents: number;
  tx_hash: string | null;
  network: string;
  status: PaymentStatus;
  request_id: string;
  created_at: string;
  started_at: string | null;
  response_time_ms: number | null;
  success: boolean | null;
  http_status: number | null;
  error_code: string | null;
}

// Sync log for debugging on-chain/off-chain sync
export interface DbSyncLog {
  id: string;
  entity_type: string; // 'agent', 'payment', 'review'
  entity_id: string;
  action: string; // 'verify', 'sync', 'claim', 'transfer_detected'
  result: string; // 'success', 'mismatch', 'error'
  details: Record<string, unknown> | null;
  created_at: string;
}
