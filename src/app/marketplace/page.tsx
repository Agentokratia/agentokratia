'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, Shield, Loader2 } from 'lucide-react';
import { PublicHeader, PublicFooter } from '@/components/layout';
import { FeedbackWidget } from '@/components/ui';
import { formatUsdc } from '@/lib/utils/format';
import styles from './page.module.css';

const categories = ['All', 'AI / ML', 'Data', 'Content', 'Dev Tools'];

const categoryDisplayMap: Record<string, string> = {
  ai: 'AI / ML',
  data: 'Data',
  content: 'Content',
  tools: 'Dev Tools',
  other: 'Other',
};

interface MarketplaceAgent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  pricePerCall: number;
  totalCalls: number;
  tags: string[] | null;
  ownerHandle: string | null;
}

async function fetchMarketplaceAgents(category: string, sortBy: string): Promise<MarketplaceAgent[]> {
  const params = new URLSearchParams();
  if (category !== 'All') params.set('category', category);
  params.set('sort', sortBy);

  const res = await fetch(`/api/marketplace?${params}`);
  if (!res.ok) throw new Error('Failed to fetch agents');

  const data = await res.json();
  return data.agents || [];
}

export default function MarketplacePage() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState('popular');

  const { data: agents = [], isLoading, error } = useQuery({
    queryKey: ['marketplace-agents', selectedCategory, sortBy],
    queryFn: () => fetchMarketplaceAgents(selectedCategory, sortBy),
    staleTime: 30_000,
  });

  // Client-side search filtering for instant feedback
  const filteredAgents = agents.filter((agent) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      agent.name.toLowerCase().includes(searchLower) ||
      agent.description?.toLowerCase().includes(searchLower)
    );
  });

  const formatCalls = (num: number) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  };

  return (
    <div className={styles.page}>
      <PublicHeader currentPage="marketplace" />

      <main className={styles.main}>
        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Agent Marketplace</h1>
            <p className={styles.heroSubtitle}>
              Discover and use AI agents with pay-per-call pricing. No subscriptions, no commitments.
            </p>
            <div className={styles.searchBox}>
              <Search size={20} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search agents by name or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={styles.searchInput}
              />
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className={styles.filters}>
          <div className={styles.filtersInner}>
            <div className={styles.categoryTabs}>
              {categories.map((category) => (
                <button
                  key={category}
                  className={`${styles.categoryTab} ${selectedCategory === category ? styles.active : ''}`}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>
            <div className={styles.sortGroup}>
              <span className={styles.resultsCount}>
                {isLoading ? 'Loading...' : `${filteredAgents.length} agent${filteredAgents.length !== 1 ? 's' : ''}`}
              </span>
              <select
                className={styles.sortSelect}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="popular">Most Popular</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
              </select>
            </div>
          </div>
        </section>

        {/* Content */}
        <section className={styles.content}>
          {isLoading ? (
            <div className={styles.emptyState}>
              <Loader2 size={40} className={styles.spinner} />
              <p>Loading agents...</p>
            </div>
          ) : error ? (
            <div className={styles.emptyState}>
              <p className={styles.errorText}>{error instanceof Error ? error.message : 'Failed to load agents'}</p>
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className={styles.emptyState}>
              <Search size={40} />
              <h3>No agents found</h3>
              <p>Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {filteredAgents.map((agent) => (
                <Link
                  key={agent.id}
                  href={`/${agent.ownerHandle}/${agent.slug}`}
                  className={styles.card}
                >
                  <div className={styles.cardTop}>
                    <div className={styles.cardMeta}>
                      <h3 className={styles.cardTitle}>{agent.name}</h3>
                      <span className={styles.cardCategory}>
                        {categoryDisplayMap[agent.category] || agent.category}
                      </span>
                    </div>
                    <div className={styles.cardPrice}>
                      {formatUsdc(agent.pricePerCall)}
                      <span className={styles.priceUnit}>/call</span>
                    </div>
                  </div>

                  <p className={styles.cardDesc}>
                    {agent.description || 'No description provided'}
                  </p>

                  <div className={styles.cardBadges}>
                    <span className={styles.verifiedBadge}>
                      <Shield size={12} />
                      Verified
                    </span>
                  </div>

                  <div className={styles.cardFooter}>
                    <span className={styles.cardStat}>
                      <strong>{formatCalls(agent.totalCalls)}</strong> calls
                    </span>
                    {agent.ownerHandle && (
                      <span className={styles.cardAuthor}>
                        @{agent.ownerHandle}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      <PublicFooter />
      <FeedbackWidget />
    </div>
  );
}
