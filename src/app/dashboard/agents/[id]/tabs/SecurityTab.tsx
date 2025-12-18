'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key,
  Loader2,
  RefreshCw,
  Copy,
  HelpCircle,
  Shield,
  CheckCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/lib/store/authStore';
import { Agent } from '../page';
import styles from './tabs.module.css';

interface Props {
  agent: Agent;
  onToast: (message: string) => void;
}

interface SecretKeyInfo {
  hasKey: boolean;
  secret: string | null;
  createdAt: string | null;
}

async function fetchSecretKey(agentId: string, token: string): Promise<SecretKeyInfo> {
  const res = await fetch(`/api/agents/${agentId}/secret`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch secret key');
  return res.json();
}

async function generateSecretKeyApi(agentId: string, token: string): Promise<SecretKeyInfo> {
  const res = await fetch(`/api/agents/${agentId}/secret`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to generate key');
  }
  const data = await res.json();
  return {
    hasKey: true,
    secret: data.secret,
    createdAt: new Date().toISOString(),
  };
}

async function revokeSecretKeyApi(agentId: string, token: string): Promise<SecretKeyInfo> {
  const res = await fetch(`/api/agents/${agentId}/secret`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to revoke key');
  return { hasKey: false, secret: null, createdAt: null };
}

type ProxyType = 'nginx' | 'caddy' | 'traefik' | 'haproxy';
type CodeType = 'nextjs' | 'express' | 'cloudflare' | 'lambda';
type ConfigMode = 'proxy' | 'code';

export default function SecurityTab({ agent, onToast }: Props) {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const [configMode, setConfigMode] = useState<ConfigMode>('proxy');
  const [proxyType, setProxyType] = useState<ProxyType>('nginx');
  const [codeType, setCodeType] = useState<CodeType>('nextjs');
  const [showSecret, setShowSecret] = useState(false);

  const { data: secretKey, isLoading: loadingSecret } = useQuery({
    queryKey: ['agent-secret', agent.id, token],
    queryFn: () => fetchSecretKey(agent.id, token!),
    enabled: !!token,
    staleTime: 60_000,
  });

  const generateMutation = useMutation({
    mutationFn: () => generateSecretKeyApi(agent.id, token!),
    onSuccess: (data) => {
      queryClient.setQueryData(['agent-secret', agent.id, token], data);
      onToast('Secret key generated!');
    },
    onError: (err) => {
      onToast(err instanceof Error ? err.message : 'Failed to generate key');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeSecretKeyApi(agent.id, token!),
    onSuccess: (data) => {
      queryClient.setQueryData(['agent-secret', agent.id, token], data);
      onToast('Secret revoked');
    },
    onError: (err) => {
      onToast(err instanceof Error ? err.message : 'Failed to revoke');
    },
  });

  const generateSecretKey = (isRotate = false) => {
    if (
      isRotate &&
      !confirm(
        "Rotate secret? The old secret will stop working immediately. You'll need to update your proxy config."
      )
    )
      return;
    generateMutation.mutate();
  };

  const revokeSecretKey = () => {
    if (
      !confirm(
        'Revoke secret? All requests will be rejected until you generate a new one and update your proxy.'
      )
    )
      return;
    revokeMutation.mutate();
  };

  const isLoading = generateMutation.isPending || revokeMutation.isPending;

  const copyToClipboard = async (text: string, message = 'Copied!') => {
    await navigator.clipboard.writeText(text);
    onToast(message);
  };

  const maskedSecret = secretKey?.secret
    ? secretKey.secret.slice(0, 8) + '••••••••••••••••' + secretKey.secret.slice(-4)
    : '';

  const getProxyConfig = () => {
    // Only show real secret when showSecret is true, otherwise use placeholder
    const secret = showSecret && secretKey?.secret ? secretKey.secret : '<YOUR_SECRET_KEY>';

    const configs: Record<ProxyType, string> = {
      nginx: `location / {
    if ($http_x_agentokratia_secret != "${secret}") {
        return 403;
    }
    proxy_pass http://127.0.0.1:8080;
}`,

      caddy: `example.com {
    @valid header X-Agentokratia-Secret "${secret}"
    handle @valid {
        reverse_proxy 127.0.0.1:8080
    }
    respond 403
}`,

      traefik: `# docker-compose.yml labels
labels:
  - "traefik.http.middlewares.auth.headers.customrequestheaders.X-Agentokratia-Secret=${secret}"
  - "traefik.http.routers.myapp.middlewares=auth"

# Or check via plugin (requires traefik-plugin-header-match)`,

      haproxy: `frontend www
    bind *:80
    acl valid_secret hdr(X-Agentokratia-Secret) -m str ${secret}
    use_backend app if valid_secret
    default_backend denied

backend app
    server s1 127.0.0.1:8080

backend denied
    http-request deny deny_status 403`,
    };

    return configs[proxyType];
  };

  const getCodeSnippet = () => {
    // Only show real secret when showSecret is true, otherwise use placeholder
    const secret = showSecret && secretKey?.secret ? secretKey.secret : '<YOUR_SECRET_KEY>';

    const snippets: Record<CodeType, string> = {
      nextjs: `// Add these 3 lines to your API route
const secret = request.headers.get('X-Agentokratia-Secret');
if (secret !== process.env.AGENTOKRATIA_SECRET) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
}

// .env.local
AGENTOKRATIA_SECRET=${secret}`,

      express: `// Add these 3 lines to your route handler
const secret = req.headers['x-agentokratia-secret'];
if (secret !== process.env.AGENTOKRATIA_SECRET) {
  return res.status(403).json({ error: 'Unauthorized' });
}

// .env
AGENTOKRATIA_SECRET=${secret}`,

      cloudflare: `// Add these 3 lines to your Worker
const secret = request.headers.get('X-Agentokratia-Secret');
if (secret !== env.AGENTOKRATIA_SECRET) {
  return new Response('Unauthorized', { status: 403 });
}

// wrangler secret put AGENTOKRATIA_SECRET
// Value: ${secret}`,

      lambda: `// Add these 3 lines to your handler
const secret = event.headers['x-agentokratia-secret'];
if (secret !== process.env.AGENTOKRATIA_SECRET) {
  return { statusCode: 403, body: 'Unauthorized' };
}

// Environment variable:
// AGENTOKRATIA_SECRET=${secret}`,
    };

    return snippets[codeType];
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Security</h2>
        <p className={styles.desc}>Secure your API endpoint so only Agentokratia can call it</p>
      </div>

      {/* Why do I need this? */}
      <div
        style={{
          padding: '20px',
          background:
            'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.04) 100%)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '24px',
          border: '1px solid rgba(59, 130, 246, 0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'rgba(59, 130, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <HelpCircle size={20} style={{ color: '#3B82F6' }} />
          </div>
          <div>
            <h3
              style={{
                fontSize: '16px',
                fontWeight: 600,
                marginBottom: '8px',
                color: 'var(--ink)',
              }}
            >
              How it works
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--stone)', lineHeight: 1.6, margin: 0 }}>
              Agentokratia adds a secret header (
              <code
                style={{
                  background: 'var(--cloud)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              >
                X-Agentokratia-Secret
              </code>
              ) to every request. Verify this header to ensure requests come from Agentokratia (and
              are paid for).
            </p>
            <div style={{ marginTop: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: 'var(--stone)',
                }}
              >
                <CheckCircle size={14} style={{ color: 'var(--success)' }} />
                <span>Proxy config or code</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: 'var(--stone)',
                }}
              >
                <CheckCircle size={14} style={{ color: 'var(--success)' }} />
                <span>Works with serverless</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: 'var(--stone)',
                }}
              >
                <CheckCircle size={14} style={{ color: 'var(--success)' }} />
                <span>One-time setup</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.twoColumn}>
        <div className={styles.mainColumn}>
          {/* Secret Key Section */}
          <div className={styles.formSection}>
            <div className={styles.formSectionTitle}>
              <Shield size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              Step 1: Generate Secret Key
            </div>
            <p className={styles.formHint} style={{ marginBottom: '16px' }}>
              Generate a secret key that Agentokratia will include in the{' '}
              <code
                style={{
                  background: 'var(--cloud)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              >
                X-Agentokratia-Secret
              </code>{' '}
              header.
            </p>

            <div className={styles.secretBox}>
              {loadingSecret ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Loader2 size={20} className={styles.spinning} />
                  <span>Loading...</span>
                </div>
              ) : secretKey?.hasKey ? (
                <div style={{ width: '100%' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Key size={20} style={{ color: 'var(--success)' }} />
                      <div>
                        <strong style={{ display: 'block', color: 'var(--ink)' }}>
                          Secret Key Active
                        </strong>
                        <span style={{ fontSize: '12px', color: 'var(--stone)' }}>
                          Created{' '}
                          {secretKey.createdAt
                            ? new Date(secretKey.createdAt).toLocaleDateString()
                            : 'recently'}
                        </span>
                      </div>
                    </div>
                    <div className={styles.secretActions}>
                      <button
                        className={styles.secretBtn}
                        onClick={() => generateSecretKey(true)}
                        disabled={isLoading}
                        title="Rotate key"
                      >
                        <RefreshCw size={14} className={isLoading ? styles.spinning : ''} />
                      </button>
                      <button
                        className={styles.secretBtn}
                        onClick={revokeSecretKey}
                        disabled={isLoading}
                        title="Revoke key"
                      >
                        Revoke
                      </button>
                    </div>
                  </div>

                  {/* Secret display */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px',
                      background: 'var(--ink)',
                      borderRadius: 'var(--radius-sm)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '13px',
                    }}
                  >
                    <code style={{ flex: 1, color: 'var(--cloud)', wordBreak: 'break-all' }}>
                      {showSecret ? secretKey.secret : maskedSecret}
                    </code>
                    <button
                      onClick={() => setShowSecret(!showSecret)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--stone)',
                        padding: '4px',
                      }}
                      title={showSecret ? 'Hide' : 'Show'}
                    >
                      {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(secretKey.secret!, 'Secret copied!')}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--stone)',
                        padding: '4px',
                      }}
                      title="Copy"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Key size={20} style={{ color: 'var(--stone)' }} />
                    <div>
                      <strong style={{ display: 'block', color: 'var(--ink)' }}>
                        No Secret Key
                      </strong>
                      <span style={{ fontSize: '12px', color: 'var(--stone)' }}>
                        Generate a key to secure your agent
                      </span>
                    </div>
                  </div>
                  <Button onClick={() => generateSecretKey(false)} loading={isLoading}>
                    <Key size={16} />
                    Generate Key
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Config Section - Proxy or Code */}
          {secretKey?.hasKey && (
            <div className={styles.formSection}>
              <div className={styles.formSectionTitle}>
                <Key size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                Step 2: Verify the Secret
              </div>

              {/* Mode toggle */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button
                  onClick={() => setConfigMode('proxy')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: configMode === 'proxy' ? 'var(--ink)' : 'var(--cloud)',
                    color: configMode === 'proxy' ? 'var(--cloud)' : 'var(--stone)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  Proxy Config
                </button>
                <button
                  onClick={() => setConfigMode('code')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: configMode === 'code' ? 'var(--ink)' : 'var(--cloud)',
                    color: configMode === 'code' ? 'var(--cloud)' : 'var(--stone)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  Code Snippet
                </button>
              </div>

              <p className={styles.formHint} style={{ marginBottom: '16px' }}>
                {configMode === 'proxy'
                  ? 'For traditional servers with nginx, caddy, etc. Zero code changes.'
                  : 'Just 3 lines of code. Copy, paste, done.'}
              </p>

              {configMode === 'proxy' ? (
                <>
                  <div className={styles.schemaTabs} style={{ marginBottom: '12px' }}>
                    {(['nginx', 'caddy', 'traefik', 'haproxy'] as ProxyType[]).map((type) => (
                      <button
                        key={type}
                        className={`${styles.schemaTab} ${proxyType === type ? styles.active : ''}`}
                        onClick={() => setProxyType(type)}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    ))}
                  </div>

                  <div className={styles.schemaEditor}>
                    <div
                      className={styles.schemaEditorHeader}
                      style={{ display: 'flex', justifyContent: 'space-between' }}
                    >
                      <span>{proxyType}.conf</span>
                      <button
                        className={styles.schemaBtn}
                        onClick={() => copyToClipboard(getProxyConfig(), 'Config copied!')}
                      >
                        <Copy size={12} style={{ marginRight: '4px' }} />
                        Copy
                      </button>
                    </div>
                    <pre
                      className={styles.schemaTextarea}
                      style={{
                        minHeight: '180px',
                        overflow: 'auto',
                        whiteSpace: 'pre',
                        padding: '16px',
                      }}
                    >
                      <code>{getProxyConfig()}</code>
                    </pre>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.schemaTabs} style={{ marginBottom: '12px' }}>
                    {(
                      [
                        { key: 'nextjs', label: 'Next.js / Vercel' },
                        { key: 'express', label: 'Express' },
                        { key: 'cloudflare', label: 'Cloudflare' },
                        { key: 'lambda', label: 'AWS Lambda' },
                      ] as { key: CodeType; label: string }[]
                    ).map(({ key, label }) => (
                      <button
                        key={key}
                        className={`${styles.schemaTab} ${codeType === key ? styles.active : ''}`}
                        onClick={() => setCodeType(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className={styles.schemaEditor}>
                    <div
                      className={styles.schemaEditorHeader}
                      style={{ display: 'flex', justifyContent: 'space-between' }}
                    >
                      <span>3 lines to add</span>
                      <button
                        className={styles.schemaBtn}
                        onClick={() => copyToClipboard(getCodeSnippet(), 'Code copied!')}
                      >
                        <Copy size={12} style={{ marginRight: '4px' }} />
                        Copy
                      </button>
                    </div>
                    <pre
                      className={styles.schemaTextarea}
                      style={{
                        minHeight: '140px',
                        overflow: 'auto',
                        whiteSpace: 'pre',
                        padding: '16px',
                      }}
                    >
                      <code>{getCodeSnippet()}</code>
                    </pre>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className={styles.sideColumn}>
          {/* Quick Summary */}
          <div
            style={{
              padding: '16px',
              background: 'var(--cloud)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '16px',
            }}
          >
            <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Quick Setup</h4>
            <ol
              style={{
                fontSize: '13px',
                color: 'var(--stone)',
                lineHeight: 1.8,
                margin: 0,
                paddingLeft: '18px',
              }}
            >
              <li>
                <strong>Generate</strong> a secret key
              </li>
              <li>
                <strong>Choose</strong> proxy config or code snippet
              </li>
              <li>
                <strong>Deploy</strong> the verification
              </li>
              <li>
                <strong>Done!</strong> Unauthorized requests blocked
              </li>
            </ol>
          </div>

          {/* Request Flow */}
          <div
            style={{
              padding: '16px',
              background: 'var(--cloud)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '16px',
            }}
          >
            <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
              Request Flow
            </h4>
            <div style={{ fontSize: '13px', color: 'var(--stone)', lineHeight: 1.8 }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}
              >
                <span
                  style={{
                    background: 'var(--ink)',
                    color: 'var(--cloud)',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                  }}
                >
                  1
                </span>
                <span>User pays &amp; calls via Agentokratia</span>
              </div>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}
              >
                <span
                  style={{
                    background: 'var(--ink)',
                    color: 'var(--cloud)',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                  }}
                >
                  2
                </span>
                <span>
                  We add <code style={{ fontSize: '11px' }}>X-Agentokratia-Secret</code>
                </span>
              </div>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}
              >
                <span
                  style={{
                    background: 'var(--ink)',
                    color: 'var(--cloud)',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                  }}
                >
                  3
                </span>
                <span>Your endpoint verifies the header</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    background: 'var(--success)',
                    color: 'var(--cloud)',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                  }}
                >
                  ✓
                </span>
                <span>Valid? Process the request</span>
              </div>
            </div>
          </div>

          {/* Optional Note */}
          <div
            style={{
              padding: '16px',
              background: 'var(--cloud)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '16px',
            }}
          >
            <h4
              style={{
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '8px',
                color: 'var(--ink)',
              }}
            >
              Is this required?
            </h4>
            <p style={{ fontSize: '13px', color: 'var(--stone)', margin: 0, lineHeight: 1.5 }}>
              Optional but recommended. Without it, anyone who discovers your endpoint URL could
              call it directly (bypassing payment).
            </p>
          </div>

          {/* Security Note */}
          <div
            style={{
              padding: '16px',
              background: 'rgba(245, 158, 11, 0.1)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            <h4
              style={{
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '8px',
                color: 'var(--ink)',
              }}
            >
              Keep it secret
            </h4>
            <p style={{ fontSize: '13px', color: 'var(--stone)', margin: 0, lineHeight: 1.5 }}>
              Store in environment variables. If compromised, rotate immediately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
