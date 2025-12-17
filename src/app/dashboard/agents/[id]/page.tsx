'use client';

import { useState, useEffect, use } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  ArrowLeft,
  ExternalLink,
  Check,
  Copy,
  User,
  Link2,
  FileText,
  DollarSign,
  Star,
  Zap,
  Shield,
  ShieldCheck,
  MessageSquare,
  ArrowRight,
} from 'lucide-react';
import { useAccount } from 'wagmi';
import { Button, Badge } from '@/components/ui';
import { PublishModal } from '@/components/agents/PublishModal';
import { EnableReviewsModal } from '@/components/agents/EnableReviewsModal';
import { useAuthStore } from '@/lib/store/authStore';
import { useReviewsEnabled } from '@/lib/erc8004/hooks';
import ProfileTab from './tabs/ProfileTab';
import ConnectionTab from './tabs/ConnectionTab';
import PricingTab from './tabs/PricingTab';
import ReadmeTab from './tabs/ReadmeTab';
import SecurityTab from './tabs/SecurityTab';
import ReviewsTab from './tabs/ReviewsTab';
import { useAllNetworks, getExplorerUrlForChain } from '@/lib/network/client';
import { formatCurrency } from '@/lib/utils/format';
import { usePendingTransactionRetryByType } from '@/hooks';
import styles from './page.module.css';

export interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  endpointUrl: string;
  timeoutMs: number;
  pricePerCall: number;
  status: 'draft' | 'pending' | 'live' | 'paused' | 'rejected';
  totalCalls: number;
  totalEarned: number;
  tags: string[] | null;
  iconUrl: string | null;
  inputSchema: object | null;
  outputSchema: object | null;
  readme: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  // ERC-8004 on-chain identity
  erc8004TokenId: string | null;
  erc8004TxHash: string | null;
  erc8004ChainId: number | null;
  // Reviews/Feedback - check on-chain via isApprovedForAll
  feedbackSignerAddress: string | null;
  // Owner handle for URL construction
  ownerHandle: string | null;
}

interface SecretKeyInfo {
  hasKey: boolean;
  secret: string | null;
  createdAt: string | null;
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'default' }> = {
  live: { label: 'Live', variant: 'success' },
  draft: { label: 'Draft', variant: 'warning' },
  pending: { label: 'Pending', variant: 'default' },
  paused: { label: 'Paused', variant: 'warning' },
  rejected: { label: 'Rejected', variant: 'error' },
};

type Tab = 'profile' | 'connection' | 'pricing' | 'readme' | 'security' | 'reviews';

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'connection', label: 'Connection', icon: Link2 },
  { id: 'pricing', label: 'Pricing', icon: DollarSign },
  { id: 'readme', label: 'README', icon: FileText },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'reviews', label: 'Reviews', icon: Star },
];

// Fetch functions
async function fetchAgent(id: string, token: string): Promise<Agent> {
  const res = await fetch(`/api/agents/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Agent not found');
  const data = await res.json();
  return data.agent;
}

async function fetchSecretKey(id: string, token: string): Promise<SecretKeyInfo> {
  const res = await fetch(`/api/agents/${id}/secret`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch secret key');
  return res.json();
}

async function updateAgentApi(id: string, token: string, updates: Record<string, unknown>): Promise<Agent> {
  const res = await fetch(`/api/agents/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to update agent');
  }
  const data = await res.json();
  return data.agent;
}

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const { token } = useAuthStore();
  const { address } = useAccount();
  const { data: networks } = useAllNetworks();
  const queryClient = useQueryClient();

  const [toast, setToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showEnableReviewsModal, setShowEnableReviewsModal] = useState(false);

  // Fetch agent data
  const { data: agent, isLoading, error, refetch: refetchAgent } = useQuery({
    queryKey: ['agent', id, token],
    queryFn: () => fetchAgent(id, token!),
    enabled: !!token,
    staleTime: 30_000,
  });

  // Fetch secret key (only when agent is loaded)
  const { data: secretKey } = useQuery({
    queryKey: ['agent-secret', id, token],
    queryFn: () => fetchSecretKey(id, token!),
    enabled: !!token && !!agent,
    staleTime: 60_000,
  });

  // Update agent mutation
  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) => updateAgentApi(id, token!, updates),
    onSuccess: (updatedAgent) => {
      queryClient.setQueryData(['agent', id, token], updatedAgent);
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      showToast('Saved successfully');
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : 'Failed to save');
    },
  });

  // Auto-retry pending transaction confirmations on page load
  usePendingTransactionRetryByType('publish', () => {
    setToast('Published successfully!');
    refetchAgent();
  });

  usePendingTransactionRetryByType('enable_reviews', () => {
    setToast('Reviews enabled!');
    refetchAgent();
  });

  // Check on-chain if reviews are enabled (via isApprovedForAll)
  const { reviewsEnabled, isLoading: isCheckingReviews, refetch: refetchReviews } = useReviewsEnabled(
    address,
    agent?.feedbackSignerAddress,
    agent?.erc8004ChainId
  );

  useEffect(() => {
    const tab = searchParams.get('tab') as Tab | null;
    if (tab && tabs.some(t => t.id === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const updateAgent = async (updates: Record<string, unknown>): Promise<boolean> => {
    if (!token || !agent) return false;
    try {
      await updateMutation.mutateAsync(updates);
      return true;
    } catch {
      return false;
    }
  };

  const handlePublish = () => {
    setShowPublishModal(true);
  };

  const handlePublished = (tokenId: string, txHash: string, chainId: number) => {
    // Update cache with the new on-chain data
    queryClient.setQueryData(['agent', id, token], (prev: Agent | undefined) => prev ? {
      ...prev,
      status: 'live',
      publishedAt: new Date().toISOString(),
      erc8004TokenId: tokenId,
      erc8004TxHash: txHash,
      erc8004ChainId: chainId,
    } : undefined);
    queryClient.invalidateQueries({ queryKey: ['agents'] });
    showToast('Agent published successfully!');
  };

  const handleUnpublish = () => updateAgent({ status: 'paused' });

  const handleRepublish = async () => {
    const success = await updateAgent({ status: 'live' });
    if (success) {
      showToast('Agent is live again!');
    }
  };

  const saving = updateMutation.isPending;

  const copyAgentUrl = async () => {
    if (agent?.ownerHandle && agent?.slug) {
      await navigator.clipboard.writeText(`${window.location.origin}/api/v1/call/${agent.ownerHandle}/${agent.slug}`);
      showToast('URL copied!');
    }
  };

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  const getTabStatus = (tab: Tab): 'done' | 'needs-setup' | 'highlight' | '' => {
    if (!agent) return '';
    switch (tab) {
      case 'profile':
        return agent.name ? 'done' : 'needs-setup';
      case 'connection':
        return agent.endpointUrl && agent.endpointUrl !== 'https://placeholder.example.com' ? 'done' : 'needs-setup';
      case 'pricing':
        return 'done';
      case 'readme':
        return agent.readme ? 'done' : 'needs-setup';
      case 'security':
        return secretKey?.hasKey ? 'done' : 'needs-setup';
      case 'reviews':
        // Show highlight indicator when published but reviews not enabled
        if (agent.status === 'live' && agent.erc8004TokenId && !reviewsEnabled && !isCheckingReviews) {
          return 'highlight';
        }
        return reviewsEnabled ? 'done' : '';
      default:
        return '';
    }
  };

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <Loader2 size={32} className={styles.spinner} />
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>
          <p>{error instanceof Error ? error.message : 'Agent not found'}</p>
          <Link href="/dashboard/agents">
            <Button>Back to Agents</Button>
          </Link>
        </div>
      </div>
    );
  }

  const statusInfo = statusConfig[agent.status] || statusConfig.draft;

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <Link href="/dashboard/agents" className={styles.backLink}>
              <ArrowLeft size={20} />
            </Link>
            <div className={styles.headerInfo}>
              <div className={styles.headerTop}>
                <h1 className={styles.agentTitle}>{agent.name}</h1>
                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              </div>
              {agent.description && <p className={styles.agentDesc}>{agent.description}</p>}
            </div>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.previewLink} onClick={() => agent?.ownerHandle && agent?.slug && window.open(`/${agent.ownerHandle}/${agent.slug}`, '_blank')}>
              <ExternalLink size={16} />
              Preview
            </button>
            {agent.status === 'live' ? (
              <Button variant="outline" onClick={handleUnpublish} loading={saving}>
                Unpublish
              </Button>
            ) : agent.erc8004TokenId ? (
              // Agent already has on-chain identity, just update status
              <Button onClick={handleRepublish} loading={saving}>
                Go Live
              </Button>
            ) : (
              // First-time publish, need to mint NFT
              <Button onClick={handlePublish} loading={saving}>
                Go Live
              </Button>
            )}
          </div>
        </div>

        {/* Stats for live agents */}
        {agent.status === 'live' && (
          <div className={styles.statsBar}>
            {agent.erc8004TokenId && (
              <a
                href={getExplorerUrlForChain(networks, agent.erc8004ChainId, agent.erc8004TxHash) || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.stat}
                style={{ textDecoration: 'none', cursor: agent.erc8004TxHash ? 'pointer' : 'default' }}
              >
                <Check size={16} style={{ color: 'var(--green-500)' }} />
                <span className={styles.statValue}>#{agent.erc8004TokenId}</span>
                <span className={styles.statLabel}>on-chain</span>
              </a>
            )}
            <div className={styles.stat}>
              <Zap size={16} />
              <span className={styles.statValue}>{agent.totalCalls.toLocaleString()}</span>
              <span className={styles.statLabel}>calls</span>
            </div>
            <div className={styles.stat}>
              <DollarSign size={16} />
              <span className={styles.statValue}>{formatCurrency(agent.totalEarned)}</span>
              <span className={styles.statLabel}>earned</span>
            </div>
            <button className={styles.copyUrlBtn} onClick={copyAgentUrl}>
              <Copy size={14} />
              Copy API URL
            </button>
          </div>
        )}

        {/* Trust Signals - show benefits of on-chain verification and reviews */}
        {agent.status === 'live' && agent.erc8004TokenId && (
          <div className={styles.trustSignals}>
            <div className={`${styles.trustSignal} ${styles.trustSignalActive}`}>
              <ShieldCheck size={16} />
              <div className={styles.trustSignalContent}>
                <span className={styles.trustSignalTitle}>On-chain Verified</span>
                <span className={styles.trustSignalDesc}>Ownership & payments secured by blockchain</span>
              </div>
            </div>
            <div className={`${styles.trustSignal} ${reviewsEnabled ? styles.trustSignalActive : styles.trustSignalInactive}`}>
              <MessageSquare size={16} />
              <div className={styles.trustSignalContent}>
                <span className={styles.trustSignalTitle}>
                  {reviewsEnabled ? 'Reviews Enabled' : 'Reviews Not Enabled'}
                </span>
                <span className={styles.trustSignalDesc}>
                  {reviewsEnabled
                    ? 'Users can leave verified feedback'
                    : 'Enable to build trust with users'}
                </span>
              </div>
              {!reviewsEnabled && !isCheckingReviews && (
                <button
                  className={styles.trustSignalBtn}
                  onClick={() => {
                    setActiveTab('reviews');
                    setShowEnableReviewsModal(true);
                  }}
                >
                  Enable
                </button>
              )}
            </div>
          </div>
        )}

      </header>

      {/* Tabs */}
      <div className={styles.tabsContainer}>
        <nav className={styles.tabs}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const status = getTabStatus(tab.id);
            return (
              <button
                key={tab.id}
                className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''} ${status === 'highlight' ? styles.highlight : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
                {status === 'needs-setup' && <span className={styles.tabDot} />}
                {status === 'highlight' && <span className={styles.tabHighlight}>Enable</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <main className={styles.content}>
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <ProfileTab agent={agent} onSave={updateAgent} saving={saving} />
        )}

        {/* Connection Tab */}
        {activeTab === 'connection' && (
          <ConnectionTab agent={agent} onSave={updateAgent} saving={saving} secretKey={secretKey?.secret ?? null} />
        )}

        {/* Pricing Tab */}
        {activeTab === 'pricing' && (
          <PricingTab agent={agent} onSave={updateAgent} saving={saving} />
        )}

        {/* README Tab */}
        {activeTab === 'readme' && (
          <ReadmeTab agent={agent} onSave={updateAgent} saving={saving} />
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <SecurityTab agent={agent} onToast={showToast} />
        )}

        {/* Reviews Tab */}
        {activeTab === 'reviews' && (
          <ReviewsTab
            agent={agent}
            blockExplorerUrl={networks?.find(n => n.chainId === agent.erc8004ChainId)?.blockExplorerUrl}
            reviewsEnabled={reviewsEnabled}
            isCheckingReviews={isCheckingReviews}
            onEnableReviews={() => setShowEnableReviewsModal(true)}
          />
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${styles.show}`}>
          <Check size={16} />
          {toast}
        </div>
      )}

      {/* Publish Modal */}
      <PublishModal
        open={showPublishModal}
        onOpenChange={setShowPublishModal}
        agent={{
          id: agent.id,
          name: agent.name,
          slug: agent.slug,
          description: agent.description,
          endpointUrl: agent.endpointUrl,
          pricePerCall: agent.pricePerCall,
          status: agent.status,
          ownerHandle: agent.ownerHandle,
        }}
        hasSigningKey={secretKey?.hasKey || false}
        onPublished={handlePublished}
        onEnableReviews={() => {
          // Navigate to reviews tab and open enable modal
          setActiveTab('reviews');
          setShowEnableReviewsModal(true);
        }}
      />

      {/* Enable Reviews Modal - available when agent is published */}
      {agent.erc8004TokenId && agent.erc8004ChainId && (
        <EnableReviewsModal
          open={showEnableReviewsModal}
          onOpenChange={setShowEnableReviewsModal}
          agentId={agent.id}
          agentName={agent.name}
          feedbackSignerAddress={agent.feedbackSignerAddress}
          chainId={agent.erc8004ChainId}
          onSuccess={async () => {
            // Refetch agent to get updated feedbackSignerAddress
            await refetchAgent();
            // Close modal first, then refetch reviews status after short delay
            setShowEnableReviewsModal(false);
            showToast('Reviews enabled!');
            // Refetch on-chain status after state updates
            setTimeout(() => {
              refetchReviews();
            }, 500);
          }}
        />
      )}
    </div>
  );
}
