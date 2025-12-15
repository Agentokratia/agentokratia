-- Supported Networks Schema
-- Single source of truth for all network configuration

-- =============================================
-- SUPPORTED_NETWORKS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS supported_networks (
  chain_id INTEGER PRIMARY KEY,
  network TEXT NOT NULL UNIQUE,              -- CAIP-2 format: eip155:8453
  name TEXT NOT NULL,                        -- Human readable: Base Mainnet
  rpc_url TEXT NOT NULL,                     -- RPC endpoint
  usdc_address TEXT NOT NULL,
  usdc_eip712_domain JSONB NOT NULL,         -- EIP-712 domain for USDC signatures
  identity_registry_address TEXT,            -- ERC-8004 Identity Registry
  reputation_registry_address TEXT,          -- ERC-8004 Reputation Registry
  block_explorer_url TEXT NOT NULL,
  deployment_block BIGINT,                   -- Block number when contracts were deployed
  is_testnet BOOLEAN NOT NULL DEFAULT false,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- SEED DATA
-- =============================================

INSERT INTO supported_networks (
  chain_id, network, name, rpc_url, usdc_address, usdc_eip712_domain,
  identity_registry_address, reputation_registry_address,
  block_explorer_url, deployment_block, is_testnet, is_enabled
) VALUES
  -- Base Mainnet
  (8453, 'eip155:8453', 'Base',
   'https://mainnet.base.org',
   '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
   '{"name": "USD Coin", "version": "2"}',
   NULL, NULL,  -- TODO: Deploy mainnet contracts
   'https://basescan.org',
   NULL,
   false, true),
  -- Base Sepolia (USDC contract uses "USDC" not "USD Coin" for EIP-712 domain)
  (84532, 'eip155:84532', 'Base Sepolia',
   'https://sepolia.base.org',
   '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
   '{"name": "USDC", "version": "2"}',
   '0x7177a6867296406881E20d6647232314736Dd09A',
   '0xB5048e3ef1DA4E04deB6f7d0423D06F63869e322',
   'https://sepolia.basescan.org',
   0,  -- From genesis for testnet
   true, true)
ON CONFLICT (chain_id) DO UPDATE SET
  rpc_url = EXCLUDED.rpc_url,
  usdc_address = EXCLUDED.usdc_address,
  usdc_eip712_domain = EXCLUDED.usdc_eip712_domain,
  identity_registry_address = EXCLUDED.identity_registry_address,
  reputation_registry_address = EXCLUDED.reputation_registry_address,
  block_explorer_url = EXCLUDED.block_explorer_url,
  deployment_block = EXCLUDED.deployment_block;

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_supported_networks_enabled
  ON supported_networks(is_enabled) WHERE is_enabled = true;

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON TABLE supported_networks IS 'Network configuration - single source of truth for chain settings';
COMMENT ON COLUMN supported_networks.deployment_block IS 'Block number when Identity Registry was deployed - used for Transfer event scanning';
