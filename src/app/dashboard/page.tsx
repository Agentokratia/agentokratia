'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Box, Search, Check, Loader2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import { useAuthStore } from '@/lib/store/authStore';
import { formatCurrency, formatUsdc, formatRelativeTime, shortenAddress } from '@/lib/utils/format';
import styles from './page.module.css';

interface Agent {
  id: string;
  name: string;
  status: string;
  totalCalls: number;
  totalEarned: number;
}

interface PaymentRecord {
  id: string;
  agentId: string;
  agentName: string;
  callerAddress: string;
  amountCents: number;
  status: string;
  createdAt: string;
}

async function fetchAgents(token: string): Promise<Agent[]> {
  const res = await fetch('/api/agents', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch agents');
  const data = await res.json();
  return data.agents || [];
}

async function fetchRecentPayments(token: string): Promise<PaymentRecord[]> {
  const res = await fetch('/api/payments?limit=5', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.payments || [];
}


export default function DashboardPage() {
  const [showGuide, setShowGuide] = useState(true);
  const { token } = useAuthStore();

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['dashboard-agents', token],
    queryFn: () => fetchAgents(token!),
    enabled: !!token,
    staleTime: 30_000,
  });

  const { data: recentPayments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['dashboard-payments', token],
    queryFn: () => fetchRecentPayments(token!),
    enabled: !!token,
    staleTime: 30_000,
  });

  // Calculate real stats
  const liveAgents = agents.filter(a => a.status === 'live').length;
  const totalEarned = agents.reduce((sum, a) => sum + a.totalEarned, 0);
  const totalCalls = agents.reduce((sum, a) => sum + a.totalCalls, 0);

  // Check if user has completed onboarding steps
  const hasAgents = agents.length > 0;
  const hasLiveAgent = liveAgents > 0;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back"
        actions={
          <Link href="/dashboard/agents/new">
            <Button>
              <Plus size={16} />
              New Agent
            </Button>
          </Link>
        }
      />

      {/* Getting Started Guide - only show if user hasn't completed steps */}
      {showGuide && !hasLiveAgent && (
        <div className={styles.gettingStarted}>
          <div className={styles.gettingStartedHeader}>
            <div>
              <h2 className={styles.gettingStartedTitle}>Get started in 3 steps</h2>
              <p className={styles.gettingStartedSubtitle}>Set up your first agent and start earning</p>
            </div>
            <button
              className={styles.dismissBtn}
              onClick={() => setShowGuide(false)}
            >
              Dismiss
            </button>
          </div>
          <div className={styles.gettingStartedSteps}>
            <div className={`${styles.stepCard} ${styles.completed}`}>
              <div className={styles.stepNumber}>
                <Check size={12} />
              </div>
              <div className={styles.stepTitle}>Connect Wallet</div>
              <div className={styles.stepDesc}>Done! Your wallet is connected</div>
            </div>
            <div className={`${styles.stepCard} ${hasAgents ? styles.completed : ''}`}>
              <div className={styles.stepNumber}>
                {hasAgents ? <Check size={12} /> : '2'}
              </div>
              <div className={styles.stepTitle}>Create an Agent</div>
              <div className={styles.stepDesc}>
                {hasAgents ? 'Done! Agent created' : 'Register your API endpoint'}
              </div>
            </div>
            <div className={`${styles.stepCard} ${hasLiveAgent ? styles.completed : ''}`}>
              <div className={styles.stepNumber}>
                {hasLiveAgent ? <Check size={12} /> : '3'}
              </div>
              <div className={styles.stepTitle}>Verify & Go Live</div>
              <div className={styles.stepDesc}>
                {hasLiveAgent ? 'Done! Agent is live' : 'Get your on-chain identity'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Live Agents</div>
          <div className={styles.statValue}>
            {agentsLoading ? <Loader2 size={16} className={styles.spinner} /> : liveAgents}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Earned</div>
          <div className={`${styles.statValue} ${styles.success}`}>
            {agentsLoading ? <Loader2 size={16} className={styles.spinner} /> : formatCurrency(totalEarned)}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Calls</div>
          <div className={styles.statValue}>
            {agentsLoading ? <Loader2 size={16} className={styles.spinner} /> : totalCalls.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Quick Actions</h2>
      </div>
      <div className={styles.quickActions}>
        <Link href="/dashboard/agents/new" className={styles.actionCard}>
          <div className={styles.actionIcon}>
            <Plus size={20} />
          </div>
          <div className={styles.actionTitle}>Create Agent</div>
          <div className={styles.actionDesc}>Register a new API</div>
        </Link>
        <Link href="/dashboard/agents" className={styles.actionCard}>
          <div className={styles.actionIcon}>
            <Box size={20} />
          </div>
          <div className={styles.actionTitle}>My Agents</div>
          <div className={styles.actionDesc}>Manage your agents</div>
        </Link>
        <Link href="/marketplace" className={styles.actionCard}>
          <div className={styles.actionIcon}>
            <Search size={20} />
          </div>
          <div className={styles.actionTitle}>Marketplace</div>
          <div className={styles.actionDesc}>Browse other agents</div>
        </Link>
      </div>

      {/* Recent Activity */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Recent Activity</h2>
        <Link href="/dashboard/payments">
          <Button variant="secondary" size="sm">View All</Button>
        </Link>
      </div>
      <div className={styles.activityCard}>
        {paymentsLoading ? (
          <div className={styles.activityLoading}>
            <Loader2 size={20} className={styles.spinner} />
            <span>Loading activity...</span>
          </div>
        ) : recentPayments.length === 0 ? (
          <div className={styles.activityEmpty}>
            <TrendingUp size={24} />
            <span>No activity yet. Publish an agent to start receiving payments!</span>
          </div>
        ) : (
          recentPayments.map((payment) => (
            <div key={payment.id} className={styles.activityItem}>
              <div className={styles.activityIcon}>
                <Check size={16} />
              </div>
              <div className={styles.activityInfo}>
                <div className={styles.activityTitle}>{payment.agentName}</div>
                <div className={styles.activityMeta}>
                  Payment from {shortenAddress(payment.callerAddress)}
                </div>
              </div>
              <div>
                <div className={styles.activityAmount}>+{formatUsdc(payment.amountCents)}</div>
                <div className={styles.activityTime}>{formatRelativeTime(payment.createdAt)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
