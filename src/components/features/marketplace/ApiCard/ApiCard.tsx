import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import { formatUsdc } from '@/lib/utils/format';
import { ROUTES } from '@/lib/utils/constants';
import type { Api } from '@/types/api';
import styles from './ApiCard.module.css';

interface ApiCardProps {
  api: Api;
}

export function ApiCard({ api }: ApiCardProps) {
  const statusVariant = {
    active: 'success',
    pending: 'warning',
    inactive: 'default',
  } as const;

  return (
    <Link href={ROUTES.API_DETAIL(api.id)} className={styles.link}>
      <Card className={styles.card} padding="lg">
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <h3 className={styles.title}>{api.name}</h3>
            <Badge variant={statusVariant[api.status]} size="sm">
              {api.status}
            </Badge>
          </div>
          <span className={styles.category}>{api.category}</span>
        </div>

        <p className={styles.description}>{api.description}</p>

        <div className={styles.pricing}>
          <span className={styles.price}>{formatUsdc(api.pricing.price)}</span>
          <span className={styles.unit}>
            / {api.pricing.model === 'per_call' ? 'call' : api.pricing.unit || 'unit'}
          </span>
        </div>

        <div className={styles.footer}>
          <div className={styles.provider}>
            <span className={styles.providerLabel}>by</span>
            <span className={styles.providerName}>{api.provider.name}</span>
          </div>
          <div className={styles.stats}>
            <span>{api.stats?.totalCalls?.toLocaleString() || 0} calls</span>
          </div>
        </div>

        <div className={styles.tags}>
          {api.tags?.slice(0, 3).map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>

        <ExternalLink size={16} className={styles.externalIcon} />
      </Card>
    </Link>
  );
}
