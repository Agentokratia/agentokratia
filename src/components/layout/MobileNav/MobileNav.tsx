'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAccount, useDisconnect } from 'wagmi';
import { Menu, X, Home, Box, CreditCard, Settings, LogOut, Wallet, Globe } from 'lucide-react';
import { Logo } from '@/components/ui';
import { shortenAddress } from '@/lib/utils/format';
import { useNetworkConfig } from '@/lib/network/client';
import styles from './MobileNav.module.css';

const navLinks = [
  { href: '/dashboard', label: 'Home', icon: Home, exact: true },
  { href: '/dashboard/agents', label: 'My Agents', icon: Box },
  { href: '/dashboard/payments', label: 'Payments', icon: CreditCard },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: networkConfig } = useNetworkConfig();

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeDrawer();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeDrawer]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close drawer when route changes
  useEffect(() => {
    closeDrawer();
  }, [pathname, closeDrawer]);

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const handleNavClick = (href: string) => {
    router.push(href);
    closeDrawer();
  };

  const handleDisconnect = () => {
    disconnect();
    router.push('/');
  };

  return (
    <>
      {/* Mobile Header Bar */}
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.logo}>
          <Logo size={24} />
          <span>Agentokratia</span>
        </Link>
        <button
          className={styles.menuButton}
          onClick={() => setIsOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu size={24} />
        </button>
      </header>

      {/* Overlay */}
      {isOpen && <div className={styles.overlay} onClick={closeDrawer} aria-hidden="true" />}

      {/* Drawer */}
      <nav
        className={`${styles.drawer} ${isOpen ? styles.open : ''}`}
        aria-label="Mobile navigation"
      >
        <div className={styles.drawerHeader}>
          <Link href="/dashboard" className={styles.drawerLogo} onClick={closeDrawer}>
            <Logo size={28} />
            <span>Agentokratia</span>
          </Link>
          <button
            className={styles.closeButton}
            onClick={closeDrawer}
            aria-label="Close navigation menu"
          >
            <X size={24} />
          </button>
        </div>

        <div className={styles.drawerNav}>
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.href}
                onClick={() => handleNavClick(link.href)}
                className={`${styles.navLink} ${isActive(link.href, link.exact) ? styles.active : ''}`}
              >
                <Icon size={20} />
                {link.label}
              </button>
            );
          })}
        </div>

        <div className={styles.drawerFooter}>
          {networkConfig && (
            <div className={styles.networkIndicator}>
              <Globe size={14} />
              <span>{networkConfig.name}</span>
              {networkConfig.isTestnet && <span className={styles.testnetBadge}>Testnet</span>}
            </div>
          )}
          <div className={styles.accountInfo}>
            <Wallet size={18} />
            <span className={styles.address}>{address ? shortenAddress(address) : '0x...'}</span>
          </div>
          <button className={styles.disconnectBtn} onClick={handleDisconnect}>
            <LogOut size={18} />
            Disconnect Wallet
          </button>
        </div>
      </nav>
    </>
  );
}
