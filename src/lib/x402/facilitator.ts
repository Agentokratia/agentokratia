// x402 Facilitator - Using Agentokratia's escrow facilitator
import {
  HTTPFacilitatorClient,
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from '@x402/core/http';
import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
} from '@x402/core/types';
import { createPublicClient, http, encodeFunctionData, parseSignature, type Hex } from 'viem';
import { baseSepolia, base } from 'viem/chains';

// Environment variables
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || 'https://facilitator.agentokratia.com';
const X402_API_KEY = process.env.X402_API_KEY || '';

// EIP-3009 ABI for payment simulation
const eip3009ABI = [
  {
    name: 'transferWithAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

// Network to chain mapping
function getChainFromNetwork(network: string) {
  const chainId = parseInt(network.split(':')[1]);
  switch (chainId) {
    case 84532:
      return baseSepolia;
    case 8453:
      return base;
    default:
      return baseSepolia;
  }
}

// Payload structure for exact scheme (for simulation)
interface ExactEvmPayload {
  authorization: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
  };
  signature: string;
}

// Simulation response type
export interface SimulateResponse {
  success: boolean;
  error?: string;
  errorReason?:
    | 'self_payment'
    | 'insufficient_balance'
    | 'invalid_nonce'
    | 'invalid_signature'
    | 'simulation_failed';
}

// Create HTTP facilitator client for Agentokratia facilitator
const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
  createAuthHeaders: async (): Promise<{
    verify: Record<string, string>;
    settle: Record<string, string>;
    supported: Record<string, string>;
  }> => {
    const authHeader: Record<string, string> = X402_API_KEY
      ? { Authorization: `Bearer ${X402_API_KEY}` }
      : {};
    return {
      verify: authHeader,
      settle: authHeader,
      supported: {},
    };
  },
});

/**
 * Simulate the transferWithAuthorization call to catch errors early
 * Works with both exact and escrow schemes
 */
export async function simulatePayment(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
  rpcUrl: string
): Promise<SimulateResponse> {
  try {
    // Check if this is an escrow payload (has sessionId or sessionToken)
    const payload = paymentPayload.payload as Record<string, unknown>;
    if (payload.sessionId || payload.sessionToken) {
      // Escrow payments are validated by the facilitator, not simulated on-chain
      return { success: true };
    }

    // Extract payload matching exact scheme structure
    const exactEvmPayload = paymentPayload.payload as unknown as ExactEvmPayload;

    if (!exactEvmPayload.authorization || !exactEvmPayload.signature) {
      return {
        success: false,
        error: 'Invalid payload structure',
        errorReason: 'simulation_failed',
      };
    }

    const { authorization, signature } = exactEvmPayload;

    // Quick check for self-payment (from == to)
    if (authorization.from.toLowerCase() === authorization.to.toLowerCase()) {
      return {
        success: false,
        error: 'Self-payment not allowed - payer and recipient are the same address',
        errorReason: 'self_payment',
      };
    }

    // Create public client for simulation
    const chain = getChainFromNetwork(paymentRequirements.network);
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    // Parse signature using viem
    const parsedSig = parseSignature(signature as Hex);

    // Convert yParity (0/1) to v (27/28) if needed - USDC expects 27 or 28
    const v = parsedSig.v !== undefined ? Number(parsedSig.v) : Number(parsedSig.yParity) + 27;

    // Encode the transferWithAuthorization call
    const callData = encodeFunctionData({
      abi: eip3009ABI,
      functionName: 'transferWithAuthorization',
      args: [
        authorization.from as Hex,
        authorization.to as Hex,
        BigInt(authorization.value),
        BigInt(authorization.validAfter),
        BigInt(authorization.validBefore),
        authorization.nonce as Hex,
        v,
        parsedSig.r,
        parsedSig.s,
      ],
    });

    // Simulate the call using eth_call
    await publicClient.call({
      to: paymentRequirements.asset as Hex,
      data: callData,
    });

    // If no error thrown, simulation succeeded
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[x402] Simulation error:', errorMessage);

    // Parse common error reasons
    let errorReason: SimulateResponse['errorReason'] = 'simulation_failed';
    if (errorMessage.includes('insufficient') || errorMessage.includes('balance')) {
      errorReason = 'insufficient_balance';
    } else if (errorMessage.includes('nonce') || errorMessage.includes('already used')) {
      errorReason = 'invalid_nonce';
    } else if (errorMessage.includes('signature') || errorMessage.includes('invalid')) {
      errorReason = 'invalid_signature';
    }

    return {
      success: false,
      error: `Simulation failed: ${errorMessage}`,
      errorReason,
    };
  }
}

// Verify payment with Agentokratia facilitator
export async function verifyPayment(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements
): Promise<VerifyResponse> {
  try {
    const result = await facilitatorClient.verify(paymentPayload, paymentRequirements);
    return result;
  } catch (error) {
    console.error('[x402] Verify error:', error);
    return { isValid: false, invalidReason: 'Verification service error' };
  }
}

// Settle payment with Agentokratia facilitator
export async function settlePayment(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements
): Promise<SettleResponse> {
  try {
    const result = await facilitatorClient.settle(paymentPayload, paymentRequirements);
    return result;
  } catch (error) {
    console.error('[x402] Settle error:', error);
    return {
      success: false,
      errorReason: 'Settlement service error',
      transaction: '',
      network: paymentRequirements.network,
    };
  }
}

// Re-export header utilities
export { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader };
