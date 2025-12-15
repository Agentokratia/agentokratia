-- Agent Reviews Schema
-- EIP-8004 Reputation Registry integration
--
-- IMPORTANT: Reviews are historical snapshots.
-- - reviewer_address: who reviewed (snapshot)
-- - owner_address_at_review: agent owner when review was submitted (snapshot)
--
-- When agent ownership changes, old reviews keep their original owner reference.
-- New reviews will capture the new owner's address.

-- =============================================
-- AGENT_REVIEWS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS agent_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Agent reference
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  erc8004_agent_id TEXT,  -- On-chain agentId (uint256 as string)

  -- Payment proof (one review per payment)
  payment_id UUID REFERENCES agent_payments(id) ON DELETE SET NULL,

  -- Review parties (SNAPSHOTS - do not change)
  reviewer_address TEXT NOT NULL,        -- Who submitted the review
  owner_address_at_review TEXT NOT NULL, -- Agent owner when review was submitted

  -- On-chain feedback data
  feedback_index INTEGER,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  tag1 TEXT,
  tag2 TEXT,

  -- Off-chain content (served via fileuri)
  title TEXT,
  content TEXT,
  content_hash TEXT,  -- keccak256 of canonical JSON (filehash)

  -- On-chain transaction
  tx_hash TEXT,
  chain_id INTEGER,

  -- Agent owner response
  response TEXT,
  response_hash TEXT,
  response_tx_hash TEXT,
  response_at TIMESTAMPTZ,

  -- Status
  revoked_at TIMESTAMPTZ,
  revoke_tx_hash TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_agent_reviews_agent_id ON agent_reviews(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_reviews_reviewer ON agent_reviews(reviewer_address);
CREATE INDEX IF NOT EXISTS idx_agent_reviews_owner ON agent_reviews(owner_address_at_review);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_reviews_payment_id ON agent_reviews(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_reviews_tx_hash ON agent_reviews(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_reviews_created ON agent_reviews(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_reviews_active ON agent_reviews(agent_id, score) WHERE revoked_at IS NULL;

-- =============================================
-- STATS VIEW
-- =============================================

CREATE OR REPLACE VIEW agent_review_stats AS
SELECT
  agent_id,
  COUNT(*) as review_count,
  ROUND(AVG(score), 1) as avg_score,
  ROUND(AVG(score) / 20.0, 1) as avg_rating,
  COUNT(*) FILTER (WHERE score >= 81) as five_star,
  COUNT(*) FILTER (WHERE score >= 61 AND score <= 80) as four_star,
  COUNT(*) FILTER (WHERE score >= 41 AND score <= 60) as three_star,
  COUNT(*) FILTER (WHERE score >= 21 AND score <= 40) as two_star,
  COUNT(*) FILTER (WHERE score <= 20) as one_star
FROM agent_reviews
WHERE revoked_at IS NULL
GROUP BY agent_id;

-- =============================================
-- TRIGGERS
-- =============================================

CREATE OR REPLACE FUNCTION update_agent_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_agent_reviews_updated_at ON agent_reviews;
CREATE TRIGGER trigger_agent_reviews_updated_at
  BEFORE UPDATE ON agent_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_reviews_updated_at();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE agent_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active reviews"
  ON agent_reviews
  FOR SELECT
  USING (revoked_at IS NULL);

CREATE POLICY "Service role can insert reviews"
  ON agent_reviews
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update reviews"
  ON agent_reviews
  FOR UPDATE
  USING (true);

-- =============================================
-- FEEDBACK AUTH TOKENS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS feedback_auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES agent_payments(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  erc8004_agent_id TEXT NOT NULL,
  client_address TEXT NOT NULL,
  index_limit BIGINT NOT NULL,
  expiry BIGINT NOT NULL,
  chain_id INTEGER NOT NULL,
  signer_address TEXT NOT NULL,  -- Snapshot of who signed
  signature TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_payment_feedback UNIQUE (payment_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_auth_payment ON feedback_auth_tokens(payment_id);
CREATE INDEX IF NOT EXISTS idx_feedback_auth_client ON feedback_auth_tokens(client_address, agent_id);
CREATE INDEX IF NOT EXISTS idx_feedback_auth_signature ON feedback_auth_tokens(signature);

ALTER TABLE feedback_auth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage feedback auth tokens"
  ON feedback_auth_tokens
  FOR ALL
  USING (true);

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON TABLE agent_reviews IS 'Historical review records. Addresses are snapshots at time of review.';
COMMENT ON COLUMN agent_reviews.reviewer_address IS 'Wallet that submitted the review (snapshot)';
COMMENT ON COLUMN agent_reviews.owner_address_at_review IS 'Agent owner wallet when review was submitted (snapshot)';
