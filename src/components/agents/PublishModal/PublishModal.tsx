'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { Check, AlertCircle, Loader2, ExternalLink, Rocket, Wallet, Twitter, Link2, MessageSquare } from 'lucide-react';
import { Modal } from '@/components/ui/Modal/Modal';
import { Button } from '@/components/ui/Button/Button';
import { useRegisterAgent, parseTokenIdFromLogs, useEstimateRegistrationFee } from '@/lib/erc8004/hooks';
import { useNetworkConfig, getExplorerTxUrl } from '@/lib/network/client';
import { useAuthStore, usePendingTransactionStore } from '@/lib/store';
import { PLACEHOLDER_ENDPOINT } from '@/lib/utils/constants';
import { formatUsdc } from '@/lib/utils/format';
import styles from './PublishModal.module.css';

interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  endpointUrl: string;
  pricePerCall: number;
  status: string;
  ownerHandle: string | null;
}

interface PublishModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: Agent;
  hasSigningKey: boolean;
  onPublished: (tokenId: string, txHash: string, chainId: number) => void;
  onEnableReviews?: () => void;
}

type PublishPhase = 'ready' | 'preparing' | 'signing' | 'confirming' | 'finalizing' | 'success' | 'error';

interface Blocker {
  id: string;
  message: string;
  action?: string;
  onClick?: () => void;
}

export function PublishModal({ open, onOpenChange, agent, hasSigningKey, onPublished, onEnableReviews }: PublishModalProps) {
  const { token } = useAuthStore();
  const { setPending, clearPending } = usePendingTransactionStore();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { register, receipt, error: txError } = useRegisterAgent();
  const { formattedFee } = useEstimateRegistrationFee();
  const { data: networkConfig } = useNetworkConfig();

  const [phase, setPhase] = useState<PublishPhase>('ready');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [tokenId, setTokenId] = useState<string | null>(null);

  // Track if we've already processed this receipt to prevent duplicate calls
  const processedReceiptRef = useRef<string | null>(null);

  // Check if wallet is on the configured network
  const isSupportedChain = networkConfig ? chainId === networkConfig.chainId : false;

  // Compute blockers
  const blockers: Blocker[] = [];

  if (!agent.endpointUrl || agent.endpointUrl === PLACEHOLDER_ENDPOINT) {
    blockers.push({ id: 'endpoint', message: 'Add your API endpoint in the Connection tab' });
  }
  if (agent.pricePerCall <= 0) {
    blockers.push({ id: 'price', message: 'Set a price in the Pricing tab' });
  }
  if (!hasSigningKey) {
    blockers.push({ id: 'key', message: 'Generate a secret key in Security tab' });
  }
  if (!isConnected) {
    blockers.push({
      id: 'wallet',
      message: 'Connect your wallet',
      action: 'Connect',
      onClick: () => onOpenChange(false) // Close modal to show connect button
    });
  } else if (!isSupportedChain && networkConfig) {
    blockers.push({
      id: 'chain',
      message: `Switch to ${networkConfig.name}`,
      action: 'Switch',
      onClick: () => {
        switchChain({ chainId: networkConfig.chainId });
      }
    });
  }

  const isReady = blockers.length === 0;

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setPhase('ready');
      setError(null);
      setTxHash(null);
      setTokenId(null);
      processedReceiptRef.current = null;
    }
  }, [open]);

  // Watch for transaction confirmation - confirm publish after registration
  // Fixed: Don't rely on phase === 'confirming' as there's a race condition
  // where receipt can arrive before setPhase('confirming') is called
  useEffect(() => {
    if (receipt && processedReceiptRef.current !== receipt.transactionHash) {
      // Mark this receipt as processed to prevent duplicate calls
      processedReceiptRef.current = receipt.transactionHash;
      const parsedTokenId = parseTokenIdFromLogs(receipt.logs);
      if (parsedTokenId) {
        setTokenId(parsedTokenId.toString());
        // Pass receipt.transactionHash directly instead of relying on txHash state
        // which might not be updated yet due to React's async state updates
        confirmPublish(parsedTokenId.toString(), receipt.transactionHash);
      } else {
        setError('Could not verify on-chain registration');
        setPhase('error');
      }
    }
  }, [receipt]);

  // Handle transaction errors
  useEffect(() => {
    if (txError && (phase === 'signing' || phase === 'confirming')) {
      const message = txError.message?.includes('rejected')
        ? 'Transaction cancelled'
        : 'Transaction failed';
      setError(message);
      setPhase('error');
      // Clear any pending publish on error
      clearPending('publish');
    }
  }, [txError, phase, clearPending]);

  // One-click publish - runs the entire flow
  const handlePublish = useCallback(async () => {
    if (!token || !isReady) return;

    setPhase('preparing');
    setError(null);

    try {
      // Step 1: Prepare (get tokenURI from backend)
      const res = await fetch(`/api/agents/${agent.id}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to prepare');

      // Step 2: Sign transaction
      setPhase('signing');
      const hash = await register(data.tokenURI);
      setTxHash(hash);

      // Step 3: Wait for confirmation (handled by useEffect above)
      setPhase('confirming');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message.includes('rejected') ? 'Transaction cancelled' : message);
      setPhase('error');
    }
  }, [token, isReady, agent.id, register]);

  const confirmPublish = async (parsedTokenId: string, transactionHash: string) => {
    if (!token) return;

    setPhase('finalizing');
    // Update txHash state for UI display
    setTxHash(transactionHash);

    // CRITICAL: Save to store BEFORE attempting confirm
    // This ensures we can retry if the user closes the browser
    setPending({
      type: 'publish',
      agentId: agent.id,
      txHash: transactionHash,
      chainId,
      tokenId: parsedTokenId,
    });

    // Retry logic for confirm API
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`/api/agents/${agent.id}/publish/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            txHash: transactionHash,
            chainId,
            tokenId: parsedTokenId,
          }),
          keepalive: true, // Survives page close
        });

        if (res.status === 503 && attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        // Success! Clear pending and update state
        clearPending('publish');
        setTokenId(data.tokenId);
        setPhase('success');
        onPublished(data.tokenId, transactionHash, chainId);
        return;
      } catch {
        if (attempt === 2) {
          // After all retries failed, keep pending in store for retry on refresh
          setError('Could not confirm. The transaction succeeded - please refresh the page to complete.');
          setPhase('error');
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  };

  // Prevent closing modal during critical phases
  const handleOpenChange = (newOpen: boolean) => {
    // Allow closing - pending is saved to store and will be retried
    onOpenChange(newOpen);
  };

  const getPhaseContent = () => {
    // Ready state - show blockers or publish button
    if (phase === 'ready') {
      if (!isReady) {
        return (
          <div className={styles.content}>
            <div className={styles.blockerIcon}>
              <AlertCircle size={32} />
            </div>
            <h3 className={styles.title}>Almost ready</h3>
            <p className={styles.subtitle}>Complete these items first:</p>
            <div className={styles.blockerList}>
              {blockers.map((b) => (
                <div key={b.id} className={styles.blockerItem}>
                  <span>{b.message}</span>
                  {b.action && (
                    <button className={styles.blockerAction} onClick={b.onClick}>
                      {b.action}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      }

      return (
        <div className={styles.content}>
          <div className={styles.readyIcon}>
            <Rocket size={32} />
          </div>
          <h3 className={styles.title}>Ready to publish</h3>
          <p className={styles.subtitle}>
            This will register <strong>{agent.name}</strong> on {networkConfig?.name || 'Base'} and make it live on the marketplace.
          </p>
          <div className={styles.summary}>
            <div className={styles.summaryItem}>
              <span>Price</span>
              <strong>{formatUsdc(agent.pricePerCall)}/call</strong>
            </div>
            <div className={styles.summaryItem}>
              <span>Network</span>
              <strong>{networkConfig?.name || 'Base'}</strong>
            </div>
            <div className={styles.summaryItem}>
              <span>Est. gas fee</span>
              <strong>{formattedFee || '< $0.01'}</strong>
            </div>
          </div>
          <div className={styles.actions}>
            <Button onClick={handlePublish} size="lg" fullWidth>
              <Wallet size={18} />
              Publish to {networkConfig?.name || 'Base'}
            </Button>
          </div>
          <p className={styles.hint}>One signature required to register your agent on-chain.</p>
        </div>
      );
    }

    // Processing states - show progress
    if (phase === 'preparing' || phase === 'signing' || phase === 'confirming' || phase === 'finalizing') {
      const steps = [
        { id: 'preparing', label: 'Preparing' },
        { id: 'signing', label: 'Sign in wallet' },
        { id: 'confirming', label: 'Confirming' },
        { id: 'finalizing', label: 'Finalizing' },
      ];

      const currentIndex = steps.findIndex(s => s.id === phase);

      return (
        <div className={styles.content}>
          <div className={styles.progressIcon}>
            <Loader2 size={32} className={styles.spinner} />
          </div>
          <h3 className={styles.title}>Publishing...</h3>
          <div className={styles.progressSteps}>
            {steps.map((step, i) => (
              <div
                key={step.id}
                className={`${styles.progressStep} ${i < currentIndex ? styles.done : ''} ${i === currentIndex ? styles.active : ''}`}
              >
                <div className={styles.progressDot}>
                  {i < currentIndex ? <Check size={12} /> : null}
                </div>
                <span>{step.label}</span>
              </div>
            ))}
          </div>
          {txHash && networkConfig && (
            <a
              href={getExplorerTxUrl(networkConfig.blockExplorerUrl, txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.explorerLink}
            >
              View transaction <ExternalLink size={14} />
            </a>
          )}
          {phase === 'finalizing' && (
            <p className={styles.hint}>Transaction confirmed! Safe to close — we'll finish up automatically.</p>
          )}
        </div>
      );
    }

    // Success state
    if (phase === 'success') {
      const shareUrl = typeof window !== 'undefined' && agent.ownerHandle && agent.slug
        ? `${window.location.origin}/${agent.ownerHandle}/${agent.slug}`
        : '';
      const shareText = `I just published "${agent.name}" on Agentokratia! Check it out:`;

      const handleCopyLink = () => {
        navigator.clipboard.writeText(shareUrl);
      };

      const handleShareTwitter = () => {
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
        window.open(twitterUrl, '_blank', 'width=550,height=420');
      };

      return (
        <div className={styles.content}>
          <div className={styles.successIcon}>
            <Check size={32} />
          </div>
          <h3 className={styles.title}>Published!</h3>
          <p className={styles.subtitle}>
            Your agent is now live with verified on-chain identity.
          </p>
          {tokenId && (
            <div className={styles.tokenBadge}>
              Token #{tokenId}
            </div>
          )}
          {txHash && networkConfig && (
            <a
              href={getExplorerTxUrl(networkConfig.blockExplorerUrl, txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.explorerLink}
            >
              View on Explorer <ExternalLink size={14} />
            </a>
          )}
          {/* Enable Reviews CTA - prominently shown after publish */}
          {onEnableReviews && (
            <div className={styles.reviewsCta}>
              <div className={styles.reviewsCtaIcon}>
                <MessageSquare size={20} />
              </div>
              <div className={styles.reviewsCtaContent}>
                <h4>Enable Reviews</h4>
                <p>Let users leave on-chain reviews to build trust and credibility.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  handleOpenChange(false);
                  setTimeout(() => onEnableReviews(), 300);
                }}
              >
                Enable Now
              </Button>
            </div>
          )}

          <div className={styles.shareSection}>
            <p className={styles.shareLabel}>Share your agent</p>
            <div className={styles.shareButtons}>
              <button className={styles.shareBtn} onClick={handleShareTwitter} title="Share on X">
                <Twitter size={18} />
              </button>
              <button className={styles.shareBtn} onClick={handleCopyLink} title="Copy link">
                <Link2 size={18} />
              </button>
            </div>
          </div>
          <div className={styles.actions}>
            <Button onClick={() => handleOpenChange(false)} size="lg" fullWidth>
              Done
            </Button>
          </div>
        </div>
      );
    }

    // Error state
    if (phase === 'error') {
      return (
        <div className={styles.content}>
          <div className={styles.errorIcon}>
            <AlertCircle size={32} />
          </div>
          <h3 className={styles.title}>{error === 'Transaction cancelled' ? 'Cancelled' : 'Failed'}</h3>
          <p className={styles.subtitle}>{error}</p>
          <div className={styles.actions}>
            <Button variant="outline" onClick={() => setPhase('ready')}>
              Try again
            </Button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title="Publish Agent"
      size="sm"
    >
      {getPhaseContent()}
    </Modal>
  );
}
