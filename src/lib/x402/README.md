# x402 Payment Flow

## How It Works

POST → 402 → Sign → POST with payment → 200

```
CLIENT                                    SERVER
  │                                         │
  │─── POST /api/v1/call/{id} ─────────────►│
  │                                         │ No payment header?
  │◄── 402 + payment-required header ───────│
  │                                         │
  │ Sign EIP-3009 (wallet)                  │
  │                                         │
  │─── POST + payment-signature header ────►│
  │                                         │ Verify → Forward → Settle
  │◄── 200 + data + payment-response ───────│
  │                                         │
```

## Files

| File                  | Purpose                             |
| --------------------- | ----------------------------------- |
| `types.ts`            | Constants (headers, USDC addresses) |
| `client.ts`           | POST with 402 retry logic           |
| `useAgentCall.ts`     | React hook for UI                   |
| `usePaymentSigner.ts` | EIP-3009 signing                    |
| `facilitator.ts`      | Server-side CDP verify/settle       |

## Packages

| Package          | Where  | Purpose                |
| ---------------- | ------ | ---------------------- |
| `@coinbase/x402` | Server | CDP facilitator config |
| `@x402/core`     | Both   | Types, header encoding |
| `@x402/evm`      | Client | EIP-3009 signing       |

## Usage

```typescript
import { useAgentCall } from '@/lib/x402';

const { call, state, response } = useAgentCall();

const result = await call('agent-id', { query: 'Hello' });
if (result.success) {
  console.log(result.data);
  console.log(result.paymentResponse?.transaction);
}
```

## Environment

```env
CDP_API_KEY=...
CDP_API_SECRET=...
NEXT_PUBLIC_CHAIN_ID=84532  # Base Sepolia (or 8453 for mainnet)
```
