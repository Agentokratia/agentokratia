'use client';

import { useState, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAccount, useDisconnect } from 'wagmi';
import { Home, Box, CreditCard, Settings, LogOut, ChevronDown, Wallet, Globe } from 'lucide-react';
import { Logo } from '@/components/ui';
import { shortenAddress } from '@/lib/utils/format';
import { useNetworkConfig } from '@/lib/network/client';
import styles from './Sidebar.module.css';

const sidebarLinks = [
  { href: '/dashboard', label: 'Home', icon: Home, exact: true },
  { href: '/dashboard/agents', label: 'My Agents', icon: Box },
  { href: '/dashboard/payments', label: 'Payments', icon: CreditCard },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: networkConfig } = useNetworkConfig();
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Clear pending state when navigation completes
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const isActive = (href: string, exact?: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  const handleNavClick = (href: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (pathname === href) return; // Already on this page

    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  };

  const handleDisconnect = () => {
    disconnect();
    router.push('/');
  };

  return (
    <aside className={styles.sidebar}>
      <Link href="/dashboard" className={styles.sidebarLogo}>
        <Logo size={28} />
        <span>Agentokratia</span>
      </Link>

      <nav className={styles.sidebarNav}>
        {sidebarLinks.map((link) => {
          const Icon = link.icon;
          const isLinkActive = isActive(link.href, link.exact);
          const isLinkPending = pendingHref === link.href && isPending;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={(e) => handleNavClick(link.href, e)}
              className={`${styles.sidebarLink} ${isLinkActive || isLinkPending ? styles.active : ''} ${isLinkPending ? styles.pending : ''}`}
            >
              <Icon size={18} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.sidebarFooter}>
        {networkConfig && (
          <div className={styles.networkIndicator}>
            <Globe size={14} />
            <span>{networkConfig.name}</span>
            {networkConfig.isTestnet && <span className={styles.testnetBadge}>Testnet</span>}
          </div>
        )}
        <div className={styles.accountSection}>
          <button
            className={styles.accountButton}
            onClick={() => setShowAccountMenu(!showAccountMenu)}
          >
            <Wallet size={18} />
            <span>{address ? shortenAddress(address) : '0x...'}</span>
            <ChevronDown size={14} className={showAccountMenu ? styles.rotated : ''} />
          </button>

          {showAccountMenu && (
            <div className={styles.accountMenu}>
              <button className={styles.disconnectBtn} onClick={handleDisconnect}>
                <LogOut size={16} />
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
