'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Zap,
  Star,
  Share2,
  Check,
  Shield,
  Clock,
  Package,
  ExternalLink,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { PublicHeader, PublicFooter } from '@/components/layout';
import { formatUsdc, shortenAddress, formatCompactNumber } from '@/lib/utils/format';
import { ROUTES } from '@/lib/utils/constants';
import styles from './page.module.css';

interface CreatorAgent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  pricePerCall: number;
  totalCalls: number;
}

interface CreatorProfile {
  id: string;
  handle: string | null;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  walletAddress: string;
  memberSince: string;
  isVerified: boolean;
  stats: {
    totalAgents: number;
    totalCalls: number;
    totalEarned: number;
  };
  agents: CreatorAgent[];
}

async function fetchCreatorProfile(handle: string): Promise<CreatorProfile> {
  const res = await fetch(`/api/creator/${handle}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error('Creator not found');
    throw new Error('Failed to fetch creator');
  }
  const data = await res.json();
  return data.profile;
}

export default function CreatorProfilePage() {
  const params = useParams();
  const handle = params.handle as string;
  const [copied, setCopied] = useState(false);

  const {
    data: profile,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['creator-profile', handle],
    queryFn: () => fetchCreatorProfile(handle),
    enabled: !!handle,
    staleTime: 30_000,
  });

  const copyProfileUrl = () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className={styles.page}>
        <PublicHeader currentPage="creator" />
        <div className={styles.loadingState}>
          <Loader2 size={32} className={styles.spinner} />
          <p>Loading profile...</p>
        </div>
        <PublicFooter />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className={styles.page}>
        <PublicHeader currentPage="creator" />
        <div className={styles.errorState}>
          <h2>Profile not found</h2>
          <p>
            {error instanceof Error
              ? error.message
              : "This profile doesn't exist or may have been removed."}
          </p>
          <Link href={ROUTES.MARKETPLACE}>
            <Button>Browse Marketplace</Button>
          </Link>
        </div>
        <PublicFooter />
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
    });
  };

  // Use wallet address as display name if no name/handle
  const displayName = profile.name || profile.handle || shortenAddress(profile.walletAddress);

  return (
    <div className={styles.page}>
      <PublicHeader currentPage="creator" />

      <div className={styles.container}>
        {/* Profile Header - Apify Creator Style */}
        <header className={styles.profileHeader}>
          <div className={styles.avatarSection}>
            <div className={styles.avatar}>
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={displayName} />
              ) : (
                <span>A</span>
              )}
            </div>
          </div>

          <div className={styles.profileInfo}>
            <Link href={ROUTES.MARKETPLACE} className={styles.backLink}>
              <ArrowLeft size={14} />
              Marketplace
            </Link>

            <h1 className={styles.profileName}>{displayName}</h1>

            {profile.bio && <p className={styles.profileBio}>{profile.bio}</p>}

            {/* Stats Row */}
            <div className={styles.statsRow}>
              <span className={styles.statItem}>
                <Package size={16} />
                <strong>{profile.stats.totalAgents}</strong> public agents
              </span>
              <span className={styles.statItem}>
                <Zap size={16} />
                <strong>{formatCompactNumber(profile.stats.totalCalls)}</strong> total calls
              </span>
              <span className={styles.statItem}>
                <Star size={16} />
                <strong>${formatCompactNumber(profile.stats.totalEarned)}</strong> earned
              </span>
              <span className={styles.statItem}>
                <Clock size={16} />
                Joined {formatDate(profile.memberSince)}
              </span>
            </div>

            {/* Verified Badge */}
            {profile.isVerified && (
              <div className={styles.verifiedBadge}>
                <Shield size={14} />
                <span>Verified Developer</span>
              </div>
            )}

            {/* Meta Row */}
            <div className={styles.metaRow}>
              <a
                href={`https://basescan.org/address/${profile.walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.walletLink}
              >
                {shortenAddress(profile.walletAddress)}
                <ExternalLink size={12} />
              </a>
              <button className={styles.shareBtn} onClick={copyProfileUrl}>
                {copied ? <Check size={14} /> : <Share2 size={14} />}
                {copied ? 'Copied!' : 'Share'}
              </button>
            </div>
          </div>
        </header>

        {/* Agents Section */}
        <section className={styles.agentsSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Public Agents</h2>
            <span className={styles.agentCount}>{profile.agents.length} agents</span>
          </div>

          {profile.agents.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <Package size={28} />
              </div>
              <h3>No agents yet</h3>
              <p>When this developer publishes agents, they'll appear here.</p>
            </div>
          ) : (
            <div className={styles.agentsGrid}>
              {profile.agents.map((agent) => (
                <Link key={agent.id} href={`/${handle}/${agent.slug}`} className={styles.agentCard}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.agentName}>{agent.name}</h3>
                    <span className={styles.priceBadge}>{formatUsdc(agent.pricePerCall)}/call</span>
                  </div>
                  <span className={styles.category}>{agent.category}</span>
                  <p className={styles.agentDesc}>
                    {agent.description || 'No description provided.'}
                  </p>
                  <div className={styles.cardFooter}>
                    <span className={styles.cardVerified}>
                      <Shield size={12} />
                      Verified
                    </span>
                    <span className={styles.cardStat}>
                      <Zap size={14} />
                      {formatCompactNumber(agent.totalCalls)} calls
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <PublicFooter />
    </div>
  );
}
