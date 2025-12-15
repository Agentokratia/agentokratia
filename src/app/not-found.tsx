'use client';

import Link from 'next/link';
import { Home, Search, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Logo */}
        <div className={styles.logo}>
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M24 6L9 42H17L19 36H29L31 42H39L24 6Z" fill="currentColor"/>
            <path d="M24 16L21 28H27L24 16Z" fill="var(--paper)"/>
            <circle cx="13" cy="10" r="2" fill="currentColor"/>
            <circle cx="24" cy="5" r="2" fill="currentColor"/>
            <circle cx="35" cy="10" r="2" fill="currentColor"/>
          </svg>
        </div>

        {/* Error Code */}
        <h1 className={styles.errorCode}>404</h1>

        {/* Message */}
        <h2 className={styles.title}>Page not found</h2>
        <p className={styles.description}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        {/* Actions */}
        <div className={styles.actions}>
          <Link href="/">
            <Button size="lg">
              <Home size={18} />
              Go Home
            </Button>
          </Link>
          <Link href="/marketplace">
            <Button variant="outline" size="lg">
              <Search size={18} />
              Browse Marketplace
            </Button>
          </Link>
        </div>

        {/* Back Link */}
        <button
          onClick={() => window.history.back()}
          className={styles.backLink}
        >
          <ArrowLeft size={16} />
          Go back
        </button>
      </div>
    </div>
  );
}
