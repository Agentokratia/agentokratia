'use client';

import Link from 'next/link';
import { Logo, Button } from '@/components/ui';
import { ROUTES } from '@/lib/utils/constants';
import styles from './PublicHeader.module.css';

interface PublicHeaderProps {
  currentPage?: 'marketplace' | 'agent' | 'creator';
}

export function PublicHeader({ currentPage }: PublicHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href={ROUTES.HOME} className={styles.brand}>
          <Logo size={28} />
          <span className={styles.brandName}>Agentokratia</span>
        </Link>

        <nav className={styles.nav}>
          <Link
            href={ROUTES.MARKETPLACE}
            className={`${styles.navLink} ${currentPage === 'marketplace' ? styles.active : ''}`}
          >
            Marketplace
          </Link>
          <Link href={ROUTES.DASHBOARD}>
            <Button size="sm">Launch App</Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}
