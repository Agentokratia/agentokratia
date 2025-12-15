'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Play, Copy, Check, Loader2, Wallet, Shield, AlertTriangle, Zap, Plus, Trash2, Star, CheckCircle2, ExternalLink, FileText, MessageSquare, ChevronRight } from 'lucide-react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Button } from '@/components/ui';
import { useAgentCall } from '@/lib/x402/useAgentCall';
import { useAllNetworks, useNetworkConfig, getExplorerTxUrl, getNetworkName } from '@/lib/network/client';
import { formatUsdc } from '@/lib/utils/format';
import type { X402Response } from '@/lib/x402/client';
import { ReviewForm } from '../ReviewForm/ReviewForm';
import styles from './ApiPlayground.module.css';

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
  agentId: string;
  agentName: string;
  pricePerCall: number;
  inputSchema: JsonSchema | null;
  outputSchema: JsonSchema | null;
  agentChainId: number | null;
  tokenId: string | null; // On-chain ERC-8004 token ID
  onReviewSubmitted?: () => void; // Callback when review is successfully submitted
}

type PlaygroundState = 'idle' | 'signing' | 'paying' | 'executing' | 'success' | 'error';
type PlaygroundTab = 'params' | 'headers' | 'request';
type ResponseTab = 'body' | 'headers';
type CompletionTab = 'response' | 'request-log' | 'review';

// Progress steps for the call journey
const PROGRESS_STEPS = [
  { id: 'sign', label: 'Approve Payment', description: 'Sign with your wallet' },
  { id: 'pay', label: 'Processing', description: 'Sending payment' },
  { id: 'execute', label: 'Executing', description: 'Running agent' },
] as const;

export function ApiPlayground({
  agentId,
  agentName,
  pricePerCall,
  inputSchema,
  agentChainId,
  tokenId,
  onReviewSubmitted,
}: ApiPlaygroundProps) {
  const { isConnected } = useAccount();
  const connectedChainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const agentCall = useAgentCall();
  const { data: networkConfig } = useNetworkConfig();
  const { data: allNetworks } = useAllNetworks();

  const isWrongChain = isConnected && agentChainId && connectedChainId !== agentChainId;
  const getChainName = (chainId: number) => getNetworkName(allNetworks, chainId);

  // Playground state
  const [activeTab, setActiveTab] = useState<PlaygroundTab>('params');
  const [responseTab, setResponseTab] = useState<ResponseTab>('body');
  const [paramValues, setParamValues] = useState<Record<string, string | number | boolean>>({});
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

  // Custom header management
  const addCustomHeader = () => {
    setCustomHeaders((prev) => [...prev, { key: '', value: '' }]);
  };

  const removeCustomHeader = (index: number) => {
    setCustomHeaders((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCustomHeader = (index: number, field: 'key' | 'value', val: string) => {
    setCustomHeaders((prev) =>
      prev.map((h, i) => (i === index ? { ...h, [field]: val } : h))
    );
  };

  // Full endpoint URL
  const fullEndpoint = useMemo(() => `https://api.agentokratia.com/call/${agentId}`, [agentId]);

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
  useEffect(() => {
    const initial: Record<string, string | number | boolean> = {};
    schemaProperties.forEach((prop) => {
      if (prop.default !== undefined) {
        initial[prop.name] = prop.default as string | number | boolean;
      } else if (prop.type === 'string') {
        initial[prop.name] = '';
      } else if (prop.type === 'number' || prop.type === 'integer') {
        initial[prop.name] = 0;
      } else if (prop.type === 'boolean') {
        initial[prop.name] = false;
      }
    });
    setParamValues(initial);
  }, [schemaProperties]);

  // Build request JSON
  const requestJson = useMemo(() => {
    const body: Record<string, unknown> = {};
    Object.entries(paramValues).forEach(([key, value]) => {
      if (value !== '' && value !== 0) {
        body[key] = value;
      }
    });
    return JSON.stringify(body, null, 2);
  }, [paramValues]);

  // Make API call with progress tracking
  const handleSendRequest = useCallback(async () => {
    // Reset all state
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

    // Step 1: Signing
    setState('signing');

    try {
      const startTime = Date.now();

      const body: Record<string, unknown> = {};
      Object.entries(paramValues).forEach(([key, value]) => {
        if (value !== '' && value !== 0) {
          body[key] = value;
        }
      });

      // Step 2: After signing, show paying state
      // Note: The actual state transitions happen inside agentCall.call
      // We simulate the progression here for better UX
      const payingTimeout = setTimeout(() => setState('paying'), 500);
      const executingTimeout = setTimeout(() => setState('executing'), 2000);

      const result = await agentCall.call(agentId, body);

      // Clear timeouts if call completes faster
      clearTimeout(payingTimeout);
      clearTimeout(executingTimeout);

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

        // Store feedback auth for review form (only if agent has tokenId)
        if (result.feedbackAuth && result.feedbackExpiry && tokenId) {
          setFeedbackAuth(result.feedbackAuth);
          setFeedbackExpiry(result.feedbackExpiry);
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
      const message = err instanceof Error ? err.message : 'Request failed';
      // User rejected = go back to idle, not error
      if (message.includes('rejected') || message.includes('User rejected') || message.includes('denied')) {
        setState('idle');
        return;
      }
      setResponse(JSON.stringify({ error: message }, null, 2));
      setState('error');
    }
  }, [paramValues, agentId, agentCall, pricePerCall, tokenId]);

  // Get current step index for progress indicator
  const getCurrentStep = () => {
    switch (state) {
      case 'signing': return 0;
      case 'paying': return 1;
      case 'executing': return 2;
      default: return -1;
    }
  };

  const copyRequest = () => {
    navigator.clipboard.writeText(requestJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Format price from cents - use centralized util
  const formatPrice = (priceCents: number) => formatUsdc(priceCents);

  const getStatusText = (status: number) => {
    const statusMap: Record<number, string> = {
      200: '200 OK',
      201: '201 Created',
      400: '400 Bad Request',
      401: '401 Unauthorized',
      402: '402 Payment Required',
      500: '500 Server Error',
    };
    return statusMap[status] || `${status}`;
  };

  // Syntax highlight JSON
  const highlightJson = (json: string) => {
    return json
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"([^"]+)":/g, '<span class="key">"$1"</span>:')
      .replace(/: "([^"]*)"/g, ': <span class="string">"$1"</span>')
      .replace(/: (\d+\.?\d*)/g, ': <span class="number">$1</span>')
      .replace(/: (true|false)/g, ': <span class="bool">$1</span>');
  };

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
              Connect your wallet to test this API and pay with USDC.
              Each call costs <strong>{formatPrice(pricePerCall)}</strong>.
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
                      {prop.required && <span className={styles.required}>*</span>}
                    </div>
                    <div className={styles.paramType}>{prop.type}</div>
                  </div>
                  <div className={styles.paramInputWrap}>
                    {prop.enum ? (
                      <select
                        className={styles.paramSelect}
                        value={String(paramValues[prop.name] || '')}
                        onChange={(e) => setParamValues((prev) => ({ ...prev, [prop.name]: e.target.value }))}
                      >
                        {prop.enum.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : prop.type === 'boolean' ? (
                      <select
                        className={styles.paramSelect}
                        value={String(paramValues[prop.name] || 'false')}
                        onChange={(e) => setParamValues((prev) => ({ ...prev, [prop.name]: e.target.value === 'true' }))}
                      >
                        <option value="false">false</option>
                        <option value="true">true</option>
                      </select>
                    ) : prop.type === 'number' || prop.type === 'integer' ? (
                      <input
                        type="number"
                        className={styles.paramInput}
                        value={paramValues[prop.name] as number || 0}
                        onChange={(e) => setParamValues((prev) => ({ ...prev, [prop.name]: parseInt(e.target.value) || 0 }))}
                      />
                    ) : (
                      <input
                        type="text"
                        className={styles.paramInput}
                        placeholder={`Enter ${prop.name}...`}
                        value={paramValues[prop.name] as string || ''}
                        onChange={(e) => setParamValues((prev) => ({ ...prev, [prop.name]: e.target.value }))}
                      />
                    )}
                    {prop.description && (
                      <div className={styles.paramDesc}>{prop.description}</div>
                    )}
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
          disabled={state !== 'idle' && state !== 'success' && state !== 'error'}
          size="lg"
          className={styles.btnSend}
        >
          {state === 'idle' || state === 'success' || state === 'error' ? (
            <>
              <Play size={16} />
              {state === 'success' ? 'Run Again' : 'Send Request'}
            </>
          ) : (
            <>
              <Loader2 size={16} className={styles.spinner} />
              Processing...
            </>
          )}
        </Button>
        <div className={styles.costBadge}>{formatPrice(pricePerCall)}</div>
      </div>

      {/* Progress overlay during call */}
      {(state === 'signing' || state === 'paying' || state === 'executing') && (
        <div className={styles.progressOverlay}>
          <div className={styles.progressContent}>
            <div className={styles.progressSteps}>
              {PROGRESS_STEPS.map((step, index) => {
                const currentStep = getCurrentStep();
                const isComplete = index < currentStep;
                const isActive = index === currentStep;
                return (
                  <div
                    key={step.id}
                    className={`${styles.progressStep} ${isComplete ? styles.complete : ''} ${isActive ? styles.active : ''}`}
                  >
                    <div className={styles.stepIndicator}>
                      {isComplete ? (
                        <Check size={14} />
                      ) : isActive ? (
                        <Loader2 size={14} className={styles.spinner} />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                    <div className={styles.stepInfo}>
                      <span className={styles.stepLabel}>{step.label}</span>
                      <span className={styles.stepDesc}>{step.description}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className={styles.progressHint}>
              {state === 'signing' && 'Please confirm the transaction in your wallet'}
              {state === 'paying' && 'Transaction is being processed...'}
              {state === 'executing' && 'Agent is processing your request...'}
            </p>
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
                  {httpStatus ? getStatusText(httpStatus) : '200 OK'}
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
              <pre className={styles.responseBody} dangerouslySetInnerHTML={{
                __html: responseTab === 'body'
                  ? highlightJson(response)
                  : Object.entries(responseHeaders).map(([k, v]) => `<span class="key">${k}</span>: ${v}`).join('\n')
              }} />
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
                <pre className={styles.requestLogBody} dangerouslySetInnerHTML={{ __html: highlightJson(requestJson) }} />
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
                        <code>{paymentTxHash.slice(0, 10)}...{paymentTxHash.slice(-8)}</code>
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
                agentId={agentId}
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
              <button
                className={styles.reviewNudgeBtn}
                onClick={() => setCompletionTab('review')}
              >
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
              {httpStatus ? getStatusText(httpStatus) : 'Error'}
            </span>
          </div>
          <pre className={styles.responseBody} dangerouslySetInnerHTML={{ __html: highlightJson(response) }} />
        </div>
      )}
    </div>
  );
}
