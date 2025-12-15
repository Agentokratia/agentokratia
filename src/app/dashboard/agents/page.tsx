'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Box, Loader2, TrendingUp, DollarSign, Zap } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import { useAuthStore } from '@/lib/store/authStore';
import { formatUsdc, formatCurrency } from '@/lib/utils/format';
import styles from './page.module.css';

interface Agent {
  id: string;
  name: string;
  description: string | null;
  category: string;
  endpointUrl: string;
  pricePerCall: number;
  status: 'draft' | 'pending' | 'live' | 'paused' | 'rejected';
  totalCalls: number;
  totalEarned: number;
  tags: string[] | null;
  iconUrl: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  live: 'success',
  draft: 'warning',
  pending: 'default',
  paused: 'warning',
  rejected: 'error',
};

const categoryLabels: Record<string, string> = {
  ai: 'AI / ML',
  data: 'Data',
  content: 'Content',
  tools: 'Dev Tools',
  other: 'Other',
};

async function fetchAgents(token: string): Promise<Agent[]> {
  const res = await fetch('/api/agents', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch agents');
  const data = await res.json();
  return data.agents;
}

export default function AgentsPage() {
  const { token } = useAuthStore();

  const { data: agents = [], isLoading, error } = useQuery({
    queryKey: ['agents', token],
    queryFn: () => fetchAgents(token!),
    enabled: !!token,
    staleTime: 30_000, // Consider data fresh for 30 seconds
  });

  // Calculate totals
  const totalCalls = agents.reduce((sum, a) => sum + a.totalCalls, 0);
  const totalEarned = agents.reduce((sum, a) => sum + a.totalEarned, 0);
  const liveAgents = agents.filter((a) => a.status === 'live').length;

  if (isLoading) {
    return (
      <div className={styles.page}>
        <PageHeader title="My Agents" />
        <div className={styles.loadingState}>
          <Loader2 size={32} className={styles.spinner} />
          <p>Loading agents...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <PageHeader title="My Agents" />
        <div className={styles.errorState}>
          <p className={styles.errorText}>{error instanceof Error ? error.message : 'Failed to fetch agents'}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className={styles.page}>
        <PageHeader title="My Agents" />

        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Box size={32} />
          </div>
          <h3 className={styles.emptyTitle}>No agents yet</h3>
          <p className={styles.emptyDesc}>
            Create your first agent to start earning from API calls.
          </p>
          <Link href="/dashboard/agents/new">
            <Button>
              <Plus size={16} />
              Create Your First Agent
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="My Agents"
        subtitle="Manage and monitor your registered API agents"
        actions={
          <Link href="/dashboard/agents/new">
            <Button>
              <Plus size={16} />
              New Agent
            </Button>
          </Link>
        }
      />

      {/* Summary Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <Zap size={20} />
          </div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{totalCalls.toLocaleString()}</div>
            <div className={styles.statLabel}>Total API Calls</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <DollarSign size={20} />
          </div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{formatCurrency(totalEarned)}</div>
            <div className={styles.statLabel}>Total Earned</div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <TrendingUp size={20} />
          </div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>
              {liveAgents} / {agents.length}
            </div>
            <div className={styles.statLabel}>Live Agents</div>
          </div>
        </div>
      </div>

      {/* Agents Grid */}
      <div className={styles.agentsGrid}>
        {agents.map((agent) => (
          <Link
            key={agent.id}
            href={`/dashboard/agents/${agent.id}`}
            className={styles.agentCard}
          >
            <div className={styles.agentCardHeader}>
              <div className={styles.agentIcon}>
                {agent.name.charAt(0).toUpperCase()}
              </div>
              <Badge variant={statusVariant[agent.status] || 'default'}>
                {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
              </Badge>
            </div>

            <h3 className={styles.agentName}>{agent.name}</h3>
            <p className={styles.agentDesc}>
              {agent.description || 'No description'}
            </p>

            <div className={styles.agentMeta}>
              <span className={styles.agentCategory}>
                {categoryLabels[agent.category] || agent.category}
              </span>
              <span className={styles.agentPrice}>
                {formatUsdc(agent.pricePerCall)}/call
              </span>
            </div>

            <div className={styles.agentStats}>
              <div className={styles.agentStatItem}>
                <span className={styles.agentStatValue}>
                  {agent.totalCalls.toLocaleString()}
                </span>
                <span className={styles.agentStatLabel}>calls</span>
              </div>
              <div className={styles.agentStatItem}>
                <span className={styles.agentStatValue}>
                  {formatCurrency(agent.totalEarned)}
                </span>
                <span className={styles.agentStatLabel}>earned</span>
              </div>
            </div>
          </Link>
        ))}

        {/* Add New Agent Card */}
        <Link href="/dashboard/agents/new" className={styles.addAgentCard}>
          <Plus size={24} />
          <span>Add New Agent</span>
        </Link>
      </div>
    </div>
  );
}
