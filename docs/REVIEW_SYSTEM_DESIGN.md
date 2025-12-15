# Agent Review System Design

Based on [EIP-8004 Reputation Registry](https://eips.ethereum.org/EIPS/eip-8004#reputation-registry)

## Overview

The review system uses the **existing on-chain IReputationRegistry** contract for core feedback data (score, tags, feedbackIndex) while storing extended content (review text, title) off-chain via our API as the `fileuri` content.

**Key Principle**: On-chain stores reputation signals for composability; off-chain stores rich content.

## Deployed Contracts

| Network | Chain ID | Identity Registry | Reputation Registry |
|---------|----------|-------------------|---------------------|
| Base Sepolia | 84532 | `0xYourIdentityRegistry` | `0xB5048e3ef1DA4E04deB6f7d0423D06F63869e322` |
| Base Mainnet | 8453 | TBD | TBD |

---

## Complete Flow Diagrams

### Flow 1: Agent Publishing (One-Time Setup)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ AGENT PUBLISH FLOW - setOperator() Setup                                                  │
│                                                                                           │
│  This flow runs ONCE when an agent is published to enable feedback signing                │
└──────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────┐
    │ Agent Owner │
    │  (Creator)  │
    └──────┬──────┘
           │
           │ 1. Clicks "Publish Agent" in Dashboard
           ▼
    ┌──────────────────────┐
    │ /agent/[id]/publish  │
    │ (Frontend Page)      │
    └──────┬───────────────┘
           │
           │ 2. POST /api/agents/[id]/publish
           │    Body: { networkId, pricePerCall, ... }
           ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │ STEP A: Generate Platform Signer Keypair                              │
    │                                                                       │
    │ const wallet = ethers.Wallet.createRandom();                          │
    │ const feedbackSignerAddress = wallet.address;                         │
    │ const feedbackSignerPrivateKey = encrypt(wallet.privateKey);          │
    │                                                                       │
    │ // Store in database (agents table):                                  │
    │ UPDATE agents SET                                                     │
    │   feedback_signer_address = '0xABC...',                               │
    │   feedback_signer_private_key = 'encrypted:...'                       │
    │ WHERE id = agentId;                                                   │
    └──────────────────────────────────┬───────────────────────────────────┘
                                       │
                                       │ 3. Return signer address to frontend
                                       ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │ STEP B: Frontend prompts owner to call setOperator()                  │
    │                                                                       │
    │ UI shows:                                                             │
    │ ┌────────────────────────────────────────────────────────────────┐   │
    │ │ "Enable Reviews for Your Agent"                                 │   │
    │ │                                                                 │   │
    │ │ To allow users to leave reviews, authorize our platform to      │   │
    │ │ sign feedback proofs on your behalf.                            │   │
    │ │                                                                 │   │
    │ │ This requires a one-time on-chain transaction.                  │   │
    │ │                                                                 │   │
    │ │ [Authorize Reviews] [Skip for Now]                              │   │
    │ └────────────────────────────────────────────────────────────────┘   │
    └──────────────────────────────────┬───────────────────────────────────┘
                                       │
                                       │ 4. User clicks "Authorize Reviews"
                                       ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │ STEP C: Call setOperator() On-Chain (via Identity Registry)           │
    │                                                                       │
    │ // Frontend code (using wagmi/viem):                                  │
    │ const tx = await writeContract({                                      │
    │   address: IDENTITY_REGISTRY_ADDRESS,                                 │
    │   abi: IDENTITY_REGISTRY_ABI,                                         │
    │   functionName: 'setOperator',                                        │
    │   args: [                                                             │
    │     agentId,              // uint256 - ERC-8004 token ID              │
    │     feedbackSignerAddress, // address - Platform signer               │
    │     true                  // bool - isOperator                        │
    │   ]                                                                   │
    │ });                                                                   │
    │                                                                       │
    │ // Wait for confirmation                                              │
    │ await waitForTransactionReceipt({ hash: tx });                        │
    └──────────────────────────────────┬───────────────────────────────────┘
                                       │
                                       │ 5. POST /api/agents/[id]/publish/confirm-operator
                                       │    Body: { txHash: '0x...' }
                                       ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │ STEP D: Store operator confirmation                                   │
    │                                                                       │
    │ UPDATE agents SET                                                     │
    │   feedback_operator_tx_hash = '0x...',                                │
    │   feedback_operator_set_at = NOW(),                                   │
    │   status = 'live'                                                     │
    │ WHERE id = agentId;                                                   │
    └──────────────────────────────────────────────────────────────────────┘

    ✅ Agent is now published and can receive reviews!
```

### Flow 2: User Makes Payment & Gets feedbackAuth

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ PAYMENT FLOW - feedbackAuth Generation                                                    │
│                                                                                           │
│  This flow runs on EVERY successful x402 payment                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────┐
    │   User      │
    │  (Payer)    │
    └──────┬──────┘
           │
           │ 1. Calls agent via x402 payment
           │    POST /api/call/[agentId]
           │    Headers: X-Payment: <signed payment>
           ▼
    ┌──────────────────────┐
    │ x402 Middleware      │
    │ verifies payment     │
    └──────┬───────────────┘
           │
           │ 2. Payment verified, record created
           ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │ STEP A: Record Payment in Database                                    │
    │                                                                       │
    │ INSERT INTO agent_payments (                                          │
    │   id, agent_id, payer_address, amount, tx_hash, chain_id, ...         │
    │ ) VALUES (...);                                                       │
    │                                                                       │
    │ // Get payment ID for linking                                         │
    │ const paymentId = result.id;                                          │
    └──────────────────────────────────┬───────────────────────────────────┘
                                       │
                                       │ 3. Check if agent has feedback signing enabled
                                       ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │ STEP B: Load Agent's Feedback Signer Key                              │
    │                                                                       │
    │ const agent = await db.agents.findOne({ id: agentId });               │
    │                                                                       │
    │ if (!agent.feedback_signer_address || !agent.feedback_operator_set_at)│
    │   // Skip feedbackAuth - agent hasn't enabled reviews                 │
    │   return response; // No X-Feedback-Auth header                       │
    │ }                                                                     │
    │                                                                       │
    │ const privateKey = decrypt(agent.feedback_signer_private_key);        │
    └──────────────────────────────────┬───────────────────────────────────┘
                                       │
                                       │ 4. Generate feedbackAuth data
                                       ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │ STEP C: Build feedbackAuth Tuple                                      │
    │                                                                       │
    │ // Get current feedback count for this user-agent pair                │
    │ const currentIndex = await reputationRegistry.getFeedbackCount(       │
    │   agentId,                                                            │
    │   payerAddress                                                        │
    │ );                                                                    │
    │                                                                       │
    │ const feedbackAuthData = {                                            │
    │   agentId: BigInt(agent.erc8004_token_id),                            │
    │   clientAddress: payerAddress,                                        │
    │   indexLimit: BigInt(currentIndex + 1), // Allow exactly 1 review     │
    │   expiry: BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60),   │
    │   chainId: BigInt(agent.erc8004_chain_id),                            │
    │   identityRegistry: IDENTITY_REGISTRY_ADDRESS,                        │
    │   signerAddress: agent.feedback_signer_address                        │
    │ };                                                                    │
    └──────────────────────────────────┬───────────────────────────────────┘
                                       │
                                       │ 5. Sign the feedbackAuth
                                       ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │ STEP D: Sign feedbackAuth (EIP-191 Personal Sign)                     │
    │                                                                       │
    │ import { privateKeyToAccount } from 'viem/accounts';                  │
    │ import { keccak256, encodePacked } from 'viem';                       │
    │                                                                       │
    │ // Create account from stored private key                             │
    │ const signer = privateKeyToAccount(privateKey);                       │
    │                                                                       │
    │ // Encode the feedbackAuth tuple (must match on-chain decoder)        │
    │ const message = keccak256(encodePacked(                               │
    │   ['uint256', 'address', 'uint256', 'uint256', 'uint256', 'address', 'address'],
    │   [                                                                   │
    │     feedbackAuthData.agentId,                                         │
    │     feedbackAuthData.clientAddress,                                   │
    │     feedbackAuthData.indexLimit,                                      │
    │     feedbackAuthData.expiry,                                          │
    │     feedbackAuthData.chainId,                                         │
    │     feedbackAuthData.identityRegistry,                                │
    │     feedbackAuthData.signerAddress                                    │
    │   ]                                                                   │
    │ ));                                                                   │
    │                                                                       │
    │ const signature = await signer.signMessage({                          │
    │   message: { raw: message }                                           │
    │ });                                                                   │
    │                                                                       │
    │ // Combine data + signature into final feedbackAuth                   │
    │ const feedbackAuth = encodeFeedbackAuth(feedbackAuthData, signature); │
    └──────────────────────────────────┬───────────────────────────────────┘
                                       │
                                       │ 6. Store token for API verification
                                       ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │ STEP E: Store feedbackAuth Token                                      │
    │                                                                       │
    │ INSERT INTO feedback_auth_tokens (                                    │
    │   id,                                                                 │
    │   agent_id,                                                           │
    │   payment_id,                                                         │
    │   client_address,                                                     │
    │   signature,              -- The full feedbackAuth string             │
    │   index_limit,                                                        │
    │   expiry,                                                             │
    │   chain_id,                                                           │
    │   used_at                 -- NULL until review submitted              │
    │ ) VALUES (...);                                                       │
    └──────────────────────────────────┬───────────────────────────────────┘
                                       │
                                       │ 7. Return response with feedbackAuth
                                       ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │ STEP F: Include feedbackAuth in Response                              │
    │                                                                       │
    │ return new Response(agentResult, {                                    │
    │   headers: {                                                          │
    │     'X-Feedback-Auth': feedbackAuth,                                  │
    │     'X-Feedback-Expires': feedbackAuthData.expiry.toString()          │
    │   }                                                                   │
    │ });                                                                   │
    └──────────────────────────────────────────────────────────────────────┘

    ✅ User now has feedbackAuth to submit a review!
```

### Flow 3: User Submits Review

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ REVIEW SUBMISSION FLOW                                                                    │
│                                                                                           │
│  Two-step process: 1) Create off-chain record, 2) Submit on-chain                        │
└──────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────┐
    │   User      │
    │ (Reviewer)  │
    └──────┬──────┘
           │
           │ 1. Opens review form (after payment)
           │    Has feedbackAuth from X-Feedback-Auth header
           ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │ FRONTEND: Review Form                                                 │
    │                                                                       │
    │ ┌──────────────────────────────────────────────────────────────────┐ │
    │ │ Leave a Review                                                    │ │
    │ │                                                                   │ │
    │ │ Rating: ★★★★☆                                                     │ │
    │ │                                                                   │ │
    │ │ Title: [Great for data analysis!         ]                        │ │
    │ │                                                                   │ │
    │ │ Review: [___________________________________]                      │ │
    │ │         [This agent helped me process...   ]                      │ │
    │ │         [___________________________________]                      │ │
    │ │                                                                   │ │
    │ │ Tags: [fast] [accurate] [reliable]                                │ │
    │ │                                                                   │ │
    │ │ [Submit Review]                                                   │ │
    │ └──────────────────────────────────────────────────────────────────┘ │
    └──────────────────────────────────┬───────────────────────────────────┘
                                       │
                                       │ 2. POST /api/marketplace/[id]/reviews
                                       │    Body: { feedbackAuth, score: 85, title, content, tag1, tag2 }
                                       ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │ API: Validate feedbackAuth                                            │
    │                                                                       │
    │ // Find the token in our database                                     │
    │ const authToken = await db.feedback_auth_tokens.findOne({             │
    │   signature: feedbackAuth,                                            │
    │   agent_id: agentId,                                                  │
    │   used_at: null  // Not already used                                  │
    │ });                                                                   │
    │                                                                       │
    │ if (!authToken) return 401;                                           │
    │ if (authToken.expiry < now) return 401; // Expired                    │
    └──────────────────────────────────┬───────────────────────────────────┘
                                       │
                                       │ 3. Create review record
                                       ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │ API: Store Review in Database                                         │
    │                                                                       │
    │ // Generate canonical JSON for filehash                               │
    │ const reviewContent = {                                               │
    │   version: '1.0',                                                     │
    │   reviewId: uuid(),                                                   │
    │   agentId: agentId,                                                   │
    │   erc8004AgentId: agent.erc8004_token_id,                             │
    │   title: 'Great for data analysis!',                                  │
    │   content: 'This agent helped me process...',                         │
    │   score: 85,                                                          │
    │   tag1: 'fast',                                                       │
    │   tag2: 'accurate',                                                   │
    │   createdAt: new Date().toISOString()                                 │
    │ };                                                                    │
    │                                                                       │
    │ const filehash = keccak256(JSON.stringify(reviewContent));            │
    │ const fileuri = `https://api.agentokratia.com/api/reviews/${reviewId}`;
    │                                                                       │
    │ // Insert into database                                               │
    │ INSERT INTO agent_reviews (...) VALUES (...);                         │
    │                                                                       │
    │ // Mark feedbackAuth as used                                          │
    │ UPDATE feedback_auth_tokens SET used_at = NOW() WHERE id = tokenId;   │
    └──────────────────────────────────┬───────────────────────────────────┘
                                       │
                                       │ 4. Return on-chain data to client
                                       ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │ API Response:                                                         │
    │ {                                                                     │
    │   "review": {                                                         │
    │     "id": "uuid",                                                     │
    │     "fileuri": "https://api.agentokratia.com/api/reviews/uuid",       │
    │     "filehash": "0x..."                                               │
    │   },                                                                  │
    │   "onchain": {                                                        │
    │     "agentId": "12345",      // ERC-8004 token ID                     │
    │     "score": 85,                                                      │
    │     "tag1": "0x...",         // bytes32                               │
    │     "tag2": "0x...",         // bytes32                               │
    │     "fileuri": "...",                                                 │
    │     "filehash": "0x...",                                              │
    │     "feedbackAuth": "0x..."  // For on-chain call                     │
    │   }                                                                   │
    │ }                                                                     │
    └──────────────────────────────────┬───────────────────────────────────┘
                                       │
                                       │ 5. Frontend calls on-chain giveFeedback()
                                       ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │ FRONTEND: Submit On-Chain                                             │
    │                                                                       │
    │ const tx = await writeContract({                                      │
    │   address: REPUTATION_REGISTRY_ADDRESS,                               │
    │   abi: REPUTATION_REGISTRY_ABI,                                       │
    │   functionName: 'giveFeedback',                                       │
    │   args: [                                                             │
    │     BigInt(onchain.agentId),                                          │
    │     onchain.score,                                                    │
    │     onchain.tag1,                                                     │
    │     onchain.tag2,                                                     │
    │     onchain.fileuri,                                                  │
    │     onchain.filehash,                                                 │
    │     onchain.feedbackAuth                                              │
    │   ]                                                                   │
    │ });                                                                   │
    │                                                                       │
    │ const receipt = await waitForTransactionReceipt({ hash: tx });        │
    │ const feedbackIndex = extractFeedbackIndexFromEvent(receipt);         │
    └──────────────────────────────────┬───────────────────────────────────┘
                                       │
                                       │ 6. Confirm on-chain submission
                                       ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │ POST /api/marketplace/[id]/reviews/[reviewId]/confirm                 │
    │ Body: { txHash: '0x...', feedbackIndex: 1 }                           │
    │                                                                       │
    │ UPDATE agent_reviews SET                                              │
    │   tx_hash = '0x...',                                                  │
    │   feedback_index = 1                                                  │
    │ WHERE id = reviewId;                                                  │
    └──────────────────────────────────────────────────────────────────────┘

    ✅ Review is now stored both on-chain and off-chain!
```

---

## Database Schema

### Table: `agents` (additions)

```sql
-- Add to existing agents table
ALTER TABLE agents ADD COLUMN feedback_signer_address TEXT;
ALTER TABLE agents ADD COLUMN feedback_signer_private_key TEXT;  -- Encrypted
ALTER TABLE agents ADD COLUMN feedback_operator_tx_hash TEXT;    -- setOperator() tx
ALTER TABLE agents ADD COLUMN feedback_operator_set_at TIMESTAMPTZ;
```

### Table: `agent_reviews`

```sql
CREATE TABLE agent_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  erc8004_agent_id TEXT,                -- On-chain agentId (uint256 as string)
  payment_id UUID REFERENCES agent_payments(id),
  reviewer_address TEXT NOT NULL,       -- Wallet address of reviewer

  -- EIP-8004 fields
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  tag1 TEXT,                            -- e.g., "fast"
  tag2 TEXT,                            -- e.g., "accurate"
  feedback_index INTEGER,               -- On-chain feedbackIndex

  -- Off-chain content (fileuri content)
  title TEXT,
  content TEXT,
  content_hash TEXT,                    -- keccak256 of canonical JSON

  -- On-chain tracking
  tx_hash TEXT,                         -- giveFeedback() transaction
  chain_id INTEGER,

  -- Owner response
  response TEXT,
  response_hash TEXT,
  response_tx_hash TEXT,                -- appendResponse() transaction
  response_at TIMESTAMPTZ,

  -- Revocation
  revoked_at TIMESTAMPTZ,
  revoke_tx_hash TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE (payment_id),                  -- One review per payment
  UNIQUE (agent_id, reviewer_address, feedback_index)
);

-- Indexes
CREATE INDEX idx_agent_reviews_agent_id ON agent_reviews(agent_id);
CREATE INDEX idx_agent_reviews_reviewer ON agent_reviews(reviewer_address);
CREATE INDEX idx_agent_reviews_created ON agent_reviews(created_at DESC);
```

### Table: `feedback_auth_tokens`

```sql
CREATE TABLE feedback_auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES agent_payments(id),
  client_address TEXT NOT NULL,         -- Payer's wallet
  signature TEXT NOT NULL,              -- Full feedbackAuth string
  index_limit INTEGER NOT NULL,
  expiry BIGINT NOT NULL,               -- Unix timestamp
  chain_id INTEGER NOT NULL,
  used_at TIMESTAMPTZ,                  -- Set when review submitted
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (payment_id)                   -- One token per payment
);

-- Index for lookup
CREATE INDEX idx_feedback_auth_agent ON feedback_auth_tokens(agent_id, signature);
```

### View: `agent_review_stats`

```sql
CREATE VIEW agent_review_stats AS
SELECT
  agent_id,
  COUNT(*) as review_count,
  ROUND(AVG(score)::numeric, 1) as avg_score,
  ROUND((AVG(score) / 20)::numeric, 1) as avg_rating,
  COUNT(*) FILTER (WHERE score >= 81) as five_star,
  COUNT(*) FILTER (WHERE score >= 61 AND score <= 80) as four_star,
  COUNT(*) FILTER (WHERE score >= 41 AND score <= 60) as three_star,
  COUNT(*) FILTER (WHERE score >= 21 AND score <= 40) as two_star,
  COUNT(*) FILTER (WHERE score <= 20) as one_star
FROM agent_reviews
WHERE revoked_at IS NULL
GROUP BY agent_id;
```

---

## Score Mapping

| Stars (UI) | Score (On-Chain) |
|------------|------------------|
| 1 star     | 0-20             |
| 2 stars    | 21-40            |
| 3 stars    | 41-60            |
| 4 stars    | 61-80            |
| 5 stars    | 81-100           |

---

## API Endpoints

### Agent Publish Flow

#### 1. Generate Feedback Signer
```
POST /api/agents/[id]/publish
```
**Generates** a new keypair and stores it encrypted. Returns the signer address.

```json
{
  "feedbackSignerAddress": "0xABC...",
  "requiresOperatorSetup": true
}
```

#### 2. Confirm Operator Setup
```
POST /api/agents/[id]/publish/confirm-operator
Body: { "txHash": "0x..." }
```
**Called after** owner submits setOperator() transaction.

### Review Submission Flow

#### 1. Submit Review
```
POST /api/marketplace/[id]/reviews
Body: {
  "feedbackAuth": "0x...",
  "score": 85,
  "title": "Great agent!",
  "content": "...",
  "tag1": "fast",
  "tag2": "accurate"
}
```

#### 2. Confirm On-Chain
```
POST /api/marketplace/[id]/reviews/[reviewId]/confirm
Body: { "txHash": "0x...", "feedbackIndex": 1 }
```

### Read Reviews

#### Get Agent Reviews
```
GET /api/marketplace/[id]/reviews?page=1&limit=10&sort=recent
```

#### Get Review Content (fileuri)
```
GET /api/reviews/[reviewId]
```

---

## On-Chain Contract Interfaces

### IIdentityRegistry

```solidity
interface IIdentityRegistry {
    // Called by agent owner during publish
    function setOperator(
        uint256 agentId,
        address operator,
        bool approved
    ) external;

    // Called to verify operator status
    function isOperator(
        uint256 agentId,
        address operator
    ) external view returns (bool);

    function ownerOf(uint256 agentId) external view returns (address);
}
```

### IReputationRegistry

```solidity
interface IReputationRegistry {
    // Submit feedback (called by reviewer)
    function giveFeedback(
        uint256 agentId,
        uint8 score,
        bytes32 tag1,
        bytes32 tag2,
        string calldata fileuri,
        bytes32 filehash,
        bytes calldata feedbackAuth
    ) external;

    // Get feedback count for a user-agent pair
    function getFeedbackCount(
        uint256 agentId,
        address clientAddress
    ) external view returns (uint256);

    // Revoke own feedback
    function revokeFeedback(
        uint256 agentId,
        uint64 feedbackIndex
    ) external;

    // Agent owner adds response
    function appendResponse(
        uint256 agentId,
        uint64 feedbackIndex,
        string calldata responseUri,
        bytes32 responseHash
    ) external;

    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint8 score,
        bytes32 indexed tag1,
        bytes32 tag2,
        string fileuri,
        bytes32 filehash
    );
}
```

---

## feedbackAuth Encoding

The feedbackAuth is a packed encoding of the authorization tuple plus signature:

```typescript
import { keccak256, encodePacked, encodeAbiParameters } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

interface FeedbackAuthData {
  agentId: bigint;
  clientAddress: `0x${string}`;
  indexLimit: bigint;
  expiry: bigint;
  chainId: bigint;
  identityRegistry: `0x${string}`;
  signerAddress: `0x${string}`;
}

async function signFeedbackAuth(
  data: FeedbackAuthData,
  privateKey: `0x${string}`
): Promise<`0x${string}`> {
  const signer = privateKeyToAccount(privateKey);

  // Create message hash (EIP-191 style)
  const messageHash = keccak256(
    encodePacked(
      ['uint256', 'address', 'uint256', 'uint256', 'uint256', 'address', 'address'],
      [
        data.agentId,
        data.clientAddress,
        data.indexLimit,
        data.expiry,
        data.chainId,
        data.identityRegistry,
        data.signerAddress
      ]
    )
  );

  // Sign the hash
  const signature = await signer.signMessage({
    message: { raw: messageHash }
  });

  // Encode full feedbackAuth (data + signature)
  return encodeAbiParameters(
    [
      { name: 'agentId', type: 'uint256' },
      { name: 'clientAddress', type: 'address' },
      { name: 'indexLimit', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'chainId', type: 'uint256' },
      { name: 'identityRegistry', type: 'address' },
      { name: 'signerAddress', type: 'address' },
      { name: 'signature', type: 'bytes' }
    ],
    [
      data.agentId,
      data.clientAddress,
      data.indexLimit,
      data.expiry,
      data.chainId,
      data.identityRegistry,
      data.signerAddress,
      signature
    ]
  ) as `0x${string}`;
}
```

---

## Implementation Checklist

### Phase 1: Database & API Foundation
- [x] Add feedback signer columns to agents table (`20241216000001_agent_feedback_signer.sql`)
- [x] Create agent_reviews table (`20241216000000_agent_reviews.sql`)
- [x] Create feedback_auth_tokens table
- [x] Create agent_review_stats view
- [x] Add review types to supabase.ts

### Phase 2: Publish Flow Integration (Simplified - Same 2 API Calls)
- [x] Update /api/agents/[id]/publish to generate keypair (returns `feedbackSignerAddress`)
- [x] Update /api/agents/[id]/publish/confirm to accept optional `operatorTxHash`
- [ ] Add SetOperator UI step in publish modal (after ERC-8004 registration)
- [ ] Store operator tx confirmation in confirm endpoint

### Phase 3: Payment Flow Integration
- [x] Add signFeedbackAuth utility function (`src/lib/erc8004/feedbackAuth.ts`)
- [x] Update payment proxy (`/api/v1/call/[agentId]`) to generate feedbackAuth
- [x] Add X-Feedback-Auth and X-Feedback-Expires headers to payment responses
- [x] Store feedbackAuth tokens in database

### Phase 4: Review Submission
- [x] POST /api/marketplace/[id]/reviews endpoint (validates feedbackAuth)
- [ ] Create POST /api/marketplace/[id]/reviews/[reviewId]/confirm for on-chain tx
- [ ] Add ReviewForm component
- [ ] Integrate on-chain giveFeedback() call in frontend

### Phase 5: Review Display
- [x] Update marketplace detail page reviews tab (using real data)
- [ ] Add individual review display with on-chain verification badge
- [ ] Add owner response display
- [ ] Add review stats to agent cards

---

## Security Considerations

1. **Private Key Storage**: Feedback signer keys encrypted at rest
2. **One Review Per Payment**: Enforced by database unique constraint
3. **Token Expiry**: 7-day default, configurable
4. **Signature Verification**: On-chain contract validates feedbackAuth
5. **Operator Authorization**: On-chain setOperator() required
6. **Rate Limiting**: API-level protection against spam
