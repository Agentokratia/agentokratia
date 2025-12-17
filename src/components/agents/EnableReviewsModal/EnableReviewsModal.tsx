'use client';

import { useState, useEffect } from 'react';
import { useAccount, useChainId, useSwitchChain, useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { Check, AlertCircle, Loader2, ExternalLink, MessageSquare } from 'lucide-react';
import { Modal } from '@/components/ui/Modal/Modal';
import { Button } from '@/components/ui/Button/Button';
import { useNetworkConfig, getExplorerTxUrl } from '@/lib/network/client';
import { useAuthStore } from '@/lib/store';
import { IDENTITY_REGISTRY_ABI } from '@/lib/erc8004/contracts';
import { config, type SupportedChainId } from '@/lib/web3/config';
import styles from './EnableReviewsModal.module.css';

interface EnableReviewsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  agentName: string;
  feedbackSignerAddress: string | null;
  chainId: number;
  onSuccess: () => void;
}

type Status = 'idle' | 'processing' | 'success' | 'error';

const STORAGE_KEY = 'pending_enable_reviews';

export function EnableReviewsModal({
  open,
  onOpenChange,
  agentId,
  agentName,
  feedbackSignerAddress: initialSignerAddress,
  chainId: agentChainId,
  onSuccess,
}: EnableReviewsModalProps) {
  const { token } = useAuthStore();
  const { isConnected } = useAccount();
  const walletChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: networkConfig } = useNetworkConfig();
  const { writeContractAsync } = useWriteContract();

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [signerAddress, setSignerAddress] = useState<string | null>(initialSignerAddress);

  const isSupportedChain = walletChainId === agentChainId;

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStatus('idle');
      setError(null);
      setTxHash(null);
      setSignerAddress(initialSignerAddress);
    }
  }, [open, initialSignerAddress]);

  // Check for pending transaction on mount (recovery)
  useEffect(() => {
    if (open && status === 'idle') {
      const pending = localStorage.getItem(STORAGE_KEY);
      if (pending) {
        try {
          const data = JSON.parse(pending);
          if (data.agentId === agentId) {
            recoverPendingTransaction(data);
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    }
  }, [open, agentId]);

  // Recovery function for pending transactions
  const recoverPendingTransaction = async (data: { txHash: string; chainId: number }) => {
    setStatus('processing');
    setTxHash(data.txHash);

    try {
      // Wait for receipt
      await waitForTransactionReceipt(config, {
        hash: data.txHash as `0x${string}`,
        chainId: data.chainId as SupportedChainId,
      });

      // Confirm with backend
      await confirmWithBackend(data.txHash, data.chainId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery failed');
      setStatus('error');
    }
  };

  // Main enable flow - single async function
  const handleEnable = async () => {
    if (!networkConfig?.identityRegistryAddress || !token) return;

    setStatus('processing');
    setError(null);

    try {
      // Step 1: Get signer address if not provided
      let currentSignerAddress = signerAddress;

      if (!currentSignerAddress) {
        const prepRes = await fetch(`/api/agents/${agentId}/reviews`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        if (!prepRes.ok) {
          const data = await prepRes.json();
          throw new Error(data.error || 'Failed to prepare');
        }

        const prepData = await prepRes.json();
        currentSignerAddress = prepData.feedbackSignerAddress;
        setSignerAddress(currentSignerAddress);
      }

      if (!currentSignerAddress) {
        throw new Error('No feedback signer address');
      }

      // Step 2: Sign transaction
      const hash = await writeContractAsync({
        address: networkConfig.identityRegistryAddress as `0x${string}`,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'setApprovalForAll',
        args: [currentSignerAddress as `0x${string}`, true],
      });

      setTxHash(hash);

      // Step 3: IMMEDIATELY save to localStorage (backup)
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        agentId,
        txHash: hash,
        chainId: agentChainId,
        timestamp: Date.now(),
      }));

      // Step 4: Wait for receipt
      await waitForTransactionReceipt(config, { hash });

      // Step 5: Confirm with backend (CRITICAL)
      await confirmWithBackend(hash, agentChainId);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enable reviews';
      if (message.includes('rejected') || message.includes('denied')) {
        setStatus('idle');
      } else {
        setError(message);
        setStatus('error');
      }
    }
  };

  // Confirm with backend
  const confirmWithBackend = async (hash: string, txChainId: number) => {
    const res = await fetch(`/api/agents/${agentId}/reviews/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        txHash: hash,
        chainId: txChainId,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to confirm');

    // Success - clear localStorage and update state
    localStorage.removeItem(STORAGE_KEY);
    setStatus('success');
    onSuccess();
  };

  const getContent = () => {
    if (status === 'idle') {
      if (!isConnected) {
        return (
          <div className={styles.content}>
            <div className={styles.icon}>
              <AlertCircle size={32} />
            </div>
            <h3 className={styles.title}>Connect Wallet</h3>
            <p className={styles.subtitle}>Connect your wallet to enable reviews.</p>
          </div>
        );
      }

      if (!isSupportedChain && networkConfig) {
        return (
          <div className={styles.content}>
            <div className={styles.icon}>
              <AlertCircle size={32} />
            </div>
            <h3 className={styles.title}>Wrong Network</h3>
            <p className={styles.subtitle}>Switch to {networkConfig.name} to continue.</p>
            <Button onClick={() => switchChain({ chainId: agentChainId })}>
              Switch Network
            </Button>
          </div>
        );
      }

      return (
        <div className={styles.content}>
          <div className={styles.iconReady}>
            <MessageSquare size={32} />
          </div>
          <h3 className={styles.title}>Enable Reviews</h3>
          <p className={styles.subtitle}>
            Allow users to leave on-chain reviews for <strong>{agentName}</strong>.
          </p>
          <p className={styles.description}>
            This transaction approves the platform to sign review authorizations on your behalf.
            Users who pay for your agent will be able to submit verified reviews.
          </p>
          <Button onClick={handleEnable} size="lg" fullWidth>
            Enable Reviews
          </Button>
        </div>
      );
    }

    if (status === 'processing') {
      return (
        <div className={styles.content}>
          <div className={styles.iconSpinner}>
            <Loader2 size={32} className={styles.spinner} />
          </div>
          <h3 className={styles.title}>Enabling Reviews...</h3>
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
        </div>
      );
    }

    if (status === 'success') {
      return (
        <div className={styles.content}>
          <div className={styles.iconSuccess}>
            <Check size={32} />
          </div>
          <h3 className={styles.title}>Reviews Enabled!</h3>
          <p className={styles.subtitle}>
            Users can now leave on-chain reviews for your agent.
          </p>
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
          <Button onClick={() => onOpenChange(false)} fullWidth>
            Done
          </Button>
        </div>
      );
    }

    if (status === 'error') {
      return (
        <div className={styles.content}>
          <div className={styles.iconError}>
            <AlertCircle size={32} />
          </div>
          <h3 className={styles.title}>Failed</h3>
          <p className={styles.subtitle}>{error}</p>
          <Button onClick={() => setStatus('idle')} variant="outline">
            Try Again
          </Button>
        </div>
      );
    }

    return null;
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Enable Reviews" size="sm">
      {getContent()}
    </Modal>
  );
}
