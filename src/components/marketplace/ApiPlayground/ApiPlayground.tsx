'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Play,
  Copy,
  Check,
  Loader2,
  Wallet,
  Shield,
  AlertTriangle,
  Zap,
  Plus,
  Trash2,
  Star,
  CheckCircle2,
  ExternalLink,
  FileText,
  MessageSquare,
  ChevronRight,
} from 'lucide-react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Button } from '@/components/ui';
import { DepositModal } from '@/components/x402/DepositModal';
import { useAgentCall, type CallOptions } from '@/lib/x402/useAgentCall';
import {
  useAllNetworks,
  useNetworkConfig,
  getExplorerTxUrl,
  getNetworkName,
} from '@/lib/network/client';
import { formatUsdc } from '@/lib/utils/format';
import { highlightJson, formatHttpStatus, highlightHeaders } from '@/lib/utils/syntax';
import type { X402Response } from '@/lib/x402/client';
import type { PaymentRequired, PaymentRequirements } from '@x402/core/types';
import { ReviewForm } from '../ReviewForm/ReviewForm';
import styles from './ApiPlayground.module.css';

// Decode base64 payment-required header
function decodePaymentRequired(header: string): PaymentRequired | null {
  try {
    return JSON.parse(atob(header)) as PaymentRequired;
  } catch {
    return null;
  }
}

interface JsonSchemaProperty {
  type: string;
  description?: string;
  default?: unknown;
  enum?: string[];
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

interface ApiPlaygroundProps {
  ownerHandle: string;
  agentSlug: string;
  agentName: string;
  pricePerCall: number;
  inputSchema: JsonSchema | null;
  outputSchema: JsonSchema | null;
  agentChainId: number | null;
  tokenId: string | null; // On-chain ERC-8004 token ID
  ownerAddress?: string; // Agent owner's wallet address (receiver for sessions)
  onReviewSubmitted?: () => void; // Callback when review is successfully submitted
}

type PlaygroundState = 'idle' | 'probing' | 'selecting' | 'loading' | 'success' | 'error';
type PaymentScheme = 'exact' | 'escrow';
type PlaygroundTab = 'params' | 'headers' | 'request';
type ResponseTab = 'body' | 'headers';
type CompletionTab = 'response' | 'request-log' | 'review';

export function ApiPlayground({
  ownerHandle,
  agentSlug,
  agentName: _,
  pricePerCall,
  inputSchema,
  agentChainId,
  tokenId,
  ownerAddress,
  onReviewSubmitted,
}: ApiPlaygroundProps) {
  const { isConnected } = useAccount();
  const connectedChainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: networkConfig } = useNetworkConfig();
  const { data: allNetworks } = useAllNetworks();

  // Payment selection state
  const [paymentRequired, setPaymentRequired] = useState<PaymentRequired | null>(null);
  const [, setSelectedScheme] = useState<PaymentScheme | null>(null);
  const [selectedRequirements, setSelectedRequirements] = useState<PaymentRequirements | null>(
    null
  );

  // Deposit modal state for session creation
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState<string | undefined>(undefined);
  const [pendingExecution, setPendingExecution] = useState(false);

  // Pass ownerAddress and depositAmount so session info is available and amount is used
  const agentCall = useAgentCall({
    receiverAddress: ownerAddress,
    depositAmount,
  });

  const isWrongChain = isConnected && agentChainId && connectedChainId !== agentChainId;
  const getChainName = (chainId: number) => getNetworkName(allNetworks, chainId);

  // Playground state
  const [activeTab, setActiveTab] = useState<PlaygroundTab>('params');
  const [responseTab, setResponseTab] = useState<ResponseTab>('body');
  const [paramValues, setParamValues] = useState<
    Record<string, string | number | boolean | undefined>
  >({});
  const [customHeaders, setCustomHeaders] = useState<Array<{ key: string; value: string }>>([]);
  const [state, setState] = useState<PlaygroundState>('idle');
  const [response, setResponse] = useState<string>('');
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [responseSize, setResponseSize] = useState<string>('');
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [fullResult, setFullResult] = useState<X402Response | null>(null);

  // Completion panel state (tabs: response, request-log, review)
  const [completionTab, setCompletionTab] = useState<CompletionTab>('response');
  const [feedbackAuth, setFeedbackAuth] = useState<string | null>(null);
  const [feedbackExpiry, setFeedbackExpiry] = useState<string | null>(null);

  // Payment receipt state
  const [paymentTxHash, setPaymentTxHash] = useState<string | null>(null);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);

  // Ref for cleanup on unmount
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Custom header management
  const addCustomHeader = () => {
    setCustomHeaders((prev) => [...prev, { key: '', value: '' }]);
  };

  const removeCustomHeader = (index: number) => {
    setCustomHeaders((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCustomHeader = (index: number, field: 'key' | 'value', val: string) => {
    setCustomHeaders((prev) => prev.map((h, i) => (i === index ? { ...h, [field]: val } : h)));
  };

  // Full endpoint URL - uses handle/slug format
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agentokratia.com';
  const fullEndpoint = useMemo(
    () => `${baseUrl}/api/v1/call/${ownerHandle}/${agentSlug}`,
    [baseUrl, ownerHandle, agentSlug]
  );

  // Parse schema properties
  const schemaProperties = useMemo(() => {
    if (!inputSchema?.properties) return [];
    return Object.entries(inputSchema.properties).map(([name, prop]) => ({
      name,
      type: prop.type,
      description: prop.description || '',
      required: inputSchema.required?.includes(name) || false,
      default: prop.default,
      enum: prop.enum,
    }));
  }, [inputSchema]);

  // Initialize param values from schema
  // Only set defaults for required fields or fields with explicit defaults
  useEffect(() => {
    const initial: Record<string, string | number | boolean | undefined> = {};
    schemaProperties.forEach((prop) => {
      if (prop.default !== undefined) {
        initial[prop.name] = prop.default as string | number | boolean;
      } else if (prop.required) {
        // Only initialize required fields without defaults
        if (prop.type === 'string') {
          initial[prop.name] = prop.enum ? prop.enum[0] : ''; // Auto-select first enum for required
        } else if (prop.type === 'number' || prop.type === 'integer') {
          initial[prop.name] = undefined; // Leave empty, user must fill
        } else if (prop.type === 'boolean') {
          initial[prop.name] = false;
        }
      }
      // Optional fields without defaults: leave undefined (won't appear in request)
    });
    setParamValues(initial);
  }, [schemaProperties]);

  // Build request JSON - only include fields with actual values
  const requestJson = useMemo(() => {
    const body: Record<string, unknown> = {};
    Object.entries(paramValues).forEach(([key, value]) => {
      // Include if value is set and not empty string
      // Include 0 and false as valid values, exclude undefined and empty string
      if (value !== undefined && value !== '') {
        body[key] = value;
      }
    });
    return JSON.stringify(body, null, 2);
  }, [paramValues]);

  // Execute the API request
  const executeRequest = useCallback(
    async (options?: CallOptions) => {
      // Reset state
      setResponse('');
      setResponseHeaders({});
      setResponseTime(null);
      setHttpStatus(null);
      setFullResult(null);
      setCompletionTab('response');
      setFeedbackAuth(null);
      setFeedbackExpiry(null);
      setPaymentTxHash(null);
      setPaidAmount(null);
      setState('loading');

      try {
        const startTime = Date.now();

        const body: Record<string, unknown> = {};
        Object.entries(paramValues).forEach(([key, value]) => {
          if (value !== undefined && value !== '') {
            body[key] = value;
          }
        });

        const result = await agentCall.call(ownerHandle, agentSlug, body, options);

        if (!mountedRef.current) return;

        const elapsed = Date.now() - startTime;
        setResponseTime(elapsed);
        setFullResult(result);
        setHttpStatus(result.httpStatus || (result.success ? 200 : 400));

        // Capture payment info for receipt
        if (result.paymentResponse?.transaction) {
          setPaymentTxHash(result.paymentResponse.transaction);
        }
        setPaidAmount(pricePerCall);

        if (result.success) {
          const responseStr = JSON.stringify(result.data, null, 2);
          setResponse(responseStr);
          setResponseSize(`${(new Blob([responseStr]).size / 1024).toFixed(1)} KB`);
          setState('success');

          // Store feedback auth for review form
          if (result.feedbackAuth && result.feedbackExpiry && tokenId) {
            const expirySeconds = parseInt(result.feedbackExpiry, 10);
            const expiryTimeMs = expirySeconds * 1000;
            const now = Date.now();
            if (!isNaN(expirySeconds) && expiryTimeMs > now) {
              setFeedbackAuth(result.feedbackAuth);
              setFeedbackExpiry(result.feedbackExpiry);
            }
          }
        } else {
          const errorResponse = {
            error: result.error,
            ...(result.errorReason && { reason: result.errorReason }),
            ...(result.errorDetails && { details: result.errorDetails }),
          };
          setResponse(JSON.stringify(errorResponse, null, 2));
          setState('error');
        }

        // Set response headers
        setResponseHeaders({
          'content-type': 'application/json',
          'x-request-id': result.requestId || 'unknown',
          ...(result.paymentResponse?.transaction && {
            'x-payment-tx': result.paymentResponse.transaction,
          }),
        });
      } catch (err) {
        if (!mountedRef.current) return;

        const error = err instanceof Error ? err : new Error('Unknown error');
        const message = error.message;

        console.error('[ApiPlayground] Request failed:', {
          error: error.message,
          ownerHandle,
          agentSlug,
          timestamp: new Date().toISOString(),
        });

        // User rejected wallet action = show cancelled message briefly
        if (
          message.includes('rejected') ||
          message.includes('User rejected') ||
          message.includes('denied')
        ) {
          setResponse(JSON.stringify({ message: 'Payment cancelled' }, null, 2));
          setHttpStatus(null);
          setState('error');
          // Auto-dismiss after 2 seconds
          setTimeout(() => {
            if (mountedRef.current) {
              setResponse('');
              setState('idle');
            }
          }, 2000);
          return;
        }

        const errorPayload = {
          error: message,
          code: error.name !== 'Error' ? error.name : undefined,
          timestamp: new Date().toISOString(),
        };
        setResponse(JSON.stringify(errorPayload, null, 2));
        setState('error');
      }
    },
    [paramValues, ownerHandle, agentSlug, agentCall, pricePerCall, tokenId]
  );

  // Probe endpoint to get payment options
  const probeEndpoint = useCallback(async () => {
    setState('probing');
    setPaymentRequired(null);
    setSelectedScheme(null);
    setSelectedRequirements(null);

    try {
      const body: Record<string, unknown> = {};
      Object.entries(paramValues).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          body[key] = value;
        }
      });

      const response = await fetch(fullEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.status !== 402) {
        throw new Error(`Expected 402, got ${response.status}`);
      }

      const paymentRequiredHeader = response.headers.get('payment-required');
      if (!paymentRequiredHeader) {
        throw new Error('Missing payment-required header');
      }

      const paymentReq = decodePaymentRequired(paymentRequiredHeader);
      if (!paymentReq?.accepts?.length) {
        throw new Error('Invalid payment-required response');
      }

      setPaymentRequired(paymentReq);

      // Always show selection UI as confirmation step
      setState('selecting');
    } catch (error) {
      console.error('[ApiPlayground] Probe failed:', error);
      setState('error');
      setResponse(
        JSON.stringify(
          { error: error instanceof Error ? error.message : 'Failed to get payment options' },
          null,
          2
        )
      );
    }
  }, [paramValues, fullEndpoint, executeRequest]);

  // Handle scheme selection
  const handleSchemeSelect = useCallback(
    (scheme: PaymentScheme) => {
      if (!paymentRequired) return;
      const req = paymentRequired.accepts.find((a) => a.scheme === scheme);
      if (!req) return;

      setSelectedScheme(scheme);
      setSelectedRequirements(req);

      if (scheme === 'escrow') {
        // Open deposit modal for new pre-paid session
        setShowDepositModal(true);
      } else {
        // Pay per call (exact scheme)
        setState('idle');
        executeRequest({ scheme: 'exact' });
      }
    },
    [paymentRequired, executeRequest]
  );

  // Handle using existing session (no deposit needed)
  const handleUseExistingSession = useCallback(
    (sessionId?: string) => {
      setSelectedScheme('escrow');
      setState('idle');
      // Use specific session if provided, otherwise auto-select best
      executeRequest({ scheme: 'escrow', session: sessionId || 'auto' });
    },
    [executeRequest]
  );

  // Handle send request - always probe for payment options (user chooses)
  const handleSendRequest = useCallback(() => {
    probeEndpoint();
  }, [probeEndpoint]);

  // Handle deposit confirmation - set amount and trigger execution after state updates
  const handleDepositConfirm = useCallback((amount: string) => {
    setDepositAmount(amount);
    setShowDepositModal(false);
    setPendingExecution(true); // Will trigger execution via useEffect
  }, []);

  // Execute request after deposit amount is set (avoids race condition)
  useEffect(() => {
    if (pendingExecution && depositAmount) {
      setPendingExecution(false);
      // Force new session creation with the deposit amount
      executeRequest({ scheme: 'escrow', session: 'new' });
    }
  }, [pendingExecution, depositAmount, executeRequest]);

  const copyRequest = () => {
    navigator.clipboard.writeText(requestJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Format price from cents - use centralized util
  const formatPrice = (priceCents: number) => formatUsdc(priceCents);

  // Not connected state
  if (!isConnected) {
    return (
      <div className={styles.playground}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>
            <Zap size={16} />
            API Playground
          </span>
          <span className={styles.walletBadge}>
            <span className={styles.walletDot} />
            Not connected
          </span>
        </div>

        <div className={styles.connectOverlay}>
          <div className={styles.connectContent}>
            <div className={styles.connectIcon}>
              <Wallet size={32} />
            </div>
            <h3 className={styles.connectTitle}>Connect Your Wallet</h3>
            <p className={styles.connectDesc}>
              Connect your wallet to test this API and pay with USDC. Each call costs{' '}
              <strong>{formatPrice(pricePerCall)}</strong>.
            </p>
            <div className={styles.connectFeatures}>
              <div className={styles.connectFeature}>
                <Shield size={14} />
                <span>Secure x402 payments</span>
              </div>
              <div className={styles.connectFeature}>
                <Play size={14} />
                <span>Test APIs instantly</span>
              </div>
            </div>
            <div className={styles.connectButtonWrapper}>
              <ConnectButton />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Wrong chain state
  if (isWrongChain && agentChainId) {
    return (
      <div className={styles.playground}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>
            <Zap size={16} />
            API Playground
          </span>
          <div className={styles.headerWallet}>
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
          </div>
        </div>

        <div className={styles.wrongChainOverlay}>
          <div className={styles.connectContent}>
            <div className={styles.wrongChainIcon}>
              <AlertTriangle size={32} />
            </div>
            <h3 className={styles.connectTitle}>Wrong Network</h3>
            <p className={styles.connectDesc}>
              This agent requires <strong>{getChainName(agentChainId)}</strong>.
            </p>
            <Button
              onClick={() => switchChain({ chainId: agentChainId })}
              disabled={isSwitching}
              size="lg"
            >
              {isSwitching ? (
                <>
                  <Loader2 size={16} className={styles.spinner} />
                  Switching...
                </>
              ) : (
                `Switch to ${getChainName(agentChainId)}`
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.playground}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.headerTitle}>
          <Zap size={16} />
          API Playground
        </span>
        <div className={styles.headerWallet}>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
        </div>
      </div>

      {/* Endpoint bar */}
      <div className={styles.endpoint}>
        <span className={styles.method}>POST</span>
        <span className={styles.url}>{fullEndpoint}</span>
        <button
          className={styles.endpointCopyBtn}
          onClick={() => {
            navigator.clipboard.writeText(fullEndpoint);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          title="Copy endpoint URL"
          aria-label="Copy endpoint URL"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>

      {/* Playground tabs */}
      <div className={styles.playgroundTabs}>
        <button
          className={`${styles.playgroundTab} ${activeTab === 'params' ? styles.active : ''}`}
          onClick={() => setActiveTab('params')}
        >
          Parameters <span className={styles.count}>{schemaProperties.length}</span>
        </button>
        <button
          className={`${styles.playgroundTab} ${activeTab === 'headers' ? styles.active : ''}`}
          onClick={() => setActiveTab('headers')}
        >
          Headers <span className={styles.count}>{1 + customHeaders.length}</span>
        </button>
        <button
          className={`${styles.playgroundTab} ${activeTab === 'request' ? styles.active : ''}`}
          onClick={() => setActiveTab('request')}
        >
          Request
        </button>
      </div>

      {/* Parameters section */}
      {activeTab === 'params' && (
        <div className={styles.paramsSection}>
          <div className={styles.paramGroup}>
            <div className={styles.paramGroupTitle}>Body Parameters</div>
            {schemaProperties.length === 0 ? (
              <div className={styles.paramEmpty}>No parameters defined for this agent.</div>
            ) : (
              schemaProperties.map((prop) => (
                <div key={prop.name} className={styles.paramRow}>
                  <div className={styles.paramInfo}>
                    <div className={styles.paramName}>
                      {prop.name}
                      {prop.required && <span className={styles.required}>required</span>}
                    </div>
                    <div className={styles.paramType}>{prop.type}</div>
                  </div>
                  <div className={styles.paramInputWrap}>
                    {prop.enum ? (
                      <select
                        className={styles.paramSelect}
                        value={String(paramValues[prop.name] ?? '')}
                        onChange={(e) =>
                          setParamValues((prev) => ({
                            ...prev,
                            [prop.name]: e.target.value || undefined,
                          }))
                        }
                      >
                        {!prop.required && <option value="">Select {prop.name}...</option>}
                        {prop.enum.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : prop.type === 'boolean' ? (
                      <select
                        className={styles.paramSelect}
                        value={
                          paramValues[prop.name] === undefined ? '' : String(paramValues[prop.name])
                        }
                        onChange={(e) =>
                          setParamValues((prev) => ({
                            ...prev,
                            [prop.name]:
                              e.target.value === '' ? undefined : e.target.value === 'true',
                          }))
                        }
                      >
                        {!prop.required && <option value="">Select...</option>}
                        <option value="false">false</option>
                        <option value="true">true</option>
                      </select>
                    ) : prop.type === 'number' || prop.type === 'integer' ? (
                      <input
                        type="number"
                        className={styles.paramInput}
                        placeholder={prop.required ? `Enter ${prop.name}` : 'Optional'}
                        value={
                          typeof paramValues[prop.name] === 'number'
                            ? (paramValues[prop.name] as number)
                            : ''
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          const parsed = val === '' ? undefined : parseInt(val, 10);
                          setParamValues((prev) => ({
                            ...prev,
                            [prop.name]: Number.isNaN(parsed) ? undefined : parsed,
                          }));
                        }}
                      />
                    ) : (
                      <input
                        type="text"
                        className={styles.paramInput}
                        placeholder={`Enter ${prop.name}...`}
                        value={
                          typeof paramValues[prop.name] === 'string'
                            ? (paramValues[prop.name] as string)
                            : ''
                        }
                        onChange={(e) =>
                          setParamValues((prev) => ({ ...prev, [prop.name]: e.target.value }))
                        }
                      />
                    )}
                    {prop.description && <div className={styles.paramDesc}>{prop.description}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Headers section */}
      {activeTab === 'headers' && (
        <div className={styles.paramsSection}>
          <div className={styles.paramGroup}>
            <div className={styles.paramGroupTitle}>Request Headers</div>
            <div className={styles.paramRow}>
              <div className={styles.paramInfo}>
                <div className={styles.paramName}>Content-Type</div>
                <div className={styles.paramType}>string</div>
              </div>
              <div className={styles.paramInputWrap}>
                <input
                  type="text"
                  className={`${styles.paramInput} ${styles.readonly}`}
                  value="application/json"
                  readOnly
                />
              </div>
            </div>

            {/* Custom headers */}
            {customHeaders.map((header, index) => (
              <div key={index} className={styles.customHeaderRow}>
                <input
                  type="text"
                  className={styles.headerKeyInput}
                  placeholder="Header name"
                  value={header.key}
                  onChange={(e) => updateCustomHeader(index, 'key', e.target.value)}
                />
                <input
                  type="text"
                  className={styles.headerValueInput}
                  placeholder="Value"
                  value={header.value}
                  onChange={(e) => updateCustomHeader(index, 'value', e.target.value)}
                />
                <button
                  className={styles.removeHeaderBtn}
                  onClick={() => removeCustomHeader(index)}
                  title="Remove header"
                  aria-label="Remove header"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            <button className={styles.addHeaderBtn} onClick={addCustomHeader}>
              <Plus size={14} />
              Add Header
            </button>
          </div>
        </div>
      )}

      {/* Request preview section */}
      {activeTab === 'request' && (
        <div className={styles.requestPreview}>
          <div className={styles.previewHeader}>
            <span className={styles.previewTitle}>Request Body</span>
            <button className={styles.copyBtn} onClick={copyRequest}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre
            className={styles.previewCode}
            dangerouslySetInnerHTML={{ __html: highlightJson(requestJson) }}
          />
        </div>
      )}

      {/* Action bar */}
      <div className={styles.tryAction}>
        <Button
          onClick={handleSendRequest}
          disabled={state === 'loading' || state === 'probing'}
          size="lg"
          className={styles.btnSend}
        >
          {state === 'loading' || state === 'probing' ? (
            <>
              <Loader2 size={16} className={styles.spinner} />
              {state === 'probing' ? 'Loading...' : 'Processing...'}
            </>
          ) : state === 'selecting' ? (
            <>
              <Shield size={16} />
              Select Payment
            </>
          ) : (
            <>
              <Play size={16} />
              {state === 'success' ? 'Run Again' : 'Send Request'}
            </>
          )}
        </Button>
        <div className={styles.costBadge}>{formatPrice(pricePerCall)}</div>
      </div>

      {/* Probing overlay */}
      {state === 'probing' && (
        <div className={styles.progressOverlay}>
          <div className={styles.progressContent}>
            <Loader2 size={24} className={styles.spinner} />
            <p className={styles.progressHint}>Checking available payment methods...</p>
          </div>
        </div>
      )}

      {/* Payment scheme selection */}
      {state === 'selecting' && paymentRequired && (
        <div className={styles.selectionPanel}>
          <div className={styles.selectionHeader}>
            <Shield size={18} />
            <span>Choose Payment Method</span>
          </div>
          <div className={styles.selectionOptions}>
            {/* Show all existing sessions with balances */}
            {agentCall.allSessions.map((session, index) => {
              const balanceUsdc = Number(session.balance) / 1_000_000;
              const estimatedCalls = Math.floor(Number(session.balance) / (pricePerCall * 10000));
              const isFirst = index === 0;
              return (
                <button
                  key={session.sessionId}
                  className={`${styles.selectionOption} ${isFirst ? styles.recommended : ''}`}
                  onClick={() => handleUseExistingSession(session.sessionId)}
                >
                  <div className={styles.optionIcon}>
                    <CheckCircle2 size={20} />
                  </div>
                  <div className={styles.optionInfo}>
                    <span className={styles.optionTitle}>
                      Use Session {agentCall.allSessions.length > 1 ? `#${index + 1}` : ''}
                      {isFirst && <span className={styles.recommendedBadge}>Recommended</span>}
                    </span>
                    <span className={styles.optionDesc}>
                      ${balanceUsdc.toFixed(2)} remaining · ~{estimatedCalls} calls · No signature
                    </span>
                  </div>
                  <ChevronRight size={16} className={styles.optionArrow} />
                </button>
              );
            })}

            {/* Pay Per Call (exact scheme) */}
            {paymentRequired.accepts.some((a) => a.scheme === 'exact') && (
              <button
                className={styles.selectionOption}
                onClick={() => handleSchemeSelect('exact')}
              >
                <div className={styles.optionIcon}>
                  <Zap size={20} />
                </div>
                <div className={styles.optionInfo}>
                  <span className={styles.optionTitle}>Pay Per Call</span>
                  <span className={styles.optionDesc}>
                    Sign each call · {formatPrice(pricePerCall)}
                  </span>
                </div>
                <ChevronRight size={16} className={styles.optionArrow} />
              </button>
            )}

            {/* New Pre-paid Session (escrow scheme) */}
            {paymentRequired.accepts.some((a) => a.scheme === 'escrow') && (
              <button
                className={styles.selectionOption}
                onClick={() => handleSchemeSelect('escrow')}
              >
                <div className={styles.optionIcon}>
                  <Wallet size={20} />
                </div>
                <div className={styles.optionInfo}>
                  <span className={styles.optionTitle}>New Pre-paid Session</span>
                  <span className={styles.optionDesc}>
                    Deposit once, make multiple calls faster
                  </span>
                </div>
                <ChevronRight size={16} className={styles.optionArrow} />
              </button>
            )}
          </div>
          <button
            className={styles.selectionCancel}
            onClick={() => {
              setState('idle');
              setPaymentRequired(null);
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Loading overlay during call */}
      {state === 'loading' && (
        <div className={styles.progressOverlay}>
          <div className={styles.progressContent}>
            <Loader2 size={32} className={styles.spinner} />
            <p className={styles.progressHint}>Processing request...</p>
          </div>
        </div>
      )}

      {/* Unified Completion Panel with Tabs */}
      {state === 'success' && (
        <div className={styles.completionPanel}>
          {/* Success Banner with Receipt Info */}
          <div className={styles.successBanner}>
            <div className={styles.successBannerLeft}>
              <CheckCircle2 size={20} className={styles.successIcon} />
              <div className={styles.successInfo}>
                <span className={styles.successTitle}>Request Successful</span>
                <span className={styles.successMeta}>
                  {responseTime && `${(responseTime / 1000).toFixed(2)}s`}
                  {paidAmount && ` · ${formatPrice(paidAmount)} paid`}
                  {responseSize && ` · ${responseSize}`}
                </span>
              </div>
            </div>
            {paymentTxHash && networkConfig && (
              <a
                href={getExplorerTxUrl(networkConfig.blockExplorerUrl, paymentTxHash)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.viewTxLink}
              >
                View transaction
                <ExternalLink size={14} />
              </a>
            )}
          </div>

          {/* Completion Tabs - Response | Request Log | Review */}
          <div className={styles.completionTabs}>
            <button
              className={`${styles.completionTab} ${completionTab === 'response' ? styles.active : ''}`}
              onClick={() => setCompletionTab('response')}
            >
              <FileText size={14} />
              Response
            </button>
            <button
              className={`${styles.completionTab} ${completionTab === 'request-log' ? styles.active : ''}`}
              onClick={() => setCompletionTab('request-log')}
            >
              <ChevronRight size={14} />
              Request Log
            </button>
            {feedbackAuth && tokenId && (
              <button
                className={`${styles.completionTab} ${styles.reviewTab} ${completionTab === 'review' ? styles.active : ''}`}
                onClick={() => setCompletionTab('review')}
              >
                <Star size={14} />
                Leave Review
                <span className={styles.reviewBadge}>1</span>
              </button>
            )}
          </div>

          {/* Tab Content: Response */}
          {completionTab === 'response' && response && (
            <div className={styles.responseContent}>
              <div className={styles.responseHeader}>
                <span className={`${styles.statusBadge} ${styles.success}`}>
                  {httpStatus ? formatHttpStatus(httpStatus) : '200 OK'}
                </span>
                <div className={styles.responseTabs}>
                  <button
                    className={`${styles.responseTab} ${responseTab === 'body' ? styles.active : ''}`}
                    onClick={() => setResponseTab('body')}
                  >
                    Body
                  </button>
                  <button
                    className={`${styles.responseTab} ${responseTab === 'headers' ? styles.active : ''}`}
                    onClick={() => setResponseTab('headers')}
                  >
                    Headers
                  </button>
                </div>
              </div>
              <pre
                className={styles.responseBody}
                dangerouslySetInnerHTML={{
                  __html:
                    responseTab === 'body'
                      ? highlightJson(response)
                      : highlightHeaders(responseHeaders),
                }}
              />
            </div>
          )}

          {/* Tab Content: Request Log (Stripe-inspired inspectability) */}
          {completionTab === 'request-log' && (
            <div className={styles.requestLogContent}>
              <div className={styles.requestLogSection}>
                <div className={styles.requestLogHeader}>
                  <span className={styles.requestLogLabel}>Request</span>
                  <span className={styles.requestLogMethod}>POST {fullEndpoint}</span>
                </div>
                <pre
                  className={styles.requestLogBody}
                  dangerouslySetInnerHTML={{ __html: highlightJson(requestJson) }}
                />
              </div>
              <div className={styles.requestLogSection}>
                <div className={styles.requestLogHeader}>
                  <span className={styles.requestLogLabel}>Response</span>
                  <span className={`${styles.statusBadge} ${styles.success} ${styles.small}`}>
                    {httpStatus || 200}
                  </span>
                </div>
                <pre className={styles.requestLogBody}>
                  {response.length > 300 ? response.slice(0, 300) + '\n...' : response}
                </pre>
              </div>
              {fullResult?.paymentResponse && (
                <div className={styles.requestLogSection}>
                  <div className={styles.requestLogHeader}>
                    <span className={styles.requestLogLabel}>Payment</span>
                    <span className={styles.paymentSuccess}>Confirmed</span>
                  </div>
                  <div className={styles.paymentDetails}>
                    <div className={styles.paymentRow}>
                      <span>Amount</span>
                      <span>{formatPrice(paidAmount || 0)} USDC</span>
                    </div>
                    {paymentTxHash && (
                      <div className={styles.paymentRow}>
                        <span>Transaction</span>
                        <code>
                          {paymentTxHash.slice(0, 10)}...{paymentTxHash.slice(-8)}
                        </code>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab Content: Review */}
          {completionTab === 'review' && feedbackAuth && tokenId && (
            <div className={styles.reviewContent}>
              <ReviewForm
                ownerHandle={ownerHandle}
                agentSlug={agentSlug}
                tokenId={tokenId}
                feedbackAuth={feedbackAuth}
                feedbackExpiry={feedbackExpiry!}
                onClose={() => setCompletionTab('response')}
                onSuccess={() => {
                  setFeedbackAuth(null);
                  setFeedbackExpiry(null);
                  setCompletionTab('response');
                  onReviewSubmitted?.();
                }}
              />
            </div>
          )}

          {/* Review Nudge - show at bottom when not on review tab */}
          {feedbackAuth && tokenId && completionTab !== 'review' && (
            <div className={styles.reviewNudge}>
              <div className={styles.reviewNudgeContent}>
                <div className={styles.reviewStars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} size={16} className={styles.reviewStarIcon} />
                  ))}
                </div>
                <span>Rate this agent</span>
              </div>
              <button className={styles.reviewNudgeBtn} onClick={() => setCompletionTab('review')}>
                Write Review
                <MessageSquare size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error Response Panel */}
      {state === 'error' && response && (
        <div className={styles.responsePanel}>
          <div className={styles.responseStatusBar}>
            <span className={`${styles.statusCode} ${styles.error}`}>
              {httpStatus ? formatHttpStatus(httpStatus) : 'Error'}
            </span>
          </div>
          <pre
            className={styles.responseBody}
            dangerouslySetInnerHTML={{ __html: highlightJson(response) }}
          />
        </div>
      )}

      {/* Deposit Modal for session creation */}
      <DepositModal
        open={showDepositModal}
        onOpenChange={(open) => {
          setShowDepositModal(open);
          if (!open && state === 'probing') {
            setState('idle');
          }
        }}
        onConfirm={handleDepositConfirm}
        agentName={`@${ownerHandle}/${agentSlug}`}
        pricePerCall={pricePerCall}
        minDeposit={(selectedRequirements?.extra as Record<string, string> | undefined)?.minDeposit}
        maxDeposit={(selectedRequirements?.extra as Record<string, string> | undefined)?.maxDeposit}
        isLoading={state === 'loading'}
      />
    </div>
  );
}
