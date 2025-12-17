'use client';

import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuthStore } from '@/lib/store/authStore';
import { FeedbackWidget } from '@/components/ui';
import styles from './layout.module.css';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { address, isConnected, status } = useAccount();
  const router = useRouter();
  const { token, walletAddress, clearAuth } = useAuthStore();
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const hasRedirected = useRef(false);
  const lastStatus = useRef(status);

  // Check if authenticated (has token and wallet matches)
  const isAuthenticated = token && walletAddress && walletAddress.toLowerCase() === address?.toLowerCase();

  // Track status for the timeout check
  useEffect(() => {
    lastStatus.current = status;
  }, [status]);

  // Wait for wagmi to finish reconnecting
  const [isWaitingForReconnect, setIsWaitingForReconnect] = useState(true);

  useEffect(() => {
    // If reconnecting, wait for it to finish
    if (status === 'reconnecting') {
      return;
    }

    // If connected, we're done waiting
    if (status === 'connected') {
      setIsWaitingForReconnect(false);
      return;
    }

    // If disconnected, give wagmi 100ms to start reconnecting
    // (wagmi briefly shows 'disconnected' before 'reconnecting' on page load)
    if (status === 'disconnected') {
      const timer = setTimeout(() => {
        if (lastStatus.current === 'disconnected') {
          setIsWaitingForReconnect(false);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [status]);

  // Auth check only after wagmi has settled
  useEffect(() => {
    if (isWaitingForReconnect) return;
    if (hasRedirected.current) return;

    if (!isConnected || !isAuthenticated) {
      hasRedirected.current = true;
      clearAuth();
      router.push('/');
      return;
    }

    setHasCheckedAuth(true);
  }, [isWaitingForReconnect, isConnected, isAuthenticated, router, clearAuth]);

  // Handle disconnect after successful auth
  useEffect(() => {
    if (hasCheckedAuth && status === 'disconnected' && !hasRedirected.current) {
      hasRedirected.current = true;
      clearAuth();
      router.push('/');
    }
  }, [hasCheckedAuth, status, clearAuth, router]);

  // Show loading while wagmi is reconnecting
  if (isWaitingForReconnect) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingSpinner} />
        <p>Loading...</p>
      </div>
    );
  }

  // Show loading while checking auth or redirecting
  if (!hasCheckedAuth) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingSpinner} />
        <p>Verifying...</p>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.content}>{children}</div>
      <FeedbackWidget />
    </div>
  );
}
