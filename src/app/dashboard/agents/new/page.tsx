'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/lib/store/authStore';
import { PLACEHOLDER_ENDPOINT } from '@/lib/utils/constants';
import styles from './page.module.css';

const categories = [
  { value: 'ai', label: 'AI / Machine Learning' },
  { value: 'data', label: 'Data & Analytics' },
  { value: 'content', label: 'Content & Media' },
  { value: 'tools', label: 'Developer Tools' },
  { value: 'other', label: 'Other' },
];

export default function NewAgentPage() {
  const router = useRouter();
  const { token } = useAuthStore();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('ai');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !name.trim()) return;

    setCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          category,
          endpointUrl: PLACEHOLDER_ENDPOINT,
          pricePerCall: 0.05, // Default price, can be changed in settings
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create agent');
      }

      const data = await res.json();
      router.push(`/dashboard/agents/${data.agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/dashboard/agents" className={styles.backBtn}>
          <ArrowLeft size={18} />
          <span>My Agents</span>
        </Link>
      </header>

      <div className={styles.content}>
        <div className={styles.card}>
          <h1 className={styles.title}>Create a new agent</h1>
          <p className={styles.subtitle}>
            Name your agent to get started. You&apos;ll configure the endpoint, pricing, and
            settings in the dashboard.
          </p>

          <form onSubmit={createAgent}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Agent name</label>
              <input
                type="text"
                className={styles.input}
                placeholder="e.g., Research Assistant"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
              <p className={styles.hint}>How consumers will find your API in the marketplace</p>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Category</label>
              <select
                className={styles.select}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <Button type="submit" className={styles.submitBtn} disabled={!name.trim() || creating}>
              {creating ? <Loader2 size={18} className={styles.spinner} /> : null}
              {creating ? 'Creating...' : 'Create Agent'}
            </Button>
          </form>

          <div className={styles.nextSteps}>
            <div className={styles.nextStepsTitle}>After creating, you&apos;ll set up:</div>
            <div className={styles.stepItem}>
              <span className={styles.stepNumber}>1</span>
              <div className={styles.stepText}>
                <strong>Connection</strong> <span>- Your backend API URL + schemas</span>
              </div>
            </div>
            <div className={styles.stepItem}>
              <span className={styles.stepNumber}>2</span>
              <div className={styles.stepText}>
                <strong>Pricing</strong> <span>- Cost per API call</span>
              </div>
            </div>
            <div className={styles.stepItem}>
              <span className={styles.stepNumber}>3</span>
              <div className={styles.stepText}>
                <strong>README</strong> <span>- Documentation for developers</span>
              </div>
            </div>
            <div className={styles.stepItem}>
              <span className={styles.stepNumber}>4</span>
              <div className={styles.stepText}>
                <strong>Security</strong> <span>- Rate limits, validation (optional)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
