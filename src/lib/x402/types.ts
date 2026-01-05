import type { SettleResponse } from '@x402/core/types';

// x402 Protocol Version
export const X402_VERSION = 2;

// x402 v2 Header names
export const X402_HEADERS = {
  PAYMENT_REQUIRED: 'payment-required',
  PAYMENT: 'payment-signature',
  PAYMENT_RESPONSE: 'payment-response',
} as const;

// Extended settle response for escrow scheme with session info
export interface EscrowSettleResponse extends SettleResponse {
  session?: {
    id: string;
    balance: string;
    token: string;
  };
}

// Type guard for escrow settle response
export function isEscrowSettleResponse(response: SettleResponse): response is EscrowSettleResponse {
  return 'session' in response;
}
