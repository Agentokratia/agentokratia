import { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  actions?: ReactNode;
  badge?: ReactNode;
}

export function PageHeader({ title, subtitle, backHref, actions, badge }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        {backHref && (
          <Link href={backHref} className={styles.backLink}>
            <ArrowLeft size={18} />
          </Link>
        )}
        <div className={styles.titleGroup}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title}</h1>
            {badge}
          </div>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      </div>
      {actions && <div className={styles.headerRight}>{actions}</div>}
    </header>
  );
}
