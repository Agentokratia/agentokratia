'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useDisconnect } from 'wagmi';
import { Copy, Check, ExternalLink, LogOut, Loader2, Globe } from 'lucide-react';
import { Button, Input, Card, CardContent } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import { useAuthStore, authApi } from '@/lib/store/authStore';
import { useNetworkConfig, getExplorerAddressUrl } from '@/lib/network/client';
import styles from './page.module.css';

interface UserProfile {
  id: string;
  walletAddress: string;
  handle: string | null;
  email: string | null;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  isWhitelisted: boolean;
  createdAt: string;
  updatedAt?: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: networkConfig } = useNetworkConfig();
  const { token, clearAuth } = useAuthStore();

  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    handle: '',
    name: '',
    email: '',
    bio: '',
  });

  // Fetch user profile from server on mount
  useEffect(() => {
    const fetchProfile = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const profile: UserProfile = await authApi.getProfile(token);
        setForm({
          handle: profile.handle || '',
          name: profile.name || '',
          email: profile.email || '',
          bio: profile.bio || '',
        });
      } catch (err) {
        console.error('Failed to fetch profile:', err);
        // Token might be invalid
        if (err instanceof Error && (err.message.includes('401') || err.message.includes('expired'))) {
          clearAuth();
          router.push('/');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [token, clearAuth, router]);

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      if (token) {
        await authApi.logout(token);
      }
      disconnect();
      clearAuth();
      router.push('/');
    } catch (err) {
      // Even if logout fails, still disconnect locally
      disconnect();
      clearAuth();
      router.push('/');
    }
  };

  const handleSave = async () => {
    if (!token) {
      setError('Not authenticated');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await authApi.updateProfile(token, {
        handle: form.handle || undefined,
        email: form.email || undefined,
        name: form.name || undefined,
        bio: form.bio || undefined,
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <PageHeader title="Settings" subtitle="Loading your settings..." />
        <div className={styles.loadingContainer}>
          <Loader2 size={32} className={styles.spinner} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Settings" subtitle="Manage your account and preferences" />

      <Card padding="lg" className={styles.section}>
        <h2 className={styles.sectionTitle}>Wallet</h2>
        <CardContent>
          <div className={styles.walletInfo}>
            <div className={styles.walletAddress}>
              <span className={styles.label}>Connected Wallet</span>
              <div className={styles.addressRow}>
                <code>{address || 'Not connected'}</code>
                {address && (
                  <button onClick={copyAddress} className={styles.copyBtn}>
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                )}
              </div>
            </div>
            {networkConfig && (
              <div className={styles.walletNetwork}>
                <span className={styles.label}>
                  <Globe size={14} />
                  Network
                </span>
                <div className={styles.networkRow}>
                  <span className={styles.networkName}>{networkConfig.name}</span>
                  {networkConfig.isTestnet && (
                    <span className={styles.testnetBadge}>Testnet</span>
                  )}
                </div>
              </div>
            )}
            <div className={styles.walletActions}>
              {networkConfig && address && (
                <a
                  href={getExplorerAddressUrl(networkConfig.blockExplorerUrl, address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.viewLink}
                >
                  View on Explorer
                  <ExternalLink size={14} />
                </a>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                loading={disconnecting}
                className={styles.disconnectBtn}
              >
                <LogOut size={16} />
                {disconnecting ? 'Disconnecting...' : 'Disconnect Wallet'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Two column layout for Profile and Notifications */}
      <div className={styles.twoColumnGrid}>
        <Card padding="lg" className={styles.section}>
          <h2 className={styles.sectionTitle}>Profile</h2>
          <CardContent>
            <div className={styles.fields}>
              <Input
                label="Handle"
                placeholder="your_handle"
                value={form.handle}
                onChange={(e) => setForm({ ...form, handle: e.target.value })}
                hint="Unique username (letters, numbers, underscores)"
              />
              <Input
                label="Display Name"
                placeholder="Your name or alias"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                hint="Shown on your API listings"
              />
              <Input
                label="Email"
                type="email"
                placeholder="your@email.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                hint="Used for notifications only"
              />
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Bio</label>
                <textarea
                  className={styles.textarea}
                  placeholder="Tell us about yourself..."
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card padding="lg" className={styles.section}>
          <h2 className={styles.sectionTitle}>Notifications</h2>
          <CardContent>
            <div className={styles.comingSoon}>
              <p className={styles.comingSoonText}>
                Email notifications coming soon. We&apos;ll let you know when:
              </p>
              <ul className={styles.comingSoonList}>
                <li>Your API usage exceeds thresholds</li>
                <li>You receive payments</li>
                <li>Important platform updates</li>
              </ul>
              <p className={styles.comingSoonHint}>
                Add your email above to be notified when this feature launches.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className={styles.errorMessage}>
          {error}
        </div>
      )}

      {success && (
        <div className={styles.successMessage}>
          Settings saved successfully!
        </div>
      )}

      <div className={styles.actions}>
        <Button onClick={handleSave} loading={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
