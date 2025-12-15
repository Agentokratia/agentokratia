-- Sync Log Schema
-- Tracks on-chain/off-chain synchronization events for debugging

-- =============================================
-- SYNC_LOG TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,  -- 'agent', 'payment', 'review'
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,       -- 'verify', 'sync', 'claim', 'transfer_detected'
  result TEXT NOT NULL,       -- 'success', 'mismatch', 'error'
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_sync_log_entity ON sync_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_created ON sync_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_action ON sync_log(action);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage sync_log"
  ON sync_log
  FOR ALL
  USING (true);

-- =============================================
-- CLEANUP FUNCTION (keep 30 days)
-- =============================================

CREATE OR REPLACE FUNCTION cleanup_old_sync_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM sync_log WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ language 'plpgsql';
