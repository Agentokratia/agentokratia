-- Agents Schema
-- Stores API agents registered on the marketplace
-- Ownership is tracked via owner_id FK to users table (3NF)
-- To get current owner's wallet: JOIN agents.owner_id -> users.wallet_address

-- =============================================
-- ENUMS
-- =============================================

CREATE TYPE agent_status AS ENUM ('draft', 'pending', 'live', 'paused', 'rejected');
CREATE TYPE agent_category AS ENUM ('ai', 'data', 'content', 'tools', 'other');

-- =============================================
-- AGENTS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner reference (3NF - join to get wallet_address)
  -- This changes when agent NFT is transferred and claimed
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Basic info
  name VARCHAR(100) NOT NULL,
  description TEXT,
  category agent_category NOT NULL DEFAULT 'other',

  -- Endpoint configuration
  endpoint_url VARCHAR(2048) NOT NULL,
  timeout_ms INTEGER NOT NULL DEFAULT 30000,

  -- Authentication
  agent_secret TEXT,
  agent_secret_created_at TIMESTAMPTZ,

  -- Pricing (in cents to avoid floating point issues)
  price_per_call INTEGER NOT NULL DEFAULT 100,

  -- Status
  status agent_status NOT NULL DEFAULT 'draft',

  -- Stats (denormalized for performance)
  total_calls INTEGER DEFAULT 0,
  total_earned_cents INTEGER DEFAULT 0,

  -- Marketplace visibility
  is_public BOOLEAN DEFAULT false,

  -- Metadata
  tags TEXT[],
  icon_url VARCHAR(2048),

  -- API schema definition
  input_schema JSONB,
  output_schema JSONB,
  readme TEXT,

  -- ERC-8004 On-chain Identity
  erc8004_token_id VARCHAR(78),
  erc8004_tx_hash VARCHAR(66),
  erc8004_chain_id INTEGER,
  agentcard_json TEXT,

  -- Feedback signer (delegated operator pattern)
  feedback_signer_address TEXT,
  feedback_signer_private_key TEXT,  -- Encrypted
  feedback_operator_tx_hash TEXT,
  feedback_operator_set_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT price_positive CHECK (price_per_call > 0),
  CONSTRAINT timeout_range CHECK (timeout_ms >= 1000 AND timeout_ms <= 300000)
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category);
CREATE INDEX IF NOT EXISTS idx_agents_public ON agents(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_agents_created ON agents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agents_secret ON agents(agent_secret) WHERE agent_secret IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agents_feedback_enabled ON agents(id) WHERE feedback_operator_set_at IS NOT NULL;

-- Unique constraint: One agent per NFT per chain (prevents duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_erc8004_unique
  ON agents(erc8004_token_id, erc8004_chain_id)
  WHERE erc8004_token_id IS NOT NULL;

-- =============================================
-- TRIGGERS
-- =============================================

DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to agents" ON agents
  FOR ALL USING (true);

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON COLUMN agents.owner_id IS 'Current owner - changes when NFT is transferred and claimed. Join to users for wallet_address.';
COMMENT ON COLUMN agents.agent_secret IS 'Secret added as X-Agentokratia-Secret header when proxying requests';
COMMENT ON COLUMN agents.feedback_signer_address IS 'Platform-generated signer address authorized via setOperator()';
COMMENT ON COLUMN agents.feedback_signer_private_key IS 'Encrypted private key for signing feedbackAuth tokens';
