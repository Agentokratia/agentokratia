-- Agent Payments Schema
-- x402 payment system for agent API monetization
--
-- IMPORTANT: Payments are historical snapshots.
-- - caller_address: who paid (snapshot)
-- - recipient_address: who received payment (snapshot at time of payment)
--
-- When agent ownership changes, old payments keep their original recipient.
-- New payments will capture the new owner's address.

-- =============================================
-- AGENT_PAYMENTS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS agent_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  -- Payment parties (SNAPSHOTS - do not change)
  caller_address TEXT NOT NULL,      -- Who paid
  recipient_address TEXT NOT NULL,   -- Who received (owner at time of payment)

  -- Payment details
  amount_cents INTEGER NOT NULL,
  tx_hash TEXT,
  network TEXT NOT NULL DEFAULT 'base-sepolia',
  status TEXT NOT NULL CHECK (status IN ('verified', 'settled', 'failed')),
  request_id UUID NOT NULL,

  -- Performance metrics
  response_time_ms INTEGER,
  success BOOLEAN DEFAULT true,
  http_status INTEGER,
  error_code TEXT,
  started_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_amount CHECK (amount_cents > 0)
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_agent_payments_agent_id ON agent_payments(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_payments_caller ON agent_payments(caller_address);
CREATE INDEX IF NOT EXISTS idx_agent_payments_recipient ON agent_payments(recipient_address);
CREATE INDEX IF NOT EXISTS idx_agent_payments_tx_hash ON agent_payments(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_payments_created ON agent_payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_payments_request ON agent_payments(request_id);
CREATE INDEX IF NOT EXISTS idx_agent_payments_stats ON agent_payments(agent_id, success, created_at DESC);

-- =============================================
-- STATS FUNCTION
-- =============================================

CREATE OR REPLACE FUNCTION increment_agent_stats(
  p_agent_id UUID,
  p_amount_cents INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE agents
  SET
    total_calls = COALESCE(total_calls, 0) + 1,
    total_earned_cents = COALESCE(total_earned_cents, 0) + p_amount_cents
  WHERE id = p_agent_id;
END;
$$;

-- =============================================
-- VIEWS
-- =============================================

-- Payment stats by agent
CREATE OR REPLACE VIEW agent_payment_stats AS
SELECT
  agent_id,
  COUNT(*) as total_payments,
  SUM(amount_cents) as total_earned_cents,
  COUNT(DISTINCT caller_address) as unique_callers,
  MAX(created_at) as last_payment_at
FROM agent_payments
WHERE status IN ('verified', 'settled')
GROUP BY agent_id;

-- Performance stats (30 day window)
CREATE OR REPLACE VIEW agent_performance_stats AS
SELECT
  agent_id,
  COUNT(*) as total_calls_30d,
  COUNT(*) FILTER (WHERE success = true) as success_calls_30d,
  COALESCE(ROUND(AVG(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL)), 100) as avg_response_ms,
  COALESCE(ROUND((COUNT(*) FILTER (WHERE success = true)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 1), 99.9) as uptime_pct,
  COALESCE(ROUND((COUNT(*) FILTER (WHERE success = false)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2), 0.0) as error_rate_pct
FROM agent_payments
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY agent_id;

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE agent_payments ENABLE ROW LEVEL SECURITY;

-- Users can view payments for their own agents
CREATE POLICY "Users can view their agent payments"
  ON agent_payments
  FOR SELECT
  USING (
    agent_id IN (
      SELECT id FROM agents WHERE owner_id = auth.uid()
    )
  );

-- Service role can insert payments
CREATE POLICY "Service role can insert payments"
  ON agent_payments
  FOR INSERT
  WITH CHECK (true);

-- Service role can update payments
CREATE POLICY "Service role can update payments"
  ON agent_payments
  FOR UPDATE
  USING (true);

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON TABLE agent_payments IS 'Historical payment records. Addresses are snapshots at time of payment.';
COMMENT ON COLUMN agent_payments.caller_address IS 'Wallet that made the payment (snapshot)';
COMMENT ON COLUMN agent_payments.recipient_address IS 'Wallet that received payment - agent owner at time of call (snapshot)';
