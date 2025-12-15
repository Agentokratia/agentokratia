-- Agentokratia Database Schema
-- Core tables: users, auth, sessions

-- Note: gen_random_uuid() is built-in to Postgres 13+ (used by Supabase)

-- =============================================
-- USERS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(42) UNIQUE NOT NULL,

  -- Profile info
  handle VARCHAR(50) UNIQUE,
  email VARCHAR(255),
  name VARCHAR(255),
  bio TEXT,
  avatar_url VARCHAR(2048),

  -- Whitelist status
  is_whitelisted BOOLEAN DEFAULT false,
  whitelisted_at TIMESTAMPTZ,
  invited_by UUID REFERENCES users(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- AUTH NONCES (SIWE replay prevention)
-- =============================================

CREATE TABLE IF NOT EXISTS auth_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce VARCHAR(64) UNIQUE NOT NULL,
  wallet_address VARCHAR(42),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- USER SESSIONS (JWT tracking)
-- =============================================

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- =============================================
-- WHITELIST INVITES
-- =============================================

CREATE TABLE IF NOT EXISTS whitelist_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  invited_by UUID REFERENCES users(id),
  invite_code VARCHAR(32) UNIQUE NOT NULL,
  claimed_by UUID REFERENCES users(id),
  claimed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_nonce ON auth_nonces(nonce);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires ON auth_nonces(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_whitelist_invites_email ON whitelist_invites(email);
CREATE INDEX IF NOT EXISTS idx_whitelist_invites_code ON whitelist_invites(invite_code);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for users updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired nonces
CREATE OR REPLACE FUNCTION cleanup_expired_nonces()
RETURNS void AS $$
BEGIN
  DELETE FROM auth_nonces WHERE expires_at < NOW();
END;
$$ language 'plpgsql';

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  UPDATE user_sessions SET revoked_at = NOW() WHERE expires_at < NOW() AND revoked_at IS NULL;
END;
$$ language 'plpgsql';

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whitelist_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to users" ON users
  FOR ALL USING (true);

CREATE POLICY "Service role has full access to auth_nonces" ON auth_nonces
  FOR ALL USING (true);

CREATE POLICY "Service role has full access to user_sessions" ON user_sessions
  FOR ALL USING (true);

CREATE POLICY "Service role has full access to whitelist_invites" ON whitelist_invites
  FOR ALL USING (true);
