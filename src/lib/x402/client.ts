// x402 v2 Client - Client-side utilities for agent calls with payment
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
} from '@x402/core/types';
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from '@x402/core/http';
import { X402_HEADERS } from './types';

export interface X402Response<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorDetails?: string;
  errorReason?: string;
  paymentRequired?: PaymentRequired;
  paymentResponse?: SettleResponse;
  // Metadata
  httpStatus?: number;
  requestId?: string;
  // Feedback auth for reviews (returned on successful payment)
  feedbackAuth?: string;
  feedbackExpiry?: string;
}

// Main function to call an agent with x402 payment
export async function callAgentWithPayment<T = unknown>(
  handle: string,
  slug: string,
  body: unknown,
  createPaymentPayload?: (paymentRequired: PaymentRequired) => Promise<PaymentPayload>
): Promise<X402Response<T>> {
  const url = `/api/v1/call/${handle}/${slug}`;

  // First request - will return 402 if payment required
  const initialResponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // Get request ID from headers
  const getRequestId = (response: Response) =>
    response.headers.get('X-Agentokratia-Request-Id') || undefined;

  // If not 402, return the response
  if (initialResponse.status !== 402) {
    if (initialResponse.ok) {
      const data = await initialResponse.json();
      return {
        success: true,
        data,
        httpStatus: initialResponse.status,
        requestId: getRequestId(initialResponse),
      };
    }
    const error = await initialResponse.json().catch(() => ({ error: 'Request failed' }));
    return {
      success: false,
      error: error.error || 'Request failed',
      errorDetails: error.details,
      errorReason: error.reason,
      httpStatus: initialResponse.status,
      requestId: getRequestId(initialResponse),
    };
  }

  // Parse payment requirement from 402 response header
  const paymentRequiredHeader = initialResponse.headers.get(X402_HEADERS.PAYMENT_REQUIRED);
  if (!paymentRequiredHeader) {
    return {
      success: false,
      error: 'Payment required but no payment details provided'
    };
  }
  const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);

  // If no payment creator provided, return payment info
  if (!createPaymentPayload) {
    return {
      success: false,
      error: 'Wallet not connected',
      paymentRequired,
    };
  }

  // Create payment payload (this triggers wallet signature)
  let paymentPayload: PaymentPayload;
  try {
    paymentPayload = await createPaymentPayload(paymentRequired);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sign payment',
      paymentRequired,
    };
  }

  // Retry with payment header
  const paidResponse = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [X402_HEADERS.PAYMENT]: encodePaymentSignatureHeader(paymentPayload),
    },
    body: JSON.stringify(body),
  });

  // Parse payment response header
  const paymentResponseHeader = paidResponse.headers.get(X402_HEADERS.PAYMENT_RESPONSE);
  const paymentResponse = paymentResponseHeader
    ? decodePaymentResponseHeader(paymentResponseHeader)
    : null;

  // Parse feedback auth headers (for reviews)
  const feedbackAuth = paidResponse.headers.get('X-Feedback-Auth') || undefined;
  const feedbackExpiry = paidResponse.headers.get('X-Feedback-Expires') || undefined;

  if (paidResponse.ok) {
    const data = await paidResponse.json();
    return {
      success: true,
      data,
      paymentResponse: paymentResponse || undefined,
      httpStatus: paidResponse.status,
      requestId: getRequestId(paidResponse),
      feedbackAuth,
      feedbackExpiry,
    };
  }

  // Payment failed
  const error = await paidResponse.json().catch(() => ({ error: 'Payment failed' }));
  return {
    success: false,
    error: error.error || error.reason || 'Payment failed',
    errorDetails: error.details,
    errorReason: error.reason,
    paymentRequired,
    paymentResponse: paymentResponse || undefined,
    httpStatus: paidResponse.status,
    requestId: getRequestId(paidResponse),
  };
}
