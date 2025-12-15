'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Shield, ShieldCheck, Star, X, Zap, Clock, Activity, AlertCircle, Play, Check, Copy, ExternalLink, Code, FileText, MessageSquare, Share2, User } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui';
import { PublicHeader, PublicFooter } from '@/components/layout';
import { ApiPlayground } from '@/components/marketplace/ApiPlayground';
import { ReviewsList } from '@/components/marketplace/ReviewsList/ReviewsList';
import { formatUsdc, formatCompactNumber, shortenAddress } from '@/lib/utils/format';
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
  description: string | null;
  category: string;
  pricePerCall: number;
  totalCalls: number;
  tags: string[] | null;
  readme: string | null;
  ownerId: string;
  ownerHandle: string | null;
  ownerName: string | null;
  inputSchema: object | null;
  outputSchema: object | null;
  createdAt: string;
  publishedAt: string | null;
  erc8004TokenId: string | null;
  erc8004TxHash: string | null;
  erc8004ChainId: number | null;
  stats?: { uptime: number; avgResponseMs: number; errorRate: number; };
  reviewStats?: ReviewStats;
}

type CodeLang = 'js' | 'py' | 'curl';
type TabId = 'readme' | 'api' | 'reviews';

async function fetchMarketplaceAgent(id: string): Promise<MarketplaceAgentDetail> {
  const res = await fetch(`/api/marketplace/${id}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error('Agent not found');
    throw new Error('Failed to fetch agent');
  }
  return (await res.json()).agent;
}

export default function ApiDetailPage() {
  const params = useParams();
  const { data: networks } = useAllNetworks();
  const [activeTab, setActiveTab] = useState<TabId>('readme');
  const [codeLang, setCodeLang] = useState<CodeLang>('js');
  const [isPlaygroundOpen, setIsPlaygroundOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  const { data: agent, isLoading, error } = useQuery({
    queryKey: ['marketplace-agent', params.id],
    queryFn: () => fetchMarketplaceAgent(params.id as string),
    enabled: !!params.id,
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

  const copyCode = () => {
    if (!agent) return;
    navigator.clipboard.writeText(fullCodeExamples[codeLang]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyEndpoint = () => {
    if (!agent) return;
    navigator.clipboard.writeText(`https://api.agentokratia.com/call/${agent.id}`);
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 2000);
  };

  const copyShareUrl = () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    navigator.clipboard.writeText(url);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
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

  const endpoint = `https://api.agentokratia.com/call/${agent.id}`;
  const reviewCount = agent.reviewStats?.reviewCount ?? 0;
  const avgRating = agent.reviewStats?.avgRating ?? 0;

  const fullCodeExamples: Record<CodeLang, string> = {
    js: `import { withPaymentInterceptor } from "x402-axios";
import axios from "axios";

const api = withPaymentInterceptor(
  axios.create({ baseURL: "https://api.agentokratia.com" }),
  privateKeyToAccount(process.env.WALLET_KEY)
);

const { data } = await api.post("/call/${agent.id}", {
  // your parameters
});`,
    py: `from x402.clients.requests import x402_requests
from eth_account import Account

session = x402_requests(Account.from_key(WALLET_KEY))

response = session.post(
    "https://api.agentokratia.com/call/${agent.id}",
    json={"your": "params"}
)`,
    curl: `curl -X POST "https://api.agentokratia.com/call/${agent.id}" \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: <proof>" \\
  -d '{"your": "params"}'`
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
              href={agent.ownerHandle ? `/creator/${agent.ownerHandle}` : `/creator/${agent.ownerId}`}
              className={styles.authorLink}
            >
              <div className={styles.authorAvatar}>
                <User size={16} />
              </div>
              <span>{agent.ownerHandle ? `@${agent.ownerHandle}` : agent.ownerName || shortenAddress(agent.ownerId)}</span>
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
            {reviewCount > 0 ? (
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
                <div className={styles.trustIconInactive}>
                  <MessageSquare size={14} />
                </div>
                <div className={styles.trustContent}>
                  <span className={styles.trustTitleMuted}>No Reviews Yet</span>
                  <span className={styles.trustDesc}>Be the first to review</span>
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
                    <ReactMarkdown>{agent.readme}</ReactMarkdown>
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
                {/* Quick Start */}
                <div className={styles.quickStart}>
                  <h3>Quick Start</h3>
                  <div className={styles.installBox}>
                    <code>npm i x402-axios</code>
                    <span className={styles.or}>or</span>
                    <code>pip install x402</code>
                  </div>
                </div>

                {/* Endpoint */}
                <div className={styles.apiSection}>
                  <h3>Endpoint</h3>
                  <div className={styles.endpointBox}>
                    <span className={styles.method}>POST</span>
                    <code>{endpoint}</code>
                    <button onClick={copyEndpoint} className={styles.copyBtn}>
                      {copiedEndpoint ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                {/* Code Examples */}
                <div className={styles.apiSection}>
                  <h3>Example</h3>
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
                  </div>
                </div>

                {/* Schemas */}
                {agent.inputSchema && (
                  <div className={styles.apiSection}>
                    <h3>Input Schema</h3>
                    <div className={styles.schemaBox}>
                      <pre>{JSON.stringify(agent.inputSchema, null, 2)}</pre>
                    </div>
                  </div>
                )}

                {agent.outputSchema && (
                  <div className={styles.apiSection}>
                    <h3>Output Schema</h3>
                    <div className={styles.schemaBox}>
                      <pre>{JSON.stringify(agent.outputSchema, null, 2)}</pre>
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
                  agentId={agent.id}
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
                agentId={agent.id}
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
