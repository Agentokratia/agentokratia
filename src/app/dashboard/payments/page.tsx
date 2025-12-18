'use client';

import { Loader2, TrendingUp, ExternalLink, CheckCircle, Clock, XCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout';
import { useAuthStore } from '@/lib/store/authStore';
import { useAllNetworks, getExplorerTxUrl } from '@/lib/network/client';
import { formatUsdc, formatCurrency, shortenAddress } from '@/lib/utils/format';
import styles from './page.module.css';

interface AgentEarnings {
  id: string;
  name: string;
  totalCalls: number;
  totalEarned: number;
  pricePerCall: number;
}

interface PaymentRecord {
  id: string;
  agentId: string;
  agentName: string;
  callerAddress: string;
  amountCents: number;
  txHash: string | null;
  network: string;
  status: 'verified' | 'settled' | 'failed';
  requestId: string;
  createdAt: string;
}

async function fetchAgentEarnings(token: string): Promise<AgentEarnings[]> {
  const res = await fetch('/api/agents', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch earnings');
  const data = await res.json();
  return (data.agents || []).map((agent: AgentEarnings) => ({
    id: agent.id,
    name: agent.name,
    totalCalls: agent.totalCalls,
    totalEarned: agent.totalEarned,
    pricePerCall: agent.pricePerCall,
  }));
}

async function fetchPaymentHistory(token: string): Promise<PaymentRecord[]> {
  const res = await fetch('/api/payments', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch payment history');
  const data = await res.json();
  return data.payments || [];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getNetworkExplorerUrl(
  network: string,
  networks: { chainId: number; network: string; blockExplorerUrl: string }[] | undefined
): string | null {
  if (!networks) return null;
  const net = networks.find((n) => n.network === network);
  return net?.blockExplorerUrl || null;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'settled':
      return <CheckCircle size={12} />;
    case 'verified':
      return <Clock size={12} />;
    case 'failed':
      return <XCircle size={12} />;
    default:
      return null;
  }
}

export default function PaymentsPage() {
  const { token } = useAuthStore();
  const { data: networks } = useAllNetworks();

  const {
    data: agents = [],
    isLoading: agentsLoading,
    error: agentsError,
  } = useQuery({
    queryKey: ['agent-earnings', token],
    queryFn: () => fetchAgentEarnings(token!),
    enabled: !!token,
    staleTime: 30_000,
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['payment-history', token],
    queryFn: () => fetchPaymentHistory(token!),
    enabled: !!token,
    staleTime: 30_000,
  });

  const totalEarned = agents.reduce((sum, agent) => sum + agent.totalEarned, 0);
  const totalCalls = agents.reduce((sum, agent) => sum + agent.totalCalls, 0);
  const settledPayments = payments.filter((p) => p.status === 'settled').length;

  if (agentsLoading) {
    return (
      <div className={styles.page}>
        <PageHeader title="Payments" />
        <div className={styles.loadingState}>
          <Loader2 size={32} className={styles.spinner} />
          <p>Loading earnings...</p>
        </div>
      </div>
    );
  }

  if (agentsError) {
    return (
      <div className={styles.page}>
        <PageHeader title="Payments" />
        <div className={styles.emptyState}>
          <p>{agentsError instanceof Error ? agentsError.message : 'Failed to load earnings'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Payments" />

      {/* Summary Row */}
      <div className={styles.summaryRow}>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>Total Earned</div>
          <div className={`${styles.summaryValue} ${styles.success}`}>
            {formatCurrency(totalEarned)}
          </div>
          <div className={styles.summaryChange}>All time</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>Total Calls</div>
          <div className={styles.summaryValue}>{totalCalls.toLocaleString()}</div>
          <div className={styles.summaryChange}>Across all agents</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>Settled Payments</div>
          <div className={styles.summaryValue}>{settledPayments}</div>
          <div className={styles.summaryChange}>On-chain confirmed</div>
        </div>
      </div>

      {/* Agent Earnings */}
      <div className={styles.transactionsCard}>
        <h3 className={styles.sectionTitle}>Earnings by Agent</h3>
        {agents.length === 0 ? (
          <div className={styles.emptyState}>
            <TrendingUp size={48} />
            <p>No earnings yet. Publish an agent to start earning!</p>
          </div>
        ) : (
          agents.map((agent) => (
            <div key={agent.id} className={styles.transactionRow}>
              <div className={styles.transactionInfo}>
                <div className={styles.transactionTitle}>{agent.name}</div>
                <div className={styles.transactionMeta}>
                  <span>{agent.totalCalls.toLocaleString()} calls</span>
                  <span> • </span>
                  <span>{formatUsdc(agent.pricePerCall)}/call</span>
                </div>
              </div>
              <div>
                <div className={styles.transactionAmount}>{formatCurrency(agent.totalEarned)}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Payment History */}
      <div className={styles.transactionsCard} style={{ marginTop: 'var(--space-lg)' }}>
        <h3 className={styles.sectionTitle}>Transaction History</h3>
        {paymentsLoading ? (
          <div className={styles.loadingState}>
            <Loader2 size={24} className={styles.spinner} />
            <p>Loading transactions...</p>
          </div>
        ) : payments.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No transactions yet</p>
          </div>
        ) : (
          <table className={styles.historyTable}>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Caller</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Transaction</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => {
                const explorerUrl = getNetworkExplorerUrl(payment.network, networks);
                const txUrl =
                  explorerUrl && payment.txHash
                    ? getExplorerTxUrl(explorerUrl, payment.txHash)
                    : null;

                return (
                  <tr key={payment.id}>
                    <td>{payment.agentName}</td>
                    <td>
                      <span className={styles.callerAddress} title={payment.callerAddress}>
                        {shortenAddress(payment.callerAddress)}
                      </span>
                    </td>
                    <td>{formatUsdc(payment.amountCents)}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[payment.status]}`}>
                        <StatusIcon status={payment.status} />
                        {payment.status}
                      </span>
                    </td>
                    <td>
                      {txUrl ? (
                        <a
                          href={txUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.txLink}
                        >
                          {shortenAddress(payment.txHash!)}
                          <ExternalLink size={10} style={{ marginLeft: 4 }} />
                        </a>
                      ) : (
                        <span className={styles.noTx}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={styles.timestamp}>{formatDate(payment.createdAt)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
