import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';
import {
  verifyPayment,
  settlePayment,
  simulatePayment,
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from '@/lib/x402/facilitator';
import { X402_HEADERS, X402_VERSION } from '@/lib/x402/types';
import { getNetworkConfig, getDefaultNetworkConfig, type NetworkConfig } from '@/lib/network';
import { createFeedbackAuth, decryptPrivateKey } from '@/lib/erc8004/feedbackAuth';
import { getOnChainOwner } from '@/lib/ownership';
import { centsToUsdcUnits, centsToUsdcString } from '@/lib/utils/format';
import type { PaymentPayload, PaymentRequired, Network } from '@x402/core/types';

// Config
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;
const MAX_REQUEST_SIZE = 10 * 1024 * 1024;

// SSRF protection (bypassed in local dev)
function isInternalUrl(url: string): boolean {
  // Allow localhost in development
  if (
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_APP_URL?.includes('localhost')
  ) {
    return false;
  }
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '::1'].includes(h)) return true;
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
    if (h.endsWith('.internal') || h.endsWith('.local')) return true;
    return false;
  } catch {
    return true;
  }
}

// Headers to skip when forwarding
const SKIP_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'authorization',
  'cookie',
  'x-payment',
  'x-payment-required',
  'x-payment-response',
  'x-agentokratia-request-id',
  'x-agentokratia-agent-id',
  'x-agentokratia-caller',
  'x-agentokratia-timestamp',
  'x-agentokratia-secret',
]);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Payment-Signature, Accept',
  'Access-Control-Expose-Headers':
    'Payment-Required, Payment-Response, X-Agentokratia-Request-Id, X-Feedback-Auth, X-Feedback-Expires',
};

// Helpers
const jsonResponse = (body: object, status: number, headers: Record<string, string> = {}) =>
  new NextResponse(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...headers },
  });

const errorResponse = (message: string, status: number, requestId?: string) =>
  jsonResponse(
    { error: message, ...(requestId && { requestId }) },
    status,
    requestId ? { 'X-Agentokratia-Request-Id': requestId } : {}
  );

// Look up agent by handle and slug
async function getAgentByHandleSlug(
  handle: string,
  slug: string
): Promise<{
  agent: {
    id: string;
    name: string;
    slug: string;
    endpoint_url: string;
    price_per_call: number;
    timeout_ms: number | null;
    status: string;
    owner_id: string;
    agent_secret: string | null;
    erc8004_chain_id: number | null;
    erc8004_token_id: string | null;
    feedback_signer_address: string | null;
    feedback_signer_private_key: string | null;
    feedback_operator_set_at: string | null;
  };
  ownerWallet: string;
  ownerSource: 'onchain' | 'db';
} | null> {
  // First find the user by handle
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, wallet_address')
    .eq('handle', handle.toLowerCase())
    .single();

  if (userError || !user) return null;

  // Then find the agent by owner and slug
  const { data, error } = await supabaseAdmin
    .from('agents')
    .select(
      `id, name, slug, endpoint_url, price_per_call, timeout_ms, status, owner_id,
             agent_secret, erc8004_chain_id, erc8004_token_id,
             feedback_signer_address, feedback_signer_private_key, feedback_operator_set_at`
    )
    .eq('owner_id', user.id)
    .eq('slug', slug.toLowerCase())
    .eq('status', 'live')
    .single();

  if (error || !data) return null;

  // Validate endpoint
  if (
    !data.endpoint_url ||
    data.endpoint_url === 'https://placeholder.example.com' ||
    isInternalUrl(data.endpoint_url)
  ) {
    return null;
  }

  // CRITICAL: For on-chain agents, ALWAYS use on-chain owner for payments
  if (data.erc8004_token_id && data.erc8004_chain_id) {
    const onChainOwner = await getOnChainOwner(data.erc8004_token_id, data.erc8004_chain_id);
    if (onChainOwner) {
      return { agent: data, ownerWallet: onChainOwner, ownerSource: 'onchain' };
    }
    console.error('[Proxy] CRITICAL: On-chain owner lookup failed for agent:', data.id);
    throw new Error('ONCHAIN_VERIFICATION_FAILED');
  }

  // Fallback for non-on-chain agents
  return { agent: data, ownerWallet: user.wallet_address, ownerSource: 'db' };
}

interface PaymentRecord {
  agentId: string;
  caller: string;
  recipient: string;
  cents: number;
  txHash: string | null;
  requestId: string;
  status: string;
  network: Network;
  startedAt?: number;
  responseTimeMs?: number;
  success?: boolean;
  httpStatus?: number;
  errorCode?: string;
}

async function recordPayment(record: PaymentRecord): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from('agent_payments')
      .insert({
        agent_id: record.agentId,
        caller_address: record.caller,
        recipient_address: record.recipient,
        amount_cents: record.cents,
        tx_hash: record.txHash,
        network: record.network,
        status: record.status,
        request_id: record.requestId,
        started_at: record.startedAt ? new Date(record.startedAt).toISOString() : null,
        response_time_ms: record.responseTimeMs,
        success: record.success,
        http_status: record.httpStatus,
        error_code: record.errorCode,
      })
      .select('id')
      .single();
    return data?.id || null;
  } catch (e) {
    console.error('[Proxy] Record payment failed:', e);
    return null;
  }
}

interface FeedbackAuthAgent {
  id: string;
  erc8004_token_id: string | null;
  erc8004_chain_id: number | null;
  feedback_signer_address: string | null;
  feedback_signer_private_key: string | null;
  feedback_operator_set_at: string | null;
}

async function generateFeedbackAuthForPayment(
  agent: FeedbackAuthAgent,
  caller: `0x${string}`,
  networkConfig: NetworkConfig,
  paymentId: string
): Promise<{ feedbackAuth: string; expiry: string } | null> {
  try {
    if (
      !agent.feedback_signer_address ||
      !agent.feedback_signer_private_key ||
      !agent.feedback_operator_set_at ||
      !agent.erc8004_token_id ||
      !agent.erc8004_chain_id ||
      !networkConfig.identityRegistryAddress
    ) {
      return null;
    }

    const privateKey = decryptPrivateKey(agent.feedback_signer_private_key);

    const { count: existingReviewCount } = await supabaseAdmin
      .from('agent_reviews')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .eq('reviewer_address', caller)
      .is('revoked_at', null);

    const result = await createFeedbackAuth({
      agentId: agent.erc8004_token_id,
      clientAddress: caller,
      currentFeedbackIndex: existingReviewCount || 0,
      chainId: agent.erc8004_chain_id,
      identityRegistryAddress: networkConfig.identityRegistryAddress as `0x${string}`,
      signerAddress: agent.feedback_signer_address as `0x${string}`,
      signerPrivateKey: privateKey,
      expiryMinutes: 30,
    });

    await supabaseAdmin.from('feedback_auth_tokens').insert({
      payment_id: paymentId,
      agent_id: agent.id,
      erc8004_agent_id: agent.erc8004_token_id,
      client_address: caller,
      index_limit: Number(result.data.indexLimit),
      expiry: Number(result.data.expiry),
      chain_id: agent.erc8004_chain_id,
      signer_address: agent.feedback_signer_address,
      signature: result.feedbackAuth,
    });

    return {
      feedbackAuth: result.feedbackAuth,
      expiry: result.data.expiry.toString(),
    };
  } catch (e) {
    console.error('[Proxy] Failed to generate feedbackAuth:', e);
    return null;
  }
}

function buildPaymentRequired(
  agent: { name: string; price_per_call: number },
  ownerWallet: string,
  resource: string,
  networkConfig: NetworkConfig
): PaymentRequired {
  return {
    x402Version: X402_VERSION,
    resource: {
      url: resource,
      description: `API call to ${agent.name}`,
      mimeType: 'application/json',
    },
    accepts: [
      {
        scheme: 'exact',
        network: networkConfig.network,
        asset: networkConfig.usdcAddress,
        amount: centsToUsdcUnits(agent.price_per_call).toString(),
        payTo: ownerWallet,
        maxTimeoutSeconds: 300,
        extra: {
          name: networkConfig.usdcEip712Domain.name,
          version: networkConfig.usdcEip712Domain.version,
        },
      },
    ],
  };
}

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// Main proxy endpoint - handle/slug version
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string; slug: string }> }
) {
  const { handle, slug } = await params;
  const requestId = crypto.randomUUID();
  const timestamp = Date.now();
  const baseUrl =
    request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost';
  const resource = `${request.headers.get('x-forwarded-proto') || 'https'}://${baseUrl}/api/v1/call/${handle}/${slug}`;

  // 1. Get agent by handle/slug with on-chain owner verification
  let result;
  try {
    result = await getAgentByHandleSlug(handle, slug);
  } catch (e) {
    if (e instanceof Error && e.message === 'ONCHAIN_VERIFICATION_FAILED') {
      return errorResponse(
        'Blockchain verification temporarily unavailable. Please retry.',
        503,
        requestId
      );
    }
    throw e;
  }
  if (!result) return errorResponse('Agent not found or not active', 404, requestId);
  const { agent, ownerWallet } = result;

  // 2. Network config
  let networkConfig: NetworkConfig;
  try {
    if (agent.erc8004_chain_id) {
      networkConfig = await getNetworkConfig(agent.erc8004_chain_id);
    } else {
      networkConfig = await getDefaultNetworkConfig();
    }
  } catch {
    return errorResponse('Unsupported network for this agent', 503, requestId);
  }

  const paymentRequired = buildPaymentRequired(agent, ownerWallet, resource, networkConfig);

  // 3. Check payment header
  const paymentHeader = request.headers.get(X402_HEADERS.PAYMENT);
  if (!paymentHeader) {
    const priceUsdc = centsToUsdcString(agent.price_per_call);
    return jsonResponse(
      {
        error: 'Payment required',
        message: `This API costs ${priceUsdc} USDC per call`,
        agentId: agent.id,
        agentName: agent.name,
        priceUsdc,
      },
      402,
      {
        [X402_HEADERS.PAYMENT_REQUIRED]: encodePaymentRequiredHeader(paymentRequired),
        'X-Agentokratia-Request-Id': requestId,
      }
    );
  }

  // 4. Parse & validate payment
  let paymentPayload: PaymentPayload;
  try {
    paymentPayload = decodePaymentSignatureHeader(paymentHeader);
  } catch {
    return errorResponse('Invalid payment header format', 400, requestId);
  }

  const paymentReqs = paymentPayload.accepted;
  const expected = paymentRequired.accepts[0];
  if (
    paymentReqs.amount !== expected.amount ||
    paymentReqs.payTo.toLowerCase() !== expected.payTo.toLowerCase() ||
    paymentReqs.network !== expected.network ||
    paymentReqs.asset.toLowerCase() !== expected.asset.toLowerCase()
  ) {
    return errorResponse('Payment requirements mismatch', 400, requestId);
  }

  // 5. Verify with facilitator
  const verifyResult = await verifyPayment(paymentPayload, paymentReqs);
  if (!verifyResult.isValid) {
    return jsonResponse(
      { error: 'Payment verification failed', reason: verifyResult.invalidReason },
      402,
      {
        [X402_HEADERS.PAYMENT_REQUIRED]: encodePaymentRequiredHeader(paymentRequired),
        'X-Agentokratia-Request-Id': requestId,
      }
    );
  }
  const caller = verifyResult.payer || 'unknown';

  // 5b. Simulate payment
  const simResult = await simulatePayment(paymentPayload, paymentReqs, networkConfig.rpcUrl);
  if (!simResult.success) {
    console.error('[Proxy] SIMULATION FAILED:', {
      requestId,
      agentId: agent.id,
      caller,
      error: simResult.error,
      reason: simResult.errorReason,
    });
    return jsonResponse(
      {
        error: 'Payment simulation failed',
        reason: simResult.errorReason,
        details: simResult.error,
      },
      400,
      { 'X-Agentokratia-Request-Id': requestId }
    );
  }

  // 6. Read body
  let body: string;
  try {
    body = await request.text();
    if (body.length > MAX_REQUEST_SIZE)
      return errorResponse('Request body too large', 413, requestId);
  } catch {
    return errorResponse('Failed to read request body', 400, requestId);
  }

  // 7. Build target headers
  const targetHeaders: Record<string, string> = {
    'X-Agentokratia-Request-Id': requestId,
    'X-Agentokratia-Agent-Id': agent.id,
    'X-Agentokratia-Caller': caller,
    'X-Agentokratia-Timestamp': timestamp.toString(),
  };

  if (agent.agent_secret) {
    targetHeaders['X-Agentokratia-Secret'] = agent.agent_secret;
  }

  request.headers.forEach((v, k) => {
    if (!SKIP_HEADERS.has(k.toLowerCase()) && !targetHeaders[k]) targetHeaders[k] = v;
  });

  // 8. Forward to target
  let targetResponse: Response, targetBody: string, targetContentType: string;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      Math.min(agent.timeout_ms || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS)
    );
    try {
      targetResponse = await fetch(agent.endpoint_url, {
        method: 'POST',
        headers: targetHeaders,
        body: body || undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    targetBody = await targetResponse.text();
    targetContentType = targetResponse.headers.get('content-type') || 'application/json';
  } catch (e) {
    console.error('[Proxy] Target error:', e);
    const responseTimeMs = Date.now() - timestamp;
    const isTimeout = e instanceof Error && e.name === 'AbortError';
    await recordPayment({
      agentId: agent.id,
      caller,
      recipient: ownerWallet,
      cents: agent.price_per_call,
      txHash: null,
      requestId,
      status: 'failed',
      network: networkConfig.network,
      startedAt: timestamp,
      responseTimeMs,
      success: false,
      errorCode: isTimeout ? 'TIMEOUT' : 'TARGET_ERROR',
    });
    return errorResponse(
      isTimeout ? 'Target API timeout' : 'Target API unavailable',
      502,
      requestId
    );
  }

  const responseTimeMs = Date.now() - timestamp;

  // 9. Target error = no charge
  if (!targetResponse.ok) {
    await recordPayment({
      agentId: agent.id,
      caller,
      recipient: ownerWallet,
      cents: agent.price_per_call,
      txHash: null,
      requestId,
      status: 'failed',
      network: networkConfig.network,
      startedAt: timestamp,
      responseTimeMs,
      success: false,
      httpStatus: targetResponse.status,
      errorCode: 'TARGET_ERROR',
    });
    return new NextResponse(targetBody, {
      status: targetResponse.status,
      headers: {
        'Content-Type': targetContentType,
        ...CORS,
        'X-Agentokratia-Request-Id': requestId,
      },
    });
  }

  // 10. Re-verify ownership before settlement
  if (agent.erc8004_token_id && agent.erc8004_chain_id) {
    const currentOwner = await getOnChainOwner(agent.erc8004_token_id, agent.erc8004_chain_id);
    if (!currentOwner || currentOwner.toLowerCase() !== ownerWallet.toLowerCase()) {
      console.error('[Proxy] OWNER_CHANGED: NFT transferred during payment', {
        requestId,
        agentId: agent.id,
        caller,
        expectedOwner: ownerWallet,
        currentOwner: currentOwner || 'lookup_failed',
      });
      await recordPayment({
        agentId: agent.id,
        caller,
        recipient: ownerWallet,
        cents: agent.price_per_call,
        txHash: null,
        requestId,
        status: 'failed',
        network: networkConfig.network,
        startedAt: timestamp,
        responseTimeMs,
        success: false,
        errorCode: 'OWNER_CHANGED',
      });
      return errorResponse('Agent ownership changed during payment. Please retry.', 409, requestId);
    }
  }

  // 11. Settle with retry
  let settleResult: Awaited<ReturnType<typeof settlePayment>> | null = null,
    lastError: string | undefined;
  for (let i = 1; i <= 3; i++) {
    settleResult = await settlePayment(paymentPayload, paymentReqs);
    if (settleResult.success) break;
    lastError = settleResult.errorReason;
    if (i < 3) await new Promise((r) => setTimeout(r, 500 * i));
  }

  let paymentId: string | null = null;
  let feedbackAuthResult: { feedbackAuth: string; expiry: string } | null = null;

  if (!settleResult?.success) {
    console.error('[Proxy] SETTLEMENT FAILED:', {
      requestId,
      agentId: agent.id,
      caller,
      ownerWallet,
      amount: agent.price_per_call,
      error: lastError,
    });
    paymentId = await recordPayment({
      agentId: agent.id,
      caller,
      recipient: ownerWallet,
      cents: agent.price_per_call,
      txHash: null,
      requestId,
      status: 'verified',
      network: networkConfig.network,
      startedAt: timestamp,
      responseTimeMs,
      success: true,
      httpStatus: targetResponse.status,
    });
  } else {
    paymentId = await recordPayment({
      agentId: agent.id,
      caller,
      recipient: ownerWallet,
      cents: agent.price_per_call,
      txHash: settleResult.transaction || null,
      requestId,
      status: 'settled',
      network: networkConfig.network,
      startedAt: timestamp,
      responseTimeMs,
      success: true,
      httpStatus: targetResponse.status,
    });
    try {
      await supabaseAdmin.rpc('increment_agent_stats', {
        p_agent_id: agent.id,
        p_amount_cents: agent.price_per_call,
      });
    } catch {}

    if (paymentId) {
      feedbackAuthResult = await generateFeedbackAuthForPayment(
        agent as FeedbackAuthAgent,
        caller as `0x${string}`,
        networkConfig,
        paymentId
      );
    }
  }

  // 12. Return response
  const responseHeaders: Record<string, string> = {
    'Content-Type': targetContentType,
    ...CORS,
    [X402_HEADERS.PAYMENT_RESPONSE]: encodePaymentResponseHeader({
      success: settleResult?.success ?? false,
      errorReason: settleResult?.errorReason ?? lastError,
      payer: caller,
      transaction: settleResult?.transaction ?? '',
      network: networkConfig.network,
      requirements: paymentReqs,
    }),
    'X-Agentokratia-Request-Id': requestId,
  };

  if (feedbackAuthResult) {
    responseHeaders['X-Feedback-Auth'] = feedbackAuthResult.feedbackAuth;
    responseHeaders['X-Feedback-Expires'] = feedbackAuthResult.expiry;
  }

  return new NextResponse(targetBody, {
    status: targetResponse.status,
    headers: responseHeaders,
  });
}

// Reject other methods
const methodNotAllowed = () => errorResponse('Method not allowed. Use POST.', 405);
export {
  methodNotAllowed as GET,
  methodNotAllowed as PUT,
  methodNotAllowed as DELETE,
  methodNotAllowed as PATCH,
};
