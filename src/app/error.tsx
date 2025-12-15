'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Home, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';
import styles from './error.module.css';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error to console in development
    console.error('Application error:', error);

    // TODO: Send to error tracking service (Sentry, etc.)
  }, [error]);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Icon */}
        <div className={styles.icon}>
          <AlertTriangle size={48} />
        </div>

        {/* Message */}
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.description}>
          We encountered an unexpected error. Don&apos;t worry, our team has been notified.
        </p>

        {/* Error details (development only) */}
        {process.env.NODE_ENV === 'development' && (
          <details className={styles.errorDetails}>
            <summary>Error details</summary>
            <pre>{error.message}</pre>
            {error.digest && <p>Digest: {error.digest}</p>}
          </details>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          <Button size="lg" onClick={reset}>
            <RefreshCw size={18} />
            Try Again
          </Button>
          <Link href="/">
            <Button variant="outline" size="lg">
              <Home size={18} />
              Go Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
