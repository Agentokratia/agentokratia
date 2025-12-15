'use client';

import { useState } from 'react';
import { Sparkles, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { formatUsdc, dollarsToCents, centsToDollars, calculateEarnings } from '@/lib/utils/format';
import { Agent } from '../page';
import styles from './tabs.module.css';

interface Props {
  agent: Agent;
  onSave: (updates: Partial<Agent>) => Promise<boolean>;
  saving: boolean;
}

const priceSuggestions = [0.001, 0.01, 0.05, 0.10, 0.50];

export default function PricingTab({ agent, onSave, saving }: Props) {
  // pricePerCall comes from API in cents - store as cents, display with formatUsdc
  const [priceCents, setPriceCents] = useState(agent.pricePerCall || 5); // default 5 cents = $0.05
  const [freeTierEnabled, setFreeTierEnabled] = useState(false);
  const [freeTierCalls, setFreeTierCalls] = useState(10);

  const handleSave = () => {
    onSave({ pricePerCall: priceCents });
  };

  // Convert dollars input to cents using viem
  const handlePriceChange = (dollarValue: string) => {
    const dollars = parseFloat(dollarValue) || 0;
    setPriceCents(dollarsToCents(dollars));
  };

  const priceDollars = Number(centsToDollars(priceCents));

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Get Paid</h2>
        <p className={styles.desc}>
          Set your price. Every time someone calls your agent, you earn.
        </p>
      </div>

      {/* Early Adopter Banner */}
      <div className={styles.earlyAdopterBadge} style={{ marginBottom: '24px' }}>
        <Sparkles size={18} />
        <span>Early Adopter Bonus: You keep 100% of earnings during beta!</span>
      </div>

      {/* Two column layout for pricing */}
      <div className={styles.twoColumnEqual}>
        {/* Left: Price Input */}
        <div className={styles.formSection}>
          <div className={styles.formSectionTitle}>Price per call</div>
          <div className={styles.formGroup}>
            <div className={styles.priceInputGroup}>
              <span className="currency">$</span>
              <input
                type="number"
                value={priceDollars}
                onChange={(e) => handlePriceChange(e.target.value)}
                step="0.001"
                min="0"
              />
              <span className="token">USDC</span>
            </div>
            <div className={styles.priceSuggestions}>
              {priceSuggestions.map((amount) => (
                <button
                  key={amount}
                  className={styles.priceSuggestion}
                  onClick={() => setPriceCents(dollarsToCents(amount))}
                >
                  {formatUsdc(dollarsToCents(amount))}
                </button>
              ))}
            </div>
            <p className={styles.formHint} style={{ marginTop: '16px' }}>
              Most agents charge $0.01-$0.10 per call.
            </p>
          </div>

          {/* Free Tier */}
          <div className={styles.securityItem} style={{ borderBottom: 'none', paddingBottom: 0, marginTop: '16px' }}>
            <div className={styles.securityItemInfo}>
              <div className={styles.securityItemTitle}>Free tier</div>
              <div className={styles.securityItemDesc}>
                Let users try before paying.
              </div>
              {freeTierEnabled && (
                <div className={styles.securityItemInput}>
                  <input
                    type="number"
                    value={freeTierCalls}
                    onChange={(e) => setFreeTierCalls(Number(e.target.value))}
                    min={1}
                    max={100}
                  />
                  <span>free/month</span>
                </div>
              )}
            </div>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={freeTierEnabled}
                onChange={(e) => setFreeTierEnabled(e.target.checked)}
              />
              <span className={styles.toggleSlider} />
            </label>
          </div>
        </div>

        {/* Right: Earnings Preview */}
        <div className={styles.formSection}>
          <div className={styles.formSectionTitle}>Earnings Preview</div>

          {/* 100% Earnings Note */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '16px',
            background: 'rgba(34, 197, 94, 0.1)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '16px'
          }}>
            <CheckCircle size={20} style={{ color: 'var(--success)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
                You keep 100%
              </p>
              <p style={{ fontSize: '13px', color: 'var(--stone)', lineHeight: 1.5, margin: 0 }}>
                No platform fees during beta.
              </p>
            </div>
          </div>

          {/* Earnings Preview */}
          {priceCents > 0 && (
            <div style={{
              padding: '16px',
              background: 'var(--cloud)',
              borderRadius: 'var(--radius-md)'
            }}>
              <p style={{ fontSize: '13px', color: 'var(--stone)', marginBottom: '12px' }}>
                At {formatUsdc(priceCents)}/call you&apos;d earn:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '13px', color: 'var(--stone)' }}>100 calls</span>
                  <span style={{ fontSize: '18px', fontWeight: 600 }}>{formatUsdc(calculateEarnings(priceCents, 100))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '13px', color: 'var(--stone)' }}>1,000 calls</span>
                  <span style={{ fontSize: '18px', fontWeight: 600 }}>{formatUsdc(calculateEarnings(priceCents, 1000))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '13px', color: 'var(--stone)' }}>10,000 calls</span>
                  <span style={{ fontSize: '18px', fontWeight: 600 }}>{formatUsdc(calculateEarnings(priceCents, 10000))}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.actionBar}>
        <Button onClick={handleSave} loading={saving}>
          {saving ? 'Saving...' : 'Save Pricing'}
        </Button>
      </div>
    </div>
  );
}
