// x402 Protocol Constants
export const X402_VERSION = 2;

// x402 v2 Header names
export const X402_HEADERS = {
  PAYMENT_REQUIRED: 'payment-required',
  PAYMENT: 'payment-signature',
  PAYMENT_RESPONSE: 'payment-response',
} as const;
