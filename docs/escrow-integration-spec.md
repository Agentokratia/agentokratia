# @x402/escrow Integration Specification

## Overview

This document describes the integration of `@x402/escrow` into the Agentokratia frontend, replacing the Coinbase CDP facilitator with Agentokratia's escrow facilitator for session-based payments.

## Changes Summary

### Package Dependencies

**Removed:**

- `@coinbase/x402` - CDP facilitator config
- `@x402/evm` - ExactEvmScheme (per-call signing)

**Added:**

- `@x402/core@^2.0.0` - Core protocol types and HTTP utilities
- `@x402/escrow@^2.0.0` - EscrowScheme (session-based payments)
- `@x402/fetch@^2.0.0` - Fetch wrapper with 402 handling

### Environment Variables

**Removed:**

```bash
CDP_API_KEY=...
CDP_API_SECRET=...
```

**Added:**

```bash
X402_FACILITATOR_URL=https://facilitator.agentokratia.com
X402_API_KEY=your_x402_api_key
```

---

## Architecture

### Payment Flow Comparison

#### Previous Flow (CDP - Per-Call Signing)

```
User clicks "Send Request"
  → Request returns 402
  → User signs EIP-712 (WALLET POPUP - EVERY TIME)
  → Retry with payment header
  → Response 200 OK
```

#### New Flow (Escrow - Session-Based)

```
User clicks "Send Request"
  → Check SessionManager for existing session
  → IF NO SESSION:
      → User signs EIP-712 once (WALLET POPUP - ONCE)
      → Create session on-chain via facilitator
      → Store session in localStorage via SessionManager
  → IF SESSION EXISTS:
      → Use session (NO WALLET POPUP)
  → Request with PAYMENT-SIGNATURE header
  → Response 200 OK + PAYMENT-RESPONSE header with updated balance
  → SessionManager updates balance from response
```

**Important:** Session info is embedded in the standard x402 payload and headers, NOT separate `X-Session-Id` headers. The `@x402/escrow` library uses the standard x402 protocol headers:

- `PAYMENT-REQUIRED` - 402 response with payment requirements
- `PAYMENT-SIGNATURE` - Request header with payment payload (includes session info)
- `PAYMENT-RESPONSE` - Response header with settle result (includes updated balance)

### Session Lifecycle

```
1. CREATION
   User signs EIP-712 ReceiveWithAuthorization
   → Facilitator receives signature + session params in PAYMENT-SIGNATURE header
   → Facilitator calls USDC.transferWithAuthorization() on-chain
   → PAYMENT-RESPONSE includes: { session: { id, token, balance, expiresAt } }
   → EscrowScheme's SessionManager stores in localStorage

2. USAGE
   EscrowScheme.createPaymentPayload() returns session usage payload
   → PAYMENT-SIGNATURE includes: { sessionId, sessionToken, amount, requestId }
   → Facilitator validates session, debits balance
   → PAYMENT-RESPONSE includes: { session: { balance: newBalance } }
   → SessionManager updates local balance

3. EXPIRY
   Session has authorizationExpiry (default: 1 hour)
   → SessionManager.hasValid() returns false after expiry
   → Next request triggers new session creation

4. RECLAIM (User-Initiated)
   User can reclaim unused funds before refundExpiry (24 hours after session expires)
   → Call facilitator /reclaim endpoint
   → Escrow contract returns remaining balance to user
   → Session removed from SessionManager
```

---

## File Changes

### `src/lib/x402/facilitator.ts`

Server-side facilitator client now points to Agentokratia:

```typescript
import { HTTPFacilitatorClient } from '@x402/core/http';

const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || 'https://facilitator.agentokratia.com';
const X402_API_KEY = process.env.X402_API_KEY || '';

const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
  createAuthHeaders: async () => ({
    verify: X402_API_KEY ? { Authorization: `Bearer ${X402_API_KEY}` } : {},
    settle: X402_API_KEY ? { Authorization: `Bearer ${X402_API_KEY}` } : {},
    supported: {},
  }),
});
```

### `src/lib/x402/usePaymentSigner.ts`

Client-side hook now uses EscrowScheme with session support:

```typescript
import { EscrowScheme, type StoredSession } from '@x402/escrow/client';

// Singleton to preserve sessions across hook re-renders
let escrowSchemeInstance: EscrowScheme | null = null;

export function usePaymentSigner(): UsePaymentSignerResult {
  const scheme = useMemo(() => {
    if (!walletClient?.account) return null;
    if (!escrowSchemeInstance || escrowSchemeInstance.address !== walletClient.account.address) {
      escrowSchemeInstance = new EscrowScheme(signer, {
        storage: 'localStorage',
        sessionDuration: 3600, // 1 hour
        refundWindow: 86400, // 24 hours
      });
    }
    return escrowSchemeInstance;
  }, [walletClient]);

  return {
    signPayment,
    sessions, // Session management methods
    scheme, // Direct scheme access
  };
}
```

### `src/lib/x402/useAgentCall.ts`

Updated with session-aware states:

```typescript
export type AgentCallState =
  | 'idle'
  | 'loading'
  | 'creating-session' // User signing for new session
  | 'using-session' // Using existing session (instant, no signature)
  | 'signing' // Legacy: per-call signing
  | 'processing'
  | 'success'
  | 'error';

export interface UseAgentCallResult<T = unknown> {
  // State
  state: AgentCallState;
  response: X402Response<T> | null;
  error: string | null;

  // Session info for UI
  session: StoredSession | null;
  hasActiveSession: boolean;
  sessions: SessionInfo | null;
  needsSignature: boolean;

  // Actions
  call: (handle: string, slug: string, body: unknown) => Promise<X402Response<T>>;
  reset: () => void;
}
```

### `src/lib/x402/client.ts`

Added session extraction from response:

```typescript
export interface SessionResponseInfo {
  sessionId?: string;
  balance?: string;
  token?: string;
}

export interface X402Response<T = unknown> {
  // ... existing fields ...
  sessionInfo?: SessionResponseInfo;
}
```

### `src/lib/x402/errors.ts` (New)

Session-specific error types:

```typescript
export type SessionErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'SESSION_EXPIRED'
  | 'SESSION_NOT_FOUND'
  | 'DEPOSIT_TOO_LOW'
  | 'DEPOSIT_TOO_HIGH'
  | 'USER_REJECTED'
  | 'NETWORK_MISMATCH'
  | 'FACILITATOR_ERROR';

export class SessionError extends Error {
  constructor(
    message: string,
    public code: SessionErrorCode,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SessionError';
  }
}
```

---

## New Components

### `src/components/x402/SessionBadge`

Displays active session status:

```tsx
<SessionBadge
  session={agentCall.session}
  pricePerCall={pricePerCall}
  onManage={() => {
    /* open session management */
  }}
/>
```

Shows:

- Current balance (e.g., "$8.50 (170 calls)")
- Time remaining (e.g., "45m remaining")
- Warning indicators for low balance or expiring soon

### `src/components/x402/DepositModal`

Deposit amount selection for new sessions:

```tsx
<DepositModal
  open={showDepositModal}
  onOpenChange={setShowDepositModal}
  onConfirm={handleCreateSession}
  agentName="@alice/code-reviewer"
  pricePerCall={5} // cents
  minDeposit="1000000" // $1.00 in atomic units
  maxDeposit="100000000" // $100.00 in atomic units
/>
```

Presets:

- $5 (~100 calls)
- $10 (~200 calls) - Recommended
- $25 (~500 calls)
- Custom amount

---

## ApiPlayground Updates

### Progress Steps (Session-Aware)

**Creating New Session:**

1. Create Session → Sign to deposit USDC
2. Processing → Creating session on-chain
3. Executing → Running agent

**Using Existing Session:**

1. Using Session → Debit from balance
2. Processing → Debiting session
3. Executing → Running agent

### Session Badge Display

When a session exists, shows:

- Balance and remaining calls
- Time until expiry
- "No signature required" indicator

---

## @x402/escrow Library API

### EscrowScheme Class

```typescript
class EscrowScheme {
  readonly scheme: 'escrow';
  readonly network: Network; // e.g., 'eip155:8453'
  readonly address: Address; // User's wallet address
  readonly sessions: SessionManager; // Session storage

  constructor(signer: ClientEvmSigner, options?: EscrowSchemeOptions);

  // Creates payment payload - auto-detects session vs new
  createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements
  ): Promise<Pick<PaymentPayload, 'x402Version' | 'payload'>>;
}
```

### SessionManager Class

```typescript
class SessionManager {
  // Store a new session
  store(session: Omit<StoredSession, 'createdAt'>): void;

  // Get session for specific receiver
  getForReceiver(receiver: Address): StoredSession | null;

  // Find session with sufficient balance
  findBest(receiver: Address, minAmount: bigint): StoredSession | null;

  // Check if valid session exists
  hasValid(receiver: Address, minAmount?: string): boolean;

  // Update balance after debit
  updateBalance(sessionId: string, newBalance: string): void;

  // Get all sessions
  getAll(): StoredSession[];

  // Remove specific session
  remove(sessionId: string): void;

  // Clear all sessions
  clear(): void;
}

interface StoredSession {
  sessionId: string;
  sessionToken: string;
  network: string;
  payer: Address;
  receiver: Address;
  balance: string; // In atomic units (USDC 6 decimals)
  authorizationExpiry: number; // Unix timestamp
  createdAt: number; // Unix timestamp
}
```

### EscrowScheme Options

```typescript
interface EscrowSchemeOptions {
  // Session storage backend (default: 'memory')
  // 'localStorage' persists across page reloads
  storage?: 'memory' | 'localStorage';

  // localStorage key (default: 'x402-sessions')
  storageKey?: string;

  // Session duration in seconds (default: 3600 = 1 hour)
  sessionDuration?: number;

  // Time after session expires when user can reclaim (default: 86400 = 24 hours)
  refundWindow?: number;
}
```

---

## Testing Checklist

- [ ] Install new dependencies: `npm install`
- [ ] Update `.env.local` with new environment variables
- [ ] Test first call creates session (wallet popup)
- [ ] Test subsequent calls use session (no wallet popup)
- [ ] Test session expiry triggers new session creation
- [ ] Test SessionBadge displays correct info
- [ ] Test DepositModal deposit options
- [ ] Test error handling for insufficient balance
- [ ] Test progress states display correctly

---

## File Structure

```
src/
├── lib/
│   └── x402/
│       ├── index.ts              # Re-exports all x402 modules
│       ├── types.ts              # x402 constants and types
│       ├── errors.ts             # Session error types (NEW)
│       ├── client.ts             # Agent call utilities (MODIFIED)
│       ├── facilitator.ts        # Server-side facilitator (MODIFIED)
│       ├── usePaymentSigner.ts   # EscrowScheme hook (MODIFIED)
│       └── useAgentCall.ts       # Agent call hook (MODIFIED)
├── components/
│   └── x402/
│       ├── index.ts              # Component exports (NEW)
│       ├── SessionBadge/         # Session status display (NEW)
│       │   ├── SessionBadge.tsx
│       │   ├── SessionBadge.module.css
│       │   └── index.ts
│       └── DepositModal/         # Deposit amount selector (NEW)
│           ├── DepositModal.tsx
│           ├── DepositModal.module.css
│           └── index.ts
```
