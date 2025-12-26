'use client';

import { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Check, Info } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import styles from './DepositModal.module.css';

interface DepositModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (amount: string) => void;
  agentName: string;
  pricePerCall: number; // In cents (e.g., 5 = $0.05)
  minDeposit?: string; // In atomic units (e.g., "1000000" = $1.00)
  maxDeposit?: string; // In atomic units (e.g., "100000000" = $100.00)
  isLoading?: boolean;
}

const PRESET_AMOUNTS = [
  { usdc: 5, label: '$5' },
  { usdc: 10, label: '$10', recommended: true },
  { usdc: 25, label: '$25' },
];

export function DepositModal({
  open,
  onOpenChange,
  onConfirm,
  agentName,
  pricePerCall,
  minDeposit = '1000000',
  maxDeposit = '100000000',
  isLoading = false,
}: DepositModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number>(10);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [useCustom, setUseCustom] = useState(false);

  const minUsdc = useMemo(() => Number(minDeposit) / 1_000_000, [minDeposit]);
  const maxUsdc = useMemo(() => Number(maxDeposit) / 1_000_000, [maxDeposit]);
  const priceUsdc = pricePerCall / 100;

  const effectiveAmount = useCustom ? Number(customAmount) || 0 : selectedAmount;
  const estimatedCalls = useMemo(
    () => Math.floor(effectiveAmount / priceUsdc),
    [effectiveAmount, priceUsdc]
  );
  const atomicAmount = String(Math.floor(effectiveAmount * 1_000_000));

  const isValid = effectiveAmount >= minUsdc && effectiveAmount <= maxUsdc;

  const handleConfirm = () => {
    if (isValid && !isLoading) {
      onConfirm(atomicAmount);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Create Payment Session" size="md">
      <div className={styles.content}>
        <p className={styles.subtitle}>
          Deposit USDC to make multiple API calls without signing each time.
        </p>

        <div className={styles.info}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Agent:</span>
            <span className={styles.infoValue}>{agentName}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Price:</span>
            <span className={styles.infoValue}>${priceUsdc.toFixed(2)} per call</span>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.amountSection}>
          <h4 className={styles.sectionTitle}>Choose deposit amount:</h4>

          <div className={styles.presets}>
            {PRESET_AMOUNTS.map(({ usdc, label, recommended }) => (
              <button
                key={usdc}
                type="button"
                className={cn(
                  styles.preset,
                  !useCustom && selectedAmount === usdc && styles.selected
                )}
                onClick={() => {
                  setSelectedAmount(usdc);
                  setUseCustom(false);
                }}
              >
                <div className={styles.presetCheck}>
                  {!useCustom && selectedAmount === usdc && <Check size={14} />}
                </div>
                <div className={styles.presetContent}>
                  <div className={styles.presetLabel}>
                    {label}
                    {recommended && <span className={styles.recommended}>Recommended</span>}
                  </div>
                  <div className={styles.presetCalls}>~{Math.floor(usdc / priceUsdc)} calls</div>
                </div>
              </button>
            ))}
          </div>

          <button
            type="button"
            className={cn(styles.customOption, useCustom && styles.selected)}
            onClick={() => setUseCustom(true)}
          >
            <div className={styles.presetCheck}>{useCustom && <Check size={14} />}</div>
            <div className={styles.customContent}>
              <span className={styles.customLabel}>Custom amount</span>
              {useCustom && (
                <div className={styles.customInput}>
                  <span className={styles.currencyPrefix}>$</span>
                  <input
                    type="number"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    min={minUsdc}
                    max={maxUsdc}
                    step="0.01"
                    placeholder="0.00"
                    className={styles.input}
                    autoFocus
                  />
                  <span className={styles.currencySuffix}>USDC</span>
                </div>
              )}
            </div>
          </button>

          {useCustom && (
            <div className={styles.bounds}>
              Min: ${minUsdc.toFixed(2)} · Max: ${maxUsdc.toFixed(2)}
            </div>
          )}
        </div>

        {isValid && (
          <div className={styles.summary}>
            <div className={styles.summaryRow}>
              <span>Deposit:</span>
              <strong>${effectiveAmount.toFixed(2)} USDC</strong>
            </div>
            <div className={styles.summaryRow}>
              <span>Estimated calls:</span>
              <span>~{estimatedCalls}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Session duration:</span>
              <span>1 hour</span>
            </div>
          </div>
        )}

        <div className={styles.notice}>
          <Info size={14} />
          <span>Unused funds can be reclaimed within 24 hours after session expires</span>
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={!isValid || isLoading}>
            {isLoading ? 'Creating...' : 'Create Session'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
