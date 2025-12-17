'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Shield, ShieldCheck, Star, X, Zap, Clock, Activity, AlertCircle, Play, Check, Copy, ExternalLink, Code, FileText, MessageSquare, Share2, User, Download } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui';
import { PublicHeader, PublicFooter } from '@/components/layout';
import { ApiPlayground } from '@/components/marketplace/ApiPlayground';
import { ReviewsList } from '@/components/marketplace/ReviewsList/ReviewsList';
import { formatUsdc, formatCompactNumber } from '@/lib/utils/format';
import { ROUTES } from '@/lib/utils/constants';
import { useAllNetworks, getExplorerUrlForChain } from '@/lib/network/client';
import styles from './page.module.css';

interface ReviewStats {
  avgScore: number;
  avgRating: number;
  reviewCount: number;
  distribution: { 5: number; 4: number; 3: number; 2: number; 1: number; };
}

interface MarketplaceAgentDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  pricePerCall: number;
  totalCalls: number;
  tags: string[] | null;
  readme: string | null;
  ownerId: string;
  ownerHandle: string;
  ownerName: string | null;
  inputSchema: object | null;
  outputSchema: object | null;
  createdAt: string;
  publishedAt: string | null;
  erc8004TokenId: string | null;
  erc8004TxHash: string | null;
  erc8004ChainId: number | null;
  reviewsEnabled: boolean;
  stats?: { uptime: number; avgResponseMs: number; errorRate: number; };
  reviewStats?: ReviewStats;
}

type CodeLang = 'js' | 'py' | 'curl';
type TabId = 'readme' | 'api' | 'reviews';

async function fetchMarketplaceAgent(handle: string, slug: string): Promise<MarketplaceAgentDetail> {
  const res = await fetch(`/api/marketplace/${handle}/${slug}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error('Agent not found');
    throw new Error('Failed to fetch agent');
  }
  return (await res.json()).agent;
}

export default function AgentDetailPage() {
  const params = useParams();
  const handle = params.handle as string;
  const slug = params.slug as string;

  const { data: networks } = useAllNetworks();
  const [activeTab, setActiveTab] = useState<TabId>('readme');
  const [codeLang, setCodeLang] = useState<CodeLang>('js');
  const [isPlaygroundOpen, setIsPlaygroundOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [copiedInput, setCopiedInput] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);

  const { data: agent, isLoading, error, refetch: refetchAgent } = useQuery({
    queryKey: ['agent', handle, slug],
    queryFn: () => fetchMarketplaceAgent(handle, slug),
    enabled: !!handle && !!slug,
    staleTime: 30_000,
  });

  
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPlaygroundOpen) setIsPlaygroundOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isPlaygroundOpen]);

  useEffect(() => {
    document.body.style.overflow = isPlaygroundOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isPlaygroundOpen]);

  const handleReviewSubmitted = useCallback(() => {
    setIsPlaygroundOpen(false);
  }, []);

  // Endpoint uses handle/slug format
  const apiBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agentokratia.com';
  const endpoint = agent ? `${apiBaseUrl}/api/v1/call/${handle}/${slug}` : '';

  const copyCode = () => {
    if (!agent) return;
    navigator.clipboard.writeText(fullCodeExamples[codeLang]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyEndpoint = () => {
    if (!agent) return;
    navigator.clipboard.writeText(endpoint);
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 2000);
  };

  const copyShareUrl = () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    navigator.clipboard.writeText(url);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  const copyInputSchema = () => {
    if (!agent?.inputSchema) return;
    navigator.clipboard.writeText(JSON.stringify(agent.inputSchema, null, 2));
    setCopiedInput(true);
    setTimeout(() => setCopiedInput(false), 2000);
  };

  const copyOutputSchema = () => {
    if (!agent?.outputSchema) return;
    navigator.clipboard.writeText(JSON.stringify(agent.outputSchema, null, 2));
    setCopiedOutput(true);
    setTimeout(() => setCopiedOutput(false), 2000);
  };

  const generateOpenApiSpec = () => {
    if (!agent) return null;
    return {
      openapi: '3.0.3',
      info: {
        title: agent.name,
        description: agent.description || '',
        version: '1.0.0',
      },
      servers: [{ url: apiBaseUrl }],
      paths: {
        [`/api/v1/call/${handle}/${slug}`]: {
          post: {
            summary: agent.name,
            description: agent.description || '',
            requestBody: agent.inputSchema ? {
              required: true,
              content: {
                'application/json': {
                  schema: agent.inputSchema,
                },
              },
            } : undefined,
            responses: {
              '200': {
                description: 'Successful response',
                content: agent.outputSchema ? {
                  'application/json': {
                    schema: agent.outputSchema,
                  },
                } : undefined,
              },
              '402': {
                description: 'Payment required - see x402 protocol',
              },
            },
          },
        },
      },
    };
  };

  const downloadOpenApiSpec = () => {
    const spec = generateOpenApiSpec();
    if (!spec) return;
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-openapi.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className={styles.page}>
        <PublicHeader currentPage="agent" />
        <div className={styles.loadingState}>
          <Loader2 size={32} className={styles.spinner} />
        </div>
        <PublicFooter />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className={styles.page}>
        <PublicHeader currentPage="agent" />
        <div className={styles.errorState}>
          <AlertCircle size={48} />
          <h2>Agent Not Found</h2>
          <p>{error instanceof Error ? error.message : 'This agent does not exist.'}</p>
          <Link href={ROUTES.MARKETPLACE}><Button>Back to Marketplace</Button></Link>
        </div>
        <PublicFooter />
      </div>
    );
  }

  const reviewCount = agent.reviewStats?.reviewCount ?? 0;
  const avgRating = agent.reviewStats?.avgRating ?? 0;

  const fullCodeExamples: Record<CodeLang, string> = {
    js: `// Install: npm install @x402/axios @x402/evm viem

import axios from "axios";
import { wrapAxiosWithPayment, x402Client } from "@x402/axios";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.WALLET_KEY);
const client = new x402Client().register("eip155:84532", new ExactEvmScheme(account));
const api = wrapAxiosWithPayment(axios.create(), client);

const { data } = await api.post("${endpoint}", {
  // your parameters
});`,
    py: `# Install: pip install x402-client

from eth_account import Account
from x402_client import X402AsyncClient

account = Account.from_key(WALLET_KEY)

async with X402AsyncClient(account=account) as client:
    response = await client.post("${endpoint}", json={"your": "params"})`,
    curl: `# Manual request (for testing)
# The payment-signature header requires a signed payment payload

curl -X POST "${endpoint}" \\
  -H "Content-Type: application/json" \\
  -d '{"your": "params"}'

# Without a valid payment, you'll receive a 402 response
# with payment details in the "payment-required" header`
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'readme', label: 'Readme', icon: <FileText size={16} /> },
    { id: 'api', label: 'API', icon: <Code size={16} /> },
    { id: 'reviews', label: `Reviews${reviewCount > 0 ? ` (${reviewCount})` : ''}`, icon: <MessageSquare size={16} /> },
  ];

  return (
    <div className={styles.page}>
      <PublicHeader currentPage="agent" />

      {/* Two Column Layout */}
      <div className={styles.container}>
        {/* Left Sidebar - Sticky */}
        <aside className={styles.sidebar}>
          {/* Agent Header */}
          <div className={styles.agentHeader}>
            <Link href={ROUTES.MARKETPLACE} className={styles.back}>
              <ArrowLeft size={14} /> Marketplace
            </Link>
            <h1 className={styles.agentName}>{agent.name}</h1>
            {agent.description && (
              <p className={styles.agentDesc}>{agent.description}</p>
            )}
          </div>

          {/* Try Button */}
          <Button
            size="lg"
            className={styles.tryBtn}
            onClick={() => setIsPlaygroundOpen(true)}
          >
            <Play size={18} />
            Try Agent
          </Button>

          {/* Pricing */}
          <div className={styles.pricingCard}>
            <div className={styles.priceRow}>
              <span className={styles.priceLabel}>Price per call</span>
              <span className={styles.priceValue}>{formatUsdc(agent.pricePerCall)}</span>
            </div>
            <p className={styles.pricingNote}>Pay with USDC. No subscription required.</p>
          </div>

          {/* Author */}
          <div className={styles.authorCard}>
            <span className={styles.cardLabel}>Developer</span>
            <Link
              href={`/creator/${agent.ownerHandle}`}
              className={styles.authorLink}
            >
              <div className={styles.authorAvatar}>
                <User size={16} />
              </div>
              <span>@{agent.ownerHandle}</span>
            </Link>
          </div>

          {/* Stats */}
          <div className={styles.statsCard}>
            <span className={styles.cardLabel}>Agent Stats</span>
            <div className={styles.statsList}>
              <div className={styles.statItem}>
                <Activity size={14} />
                <span>{formatCompactNumber(agent.totalCalls)} calls</span>
              </div>
              {reviewCount > 0 && (
                <div className={styles.statItem}>
                  <Star size={14} fill="#fbbf24" stroke="#fbbf24" />
                  <span>{avgRating.toFixed(1)} ({reviewCount} reviews)</span>
                </div>
              )}
              {agent.stats?.avgResponseMs && (
                <div className={styles.statItem}>
                  <Zap size={14} />
                  <span>{agent.stats.avgResponseMs}ms avg</span>
                </div>
              )}
              {agent.stats?.uptime && (
                <div className={styles.statItem}>
                  <Clock size={14} />
                  <span>{agent.stats.uptime}% uptime</span>
                </div>
              )}
            </div>
          </div>

          {/* Trust & Security */}
          <div className={styles.trustCard}>
            <span className={styles.cardLabel}>Trust & Security</span>

            {/* On-chain Verification */}
            {agent.erc8004TokenId ? (
              <a
                href={getExplorerUrlForChain(networks, agent.erc8004ChainId, agent.erc8004TxHash!) || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.trustItem}
              >
                <div className={styles.trustIconActive}>
                  <ShieldCheck size={14} />
                </div>
                <div className={styles.trustContent}>
                  <span className={styles.trustTitle}>On-chain Verified</span>
                  <span className={styles.trustDesc}>Ownership secured on blockchain</span>
                </div>
                <ExternalLink size={12} className={styles.trustExternal} />
              </a>
            ) : (
              <div className={styles.trustItem}>
                <div className={styles.trustIconInactive}>
                  <Shield size={14} />
                </div>
                <div className={styles.trustContent}>
                  <span className={styles.trustTitleMuted}>Not Verified</span>
                  <span className={styles.trustDesc}>Agent not registered on-chain</span>
                </div>
              </div>
            )}

            {/* Reviews Status */}
            {agent.reviewsEnabled ? (
              reviewCount > 0 ? (
                <div className={styles.trustItem}>
                  <div className={styles.trustIconActive}>
                    <MessageSquare size={14} />
                  </div>
                  <div className={styles.trustContent}>
                    <span className={styles.trustTitle}>Reviews Enabled</span>
                    <span className={styles.trustDesc}>{reviewCount} verified user reviews</span>
                  </div>
                </div>
              ) : (
                <div className={styles.trustItem}>
                  <div className={styles.trustIconActive}>
                    <MessageSquare size={14} />
                  </div>
                  <div className={styles.trustContent}>
                    <span className={styles.trustTitle}>Reviews Enabled</span>
                    <span className={styles.trustDesc}>Be the first to review</span>
                  </div>
                </div>
              )
            ) : (
              <div className={styles.trustItem}>
                <div className={styles.trustIconInactive}>
                  <MessageSquare size={14} />
                </div>
                <div className={styles.trustContent}>
                  <span className={styles.trustTitleMuted}>Reviews Not Available</span>
                  <span className={styles.trustDesc}>Agent owner has not enabled reviews</span>
                </div>
              </div>
            )}
          </div>

          {/* Category & Share */}
          <div className={styles.metaRow}>
            <span className={styles.category}>{agent.category}</span>
            <button className={styles.shareBtn} onClick={copyShareUrl}>
              {copiedShare ? <Check size={14} /> : <Share2 size={14} />}
              {copiedShare ? 'Copied' : 'Share'}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className={styles.main}>
          {/* Tabs */}
          <div className={styles.tabs} role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className={styles.tabContent}>
            {/* Readme Tab */}
            {activeTab === 'readme' && (
              <div className={styles.readmeTab}>
                {agent.readme ? (
                  <div className={styles.readme}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{agent.readme}</ReactMarkdown>
                  </div>
                ) : (
                  <div className={styles.noContent}>
                    <FileText size={32} />
                    <h3>No readme available</h3>
                    <p>Check the API tab for integration details.</p>
                  </div>
                )}

                {agent.tags && agent.tags.length > 0 && (
                  <div className={styles.tagsSection}>
                    <h4>Topics</h4>
                    <div className={styles.tags}>
                      {agent.tags.map((tag) => (
                        <span key={tag} className={styles.tag}>{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* API Tab */}
            {activeTab === 'api' && (
              <div className={styles.apiTab}>
                {/* Integration Guide */}
                <div className={styles.integrationHeader}>
                  <h3>Integrate in 2 minutes</h3>
                  <ol className={styles.integrationSteps}>
                    <li>Install an HTTP client with <a href="https://www.x402.org" target="_blank" rel="noopener noreferrer">x402</a> support (see Node.js and Python examples below)</li>
                    <li>Add your wallet private key (needs USDC on Base)</li>
                    <li>Send a POST request to the endpoint below - you only pay when it succeeds</li>
                  </ol>
                </div>

                {/* Endpoint */}
                <div className={styles.endpointSection}>
                  <div className={styles.endpointRow}>
                    <span className={styles.method}>POST</span>
                    <code className={styles.endpointUrl}>{endpoint}</code>
                    <button onClick={copyEndpoint} className={styles.copyBtn}>
                      {copiedEndpoint ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                {/* Code Examples */}
                <div className={styles.apiSection}>
                  <h3>Code</h3>
                  <div className={styles.codeCard}>
                    <div className={styles.codeTabs}>
                      {(['js', 'py', 'curl'] as const).map((lang) => (
                        <button
                          key={lang}
                          className={`${styles.codeTab} ${codeLang === lang ? styles.active : ''}`}
                          onClick={() => setCodeLang(lang)}
                        >
                          {lang === 'js' ? 'Node.js' : lang === 'py' ? 'Python' : 'cURL'}
                        </button>
                      ))}
                    </div>
                    <div className={styles.codeBody}>
                      <pre><code>{fullCodeExamples[codeLang]}</code></pre>
                      <button className={styles.codeCopyBtn} onClick={copyCode}>
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                    {codeLang !== 'curl' && (
                      <div className={styles.codeFooter}>
                        <a
                          href={codeLang === 'js'
                            ? 'https://github.com/Agentokratia/quickstart-example'
                            : 'https://github.com/Agentokratia/quickstart-example-python'
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.quickstartLink}
                        >
                          <ExternalLink size={14} />
                          View full example on GitHub
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Schemas */}
                {(agent.inputSchema || agent.outputSchema) && (
                  <div className={styles.apiSection}>
                    <div className={styles.sectionHeader}>
                      <h3>Schemas</h3>
                      <button className={styles.specBtn} onClick={downloadOpenApiSpec}>
                        <Download size={14} /> OpenAPI
                      </button>
                    </div>
                    <div className={styles.schemaGrid}>
                      {agent.inputSchema && (
                        <div className={styles.schemaCard}>
                          <div className={styles.schemaHeader}>
                            <span className={styles.schemaLabel}>Request Body</span>
                            <button className={styles.schemaCopyBtn} onClick={copyInputSchema}>
                              {copiedInput ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                            </button>
                          </div>
                          <div className={styles.schemaBox}>
                            <pre>{JSON.stringify(agent.inputSchema, null, 2)}</pre>
                          </div>
                        </div>
                      )}
                      {agent.outputSchema && (
                        <div className={styles.schemaCard}>
                          <div className={styles.schemaHeader}>
                            <span className={styles.schemaLabel}>Response</span>
                            <button className={styles.schemaCopyBtn} onClick={copyOutputSchema}>
                              {copiedOutput ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                            </button>
                          </div>
                          <div className={styles.schemaBox}>
                            <pre>{JSON.stringify(agent.outputSchema, null, 2)}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Reviews Tab */}
            {activeTab === 'reviews' && (
              <div className={styles.reviewsTab}>
                {reviewCount > 0 && (
                  <div className={styles.reviewsSummary}>
                    <div className={styles.reviewScore}>
                      <span className={styles.scoreBig}>{avgRating.toFixed(1)}</span>
                      <div className={styles.scoreStars}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            size={20}
                            fill={s <= Math.round(avgRating) ? '#fbbf24' : 'transparent'}
                            stroke={s <= Math.round(avgRating) ? '#fbbf24' : '#d1d5db'}
                          />
                        ))}
                      </div>
                      <span className={styles.scoreCount}>{reviewCount} reviews</span>
                    </div>
                    <div className={styles.reviewBars}>
                      {([5, 4, 3, 2, 1] as const).map((r) => {
                        const dist = agent.reviewStats?.distribution ?? { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
                        const pct = reviewCount === 0 ? 0 : Math.round((dist[r] / reviewCount) * 100);
                        return (
                          <div key={r} className={styles.reviewBar}>
                            <span className={styles.barLabel}>{r}</span>
                            <div className={styles.barTrack}>
                              <div className={styles.barFill} style={{ width: `${pct}%` }} />
                            </div>
                            <span className={styles.barPct}>{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <ReviewsList
                  ownerHandle={handle}
                  agentSlug={slug}
                  chainId={agent.erc8004ChainId}
                  blockExplorerUrl={
                    networks?.find((n) => n.chainId === agent.erc8004ChainId)?.blockExplorerUrl
                  }
                />

                <div className={styles.reviewCta}>
                  <p>Used this agent? Share your experience!</p>
                  <Button onClick={() => setIsPlaygroundOpen(true)} variant="outline">
                    Write a Review
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <PublicFooter />

      {/* Playground Panel */}
      {isPlaygroundOpen && (
        <>
          <div className={styles.overlay} onClick={() => setIsPlaygroundOpen(false)} />
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>API Playground</h2>
              <button onClick={() => setIsPlaygroundOpen(false)}><X size={20} /></button>
            </div>
            <div className={styles.panelBody}>
              <ApiPlayground
                ownerHandle={handle}
                agentSlug={slug}
                agentName={agent.name}
                pricePerCall={agent.pricePerCall}
                inputSchema={agent.inputSchema as Record<string, unknown> | null}
                outputSchema={agent.outputSchema as Record<string, unknown> | null}
                agentChainId={agent.erc8004ChainId}
                tokenId={agent.erc8004TokenId}
                onReviewSubmitted={handleReviewSubmitted}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
