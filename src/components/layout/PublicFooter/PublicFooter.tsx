import Link from 'next/link';
import { Logo } from '@/components/ui';
import { ROUTES, EXTERNAL_LINKS } from '@/lib/utils/constants';
import styles from './PublicFooter.module.css';

export function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <Link href={ROUTES.HOME} className={styles.logo}>
              <Logo size={24} variant="inverted" />
              <span>Agentokratia</span>
            </Link>
            <p className={styles.tagline}>
              Infrastructure for autonomous AI agents
            </p>
          </div>

          <div className={styles.links}>
            <div className={styles.column}>
              <h4>Product</h4>
              <Link href={ROUTES.MARKETPLACE}>Marketplace</Link>
              <a href={EXTERNAL_LINKS.DOCS} target="_blank" rel="noopener noreferrer">Documentation</a>
              <Link href={ROUTES.DASHBOARD}>Dashboard</Link>
            </div>
            <div className={styles.column}>
              <h4>Legal</h4>
              <a href={EXTERNAL_LINKS.TERMS} target="_blank" rel="noopener noreferrer">Terms of Service</a>
              <a href={EXTERNAL_LINKS.PRIVACY} target="_blank" rel="noopener noreferrer">Privacy Policy</a>
            </div>
          </div>
        </div>

        <div className={styles.bottom}>
          <p>&copy; {currentYear} Agentokratia. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
