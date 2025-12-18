'use client';

import { useState, useCallback, useEffect, useMemo, useRef, memo } from 'react';
import { Play, Copy, Check, Loader2, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/lib/store/authStore';
import { highlightJson, formatHttpStatus, highlightHeaders } from '@/lib/utils/syntax';
import styles from './TestPlayground.module.css';

// Helper to check if a header is a secret header
const isSecretHeader = (key: string): boolean => {
  const secretHeaders = ['x-agentokratia-secret', 'authorization', 'api-key', 'x-api-key'];
  return secretHeaders.includes(key.toLowerCase());
};

// Mask a secret value for display
const maskSecret = (value: string): string => {
  if (!value || value.length <= 8) return '••••••••';
  return value.slice(0, 4) + '••••••••' + value.slice(-4);
};

interface SchemaField {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'integer';
  description: string;
  required: boolean;
  enumValues?: string[];
}

interface TestPlaygroundProps {
  endpointUrl: string;
  inputFields: SchemaField[];
  secretKey?: string | null;
}

type PlaygroundTab = 'params' | 'headers' | 'request';
type ResponseTab = 'body' | 'headers';

export const TestPlayground = memo(function TestPlayground({
  endpointUrl,
  inputFields,
  secretKey,
}: TestPlaygroundProps) {
  const { token } = useAuthStore();

  // Playground state
  const [activeTab, setActiveTab] = useState<PlaygroundTab>('params');
  const [responseTab, setResponseTab] = useState<ResponseTab>('body');
  const [paramValues, setParamValues] = useState<
    Record<string, string | number | boolean | undefined>
  >({});
  const [customHeaders, setCustomHeaders] = useState<Array<{ key: string; value: string }>>([]);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<number>>(new Set());
  const [testing, setTesting] = useState(false);
  const [response, setResponse] = useState<string>('');
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [responseSize, setResponseSize] = useState<string>('');
  const [httpStatus, setHttpStatus] = useState<{
    code: number;
    text: string;
    success: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

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

  const toggleSecretVisibility = (index: number) => {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Parse fields with names only - use stable reference
  const validFields = useMemo(() => inputFields.filter((f) => f.name), [inputFields]);

  // Stable string representation for dependency tracking
  const fieldsKey = useMemo(
    () => validFields.map((f) => `${f.name}:${f.type}:${f.required}`).join('|'),
    [validFields]
  );

  // Track mounted state for async cleanup
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Initialize param values from fields
  useEffect(() => {
    const initial: Record<string, string | number | boolean | undefined> = {};
    validFields.forEach((field) => {
      if (field.required) {
        if (field.enumValues?.length) {
          initial[field.name] = field.enumValues[0];
        } else if (field.type === 'string') {
          initial[field.name] = '';
        } else if (field.type === 'boolean') {
          initial[field.name] = false;
        }
        // number/integer: leave undefined, user must fill
      }
    });
    setParamValues(initial);
  }, [fieldsKey]); // Use stable key instead of validFields reference

  // Clear test response when endpoint URL changes (stale response from old endpoint)
  useEffect(() => {
    setResponse('');
    setResponseHeaders({});
    setResponseTime(null);
    setResponseSize('');
    setHttpStatus(null);
  }, [endpointUrl]);

  // Pre-fill X-Agentokratia-Secret header when secretKey is available
  useEffect(() => {
    if (!secretKey) return;

    setCustomHeaders((prev) => {
      // Check if header already exists
      const existingIndex = prev.findIndex((h) => h.key === 'X-Agentokratia-Secret');
      if (existingIndex >= 0) {
        // Update existing header value
        return prev.map((h, i) => (i === existingIndex ? { ...h, value: secretKey } : h));
      }
      // Add new header
      return [{ key: 'X-Agentokratia-Secret', value: secretKey }, ...prev];
    });
  }, [secretKey]);

  // Build request JSON
  const requestJson = useMemo(() => {
    const body: Record<string, unknown> = {};
    Object.entries(paramValues).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        body[key] = value;
      }
    });
    return JSON.stringify(body, null, 2);
  }, [paramValues]);

  // Abort controller ref for cleanup
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Make test call
  const handleSendRequest = useCallback(async () => {
    if (!endpointUrl || !token || testing) return;

    // Validate URL format before making request
    try {
      const url = new URL(endpointUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        setHttpStatus({ code: 0, text: 'Invalid Protocol', success: false });
        setResponse(JSON.stringify({ error: 'URL must use HTTP or HTTPS protocol' }, null, 2));
        return;
      }
    } catch {
      setHttpStatus({ code: 0, text: 'Invalid URL', success: false });
      setResponse(JSON.stringify({ error: 'Please enter a valid URL' }, null, 2));
      return;
    }

    // Abort any previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setTesting(true);
    setResponse('');
    setResponseHeaders({});
    setResponseTime(null);
    setHttpStatus(null);

    const startTime = Date.now();

    // Build payload
    const payload: Record<string, unknown> = {};
    validFields.forEach((field) => {
      const value = paramValues[field.name];
      if (value === undefined || value === '') return;

      if (field.type === 'number' || field.type === 'integer') {
        payload[field.name] = Number(value);
      } else if (field.type === 'boolean') {
        payload[field.name] = value === true || value === 'true';
      } else if (field.type === 'array') {
        if (typeof value === 'string') {
          try {
            payload[field.name] = JSON.parse(value);
          } catch {
            payload[field.name] = value.split(',').map((s) => s.trim());
          }
        } else {
          payload[field.name] = value;
        }
      } else {
        payload[field.name] = value;
      }
    });

    // Build custom headers object
    const headers: Record<string, string> = {};
    customHeaders.forEach((h) => {
      if (h.key && h.value) {
        headers[h.key] = h.value;
      }
    });

    try {
      const res = await fetch('/api/agents/test-endpoint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: endpointUrl, payload, headers }),
        signal: abortControllerRef.current.signal,
      });

      // Check if component is still mounted before parsing response
      if (!mountedRef.current) return;

      const data = await res.json();
      const elapsed = Date.now() - startTime;

      // Guard all state updates with mount check
      if (!mountedRef.current) return;

      // Update response time
      setResponseTime(elapsed);

      // Process response data
      if (data.reachable) {
        setHttpStatus({
          code: data.status,
          text: data.statusText,
          success: data.success,
        });

        if (data.response !== null && data.response !== undefined) {
          const responseStr =
            typeof data.response === 'string'
              ? data.response
              : JSON.stringify(data.response, null, 2);
          setResponse(responseStr);
          setResponseSize(`${(new Blob([responseStr]).size / 1024).toFixed(1)} KB`);
        } else {
          setResponse(JSON.stringify({ message: 'Empty response from endpoint' }, null, 2));
        }

        // Set response headers if available
        if (data.headers) {
          setResponseHeaders(data.headers);
        } else {
          setResponseHeaders({ 'content-type': 'application/json' });
        }
      } else {
        setHttpStatus({ code: 0, text: 'Unreachable', success: false });
        setResponse(JSON.stringify({ error: data.error || 'Could not reach endpoint' }, null, 2));
      }
    } catch (err) {
      // Ignore abort errors - these are expected on unmount or new request
      if (err instanceof Error && err.name === 'AbortError') return;

      // Guard error state updates with mount check
      if (!mountedRef.current) return;

      setHttpStatus({ code: 0, text: 'Error', success: false });
      setResponse(
        JSON.stringify(
          {
            error: err instanceof Error ? err.message : 'Test failed',
          },
          null,
          2
        )
      );
    } finally {
      if (mountedRef.current) {
        setTesting(false);
      }
    }
  }, [endpointUrl, token, testing, validFields, paramValues, customHeaders]);

  const copyRequest = () => {
    navigator.clipboard.writeText(requestJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.playground}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.headerTitle}>
          <Play size={16} />
          Test Playground
        </span>
        {responseTime && (
          <span className={styles.timeBadge}>{(responseTime / 1000).toFixed(2)}s</span>
        )}
      </div>

      {/* Endpoint bar */}
      <div className={styles.endpoint}>
        <span className={styles.method}>POST</span>
        <span className={styles.url}>{endpointUrl || 'Enter endpoint URL above'}</span>
      </div>

      {/* Playground tabs */}
      <div className={styles.playgroundTabs}>
        <button
          className={`${styles.playgroundTab} ${activeTab === 'params' ? styles.active : ''}`}
          onClick={() => setActiveTab('params')}
        >
          Parameters <span className={styles.count}>{validFields.length}</span>
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
            {validFields.length === 0 ? (
              <div className={styles.paramEmpty}>
                No parameters defined. Add input parameters in the schema above.
              </div>
            ) : (
              validFields.map((field) => (
                <div key={field.id} className={styles.paramRow}>
                  <div className={styles.paramInfo}>
                    <div className={styles.paramName}>
                      {field.name}
                      {field.required && <span className={styles.required}>required</span>}
                    </div>
                    <div className={styles.paramType}>{field.type}</div>
                  </div>
                  <div className={styles.paramInputWrap}>
                    {field.enumValues?.length ? (
                      <select
                        className={styles.paramSelect}
                        value={String(paramValues[field.name] ?? '')}
                        onChange={(e) =>
                          setParamValues((prev) => ({
                            ...prev,
                            [field.name]: e.target.value || undefined,
                          }))
                        }
                      >
                        {!field.required && <option value="">Select {field.name}...</option>}
                        {field.enumValues.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : field.type === 'boolean' ? (
                      <select
                        className={styles.paramSelect}
                        value={
                          paramValues[field.name] === undefined
                            ? ''
                            : String(paramValues[field.name])
                        }
                        onChange={(e) =>
                          setParamValues((prev) => ({
                            ...prev,
                            [field.name]:
                              e.target.value === '' ? undefined : e.target.value === 'true',
                          }))
                        }
                      >
                        {!field.required && <option value="">Select...</option>}
                        <option value="false">false</option>
                        <option value="true">true</option>
                      </select>
                    ) : field.type === 'number' || field.type === 'integer' ? (
                      <input
                        type="number"
                        className={styles.paramInput}
                        placeholder={field.required ? `Enter ${field.name}` : 'Optional'}
                        value={
                          typeof paramValues[field.name] === 'number'
                            ? (paramValues[field.name] as number)
                            : ''
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          const parsed = val === '' ? undefined : parseInt(val, 10);
                          setParamValues((prev) => ({
                            ...prev,
                            [field.name]: Number.isNaN(parsed) ? undefined : parsed,
                          }));
                        }}
                      />
                    ) : field.type === 'array' ? (
                      <input
                        type="text"
                        className={styles.paramInput}
                        placeholder='["item1", "item2"] or item1, item2'
                        value={
                          typeof paramValues[field.name] === 'string'
                            ? (paramValues[field.name] as string)
                            : ''
                        }
                        onChange={(e) =>
                          setParamValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                      />
                    ) : (
                      <input
                        type="text"
                        className={styles.paramInput}
                        placeholder={field.description || `Enter ${field.name}...`}
                        value={(paramValues[field.name] as string) || ''}
                        onChange={(e) =>
                          setParamValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                      />
                    )}
                    {field.description && (
                      <div className={styles.paramDesc}>{field.description}</div>
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
            {customHeaders.map((header, index) => {
              const isSecret = isSecretHeader(header.key);
              const isVisible = visibleSecrets.has(index);

              return (
                <div key={index} className={styles.customHeaderRow}>
                  <input
                    type="text"
                    className={styles.headerKeyInput}
                    placeholder="Header name"
                    value={header.key}
                    onChange={(e) => updateCustomHeader(index, 'key', e.target.value)}
                  />
                  <div className={styles.headerValueWrapper}>
                    <input
                      type={isSecret && !isVisible ? 'password' : 'text'}
                      className={styles.headerValueInput}
                      placeholder="Value"
                      value={isSecret && !isVisible ? header.value : header.value}
                      onChange={(e) => updateCustomHeader(index, 'value', e.target.value)}
                    />
                    {isSecret && header.value && (
                      <button
                        type="button"
                        className={styles.toggleSecretBtn}
                        onClick={() => toggleSecretVisibility(index)}
                        title={isVisible ? 'Hide secret' : 'Show secret'}
                      >
                        {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    )}
                  </div>
                  <button
                    className={styles.removeHeaderBtn}
                    onClick={() => removeCustomHeader(index)}
                    title="Remove header"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}

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
          disabled={!endpointUrl || testing}
          size="lg"
          className={styles.btnSend}
        >
          {testing ? (
            <>
              <Loader2 size={16} className={styles.spinner} />
              Testing...
            </>
          ) : (
            <>
              <Play size={16} />
              Send Test Request
            </>
          )}
        </Button>
        {!endpointUrl && <span className={styles.hint}>Enter a backend URL first</span>}
      </div>

      {/* Response panel */}
      {httpStatus && (
        <div className={styles.responsePanel}>
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
          <div className={styles.responseStatusBar}>
            <span
              className={`${styles.statusCode} ${httpStatus.success ? styles.success : styles.error}`}
            >
              {httpStatus.code ? formatHttpStatus(httpStatus.code) : httpStatus.text}
            </span>
            {responseTime && (
              <span className={styles.statusMeta}>
                Time: <span>{responseTime}ms</span>
              </span>
            )}
            {responseSize && (
              <span className={styles.statusMeta}>
                Size: <span>{responseSize}</span>
              </span>
            )}
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
    </div>
  );
});
