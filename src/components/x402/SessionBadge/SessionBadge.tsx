'use client';

import { useMemo } from 'react';
import { Wallet, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { StoredSession } from '@agentokratia/x402-escrow/client';
import styles from './SessionBadge.module.css';

interface SessionBadgeProps {
  session: StoredSession | null;
  pricePerCall: number; // In cents (e.g., 5 = $0.05)
  onManage?: () => void;
  className?: string;
}

export function SessionBadge({ session, pricePerCall, onManage, className }: SessionBadgeProps) {
  if (!session) return null;

  const { balance, authorizationExpiry } = session;

  // Calculate remaining calls
  const balanceUsdc = useMemo(() => Number(balance) / 1_000_000, [balance]);
  const priceUsdc = pricePerCall / 100;
  const remainingCalls = useMemo(
    () => Math.floor(balanceUsdc / priceUsdc),
    [balanceUsdc, priceUsdc]
  );

  // Calculate time remaining
  const timeInfo = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const secondsRemaining = authorizationExpiry - now;
    const minutesRemaining = Math.max(0, Math.floor(secondsRemaining / 60));

    if (minutesRemaining >= 60) {
      const hours = Math.floor(minutesRemaining / 60);
      const mins = minutesRemaining % 60;
      return { text: `${hours}h ${mins}m`, isExpiringSoon: false };
    }

    return {
      text: `${minutesRemaining}m`,
      isExpiringSoon: minutesRemaining < 10,
    };
  }, [authorizationExpiry]);

  const isLowBalance = remainingCalls < 10;

  return (
    <div className={cn(styles.badge, className)}>
      <div className={styles.icon}>
        <Wallet size={16} />
      </div>
      <div className={styles.content}>
        <div className={styles.title}>Active Session</div>
        <div className={styles.details}>
          <span className={cn(styles.balance, isLowBalance && styles.warning)}>
            ${balanceUsdc.toFixed(2)} ({remainingCalls} calls)
          </span>
          <span className={styles.separator}>·</span>
          <span className={cn(styles.time, timeInfo.isExpiringSoon && styles.warning)}>
            <Clock size={12} />
            {timeInfo.text}
          </span>
        </div>
      </div>
      {(isLowBalance || timeInfo.isExpiringSoon) && (
        <div className={styles.warningIcon}>
          <AlertTriangle size={14} />
        </div>
      )}
      {onManage && (
        <button className={styles.manageButton} onClick={onManage}>
          Manage
        </button>
      )}
    </div>
  );
}
