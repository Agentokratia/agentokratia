'use client';

import { useState, useEffect } from 'react';
import { useAccount, useChainId, useSwitchChain, useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { Check, AlertCircle, Loader2, ExternalLink, Rocket, Wallet, Twitter, Link2, MessageSquare } from 'lucide-react';
import { Modal } from '@/components/ui/Modal/Modal';
import { Button } from '@/components/ui/Button/Button';
import { parseTokenIdFromLogs, useEstimateRegistrationFee } from '@/lib/erc8004/hooks';
import { IDENTITY_REGISTRY_ABI } from '@/lib/erc8004/contracts';
import { useNetworkConfig, getExplorerTxUrl } from '@/lib/network/client';
import { useAuthStore } from '@/lib/store';
import { config, type SupportedChainId } from '@/lib/web3/config';
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

type Status = 'idle' | 'processing' | 'success' | 'error';

const STORAGE_KEY = 'pending_publish';

interface Blocker {
  id: string;
  message: string;
  action?: string;
  onClick?: () => void;
}

export function PublishModal({ open, onOpenChange, agent, hasSigningKey, onPublished, onEnableReviews }: PublishModalProps) {
  const { token } = useAuthStore();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { formattedFee } = useEstimateRegistrationFee();
  const { data: networkConfig } = useNetworkConfig();

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [tokenId, setTokenId] = useState<string | null>(null);

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
      onClick: () => onOpenChange(false)
    });
  } else if (!isSupportedChain && networkConfig) {
    blockers.push({
      id: 'chain',
      message: `Switch to ${networkConfig.name}`,
      action: 'Switch',
      onClick: () => switchChain({ chainId: networkConfig.chainId })
    });
  }

  const isReady = blockers.length === 0;

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStatus('idle');
      setError(null);
      setTxHash(null);
      setTokenId(null);
    }
  }, [open]);

  // Check for pending transaction on mount (recovery)
  useEffect(() => {
    if (open && status === 'idle') {
      const pending = localStorage.getItem(STORAGE_KEY);
      if (pending) {
        try {
          const data = JSON.parse(pending);
          if (data.agentId === agent.id) {
            recoverPendingTransaction(data);
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    }
  }, [open, agent.id]);

  // Recovery function for pending transactions
  const recoverPendingTransaction = async (data: { txHash: string; chainId: number }) => {
    setStatus('processing');
    setTxHash(data.txHash);

    try {
      // Wait for receipt
      const receipt = await waitForTransactionReceipt(config, {
        hash: data.txHash as `0x${string}`,
        chainId: data.chainId as SupportedChainId,
      });

      const parsedTokenId = parseTokenIdFromLogs(receipt.logs);
      if (!parsedTokenId) throw new Error('Could not parse tokenId');

      // Confirm with backend
      await confirmPublish(data.txHash, parsedTokenId.toString(), data.chainId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery failed');
      setStatus('error');
    }
  };

  // Main publish flow - single async function, no useEffect chains
  const handlePublish = async () => {
    if (!token || !isReady || !networkConfig) return;

    setStatus('processing');
    setError(null);

    try {
      // Step 1: Prepare (get tokenURI from backend)
      const prepRes = await fetch(`/api/agents/${agent.id}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const prepData = await prepRes.json();
      if (!prepRes.ok) throw new Error(prepData.error || 'Failed to prepare');

      // Step 2: Sign transaction
      const hash = await writeContractAsync({
        address: networkConfig.identityRegistryAddress as `0x${string}`,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'register',
        args: [prepData.tokenURI],
      });

      setTxHash(hash);

      // Step 3: IMMEDIATELY save to localStorage (backup - survives browser crash)
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        agentId: agent.id,
        txHash: hash,
        chainId,
        timestamp: Date.now(),
      }));

      // Step 4: Wait for receipt
      const receipt = await waitForTransactionReceipt(config, { hash });

      // Step 5: Parse tokenId from receipt
      const parsedTokenId = parseTokenIdFromLogs(receipt.logs);
      if (!parsedTokenId) throw new Error('Could not verify on-chain registration');

      // Step 6: Confirm with backend (CRITICAL - links on-chain to off-chain)
      await confirmPublish(hash, parsedTokenId.toString(), chainId);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message.includes('rejected') ? 'Transaction cancelled' : message);
      setStatus('error');
      // Don't clear localStorage on error - might be recoverable
    }
  };

  // Confirm with backend - called from main flow or recovery
  const confirmPublish = async (hash: string, parsedTokenId: string, txChainId: number) => {
    const res = await fetch(`/api/agents/${agent.id}/publish/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        txHash: hash,
        chainId: txChainId,
        tokenId: parsedTokenId,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to confirm');

    // Success - clear localStorage and update state
    localStorage.removeItem(STORAGE_KEY);
    setTokenId(data.tokenId);
    setStatus('success');
    onPublished(data.tokenId, hash, txChainId);
  };

  const getContent = () => {
    // Idle state - show blockers or publish button
    if (status === 'idle') {
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

    // Processing state
    if (status === 'processing') {
      return (
        <div className={styles.content}>
          <div className={styles.progressIcon}>
            <Loader2 size={32} className={styles.spinner} />
          </div>
          <h3 className={styles.title}>Publishing...</h3>
          <p className={styles.subtitle}>Please confirm in your wallet and wait for confirmation.</p>
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
          <p className={styles.hint}>Safe to close — we&apos;ll finish up automatically.</p>
        </div>
      );
    }

    // Success state
    if (status === 'success') {
      const shareUrl = typeof window !== 'undefined' && agent.ownerHandle && agent.slug
        ? `${window.location.origin}/${agent.ownerHandle}/${agent.slug}`
        : '';
      const shareText = `I just published "${agent.name}" on Agentokratia! Check it out:`;

      const handleCopyLink = () => navigator.clipboard.writeText(shareUrl);

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
                  onOpenChange(false);
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
            <Button onClick={() => onOpenChange(false)} size="lg" fullWidth>
              Done
            </Button>
          </div>
        </div>
      );
    }

    // Error state
    if (status === 'error') {
      return (
        <div className={styles.content}>
          <div className={styles.errorIcon}>
            <AlertCircle size={32} />
          </div>
          <h3 className={styles.title}>{error === 'Transaction cancelled' ? 'Cancelled' : 'Failed'}</h3>
          <p className={styles.subtitle}>{error}</p>
          <div className={styles.actions}>
            <Button variant="outline" onClick={() => setStatus('idle')}>
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
      onOpenChange={onOpenChange}
      title="Publish Agent"
      size="sm"
    >
      {getContent()}
    </Modal>
  );
}
