'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useChainId, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Check, AlertCircle, Loader2, ExternalLink, MessageSquare } from 'lucide-react';
import { Modal } from '@/components/ui/Modal/Modal';
import { Button } from '@/components/ui/Button/Button';
import { useNetworkConfig, getExplorerTxUrl } from '@/lib/network/client';
import { useAuthStore } from '@/lib/store';
import { IDENTITY_REGISTRY_ABI } from '@/lib/erc8004/contracts';
import styles from './EnableReviewsModal.module.css';

interface EnableReviewsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  agentName: string;
  feedbackSignerAddress: string | null; // Can be null if not yet prepared
  chainId: number;
  onSuccess: () => void;
}

type Phase = 'ready' | 'preparing' | 'signing' | 'confirming' | 'finalizing' | 'success' | 'error';

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
  const { writeContractAsync, data: txHash, reset: resetWrite } = useWriteContract();

  const [phase, setPhase] = useState<Phase>('ready');
  const [error, setError] = useState<string | null>(null);
  const [signerAddress, setSignerAddress] = useState<string | null>(initialSignerAddress);

  const isSupportedChain = walletChainId === agentChainId;

  // Wait for transaction confirmation
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Handle transaction confirmation - call confirm API
  useEffect(() => {
    if (isConfirmed && txHash && phase === 'confirming') {
      confirmWithBackend(txHash);
    }
  }, [isConfirmed, txHash, phase]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setPhase('ready');
      setError(null);
      setSignerAddress(initialSignerAddress);
      resetWrite();
    }
  }, [open, resetWrite, initialSignerAddress]);

  // Confirm the transaction with backend
  const confirmWithBackend = async (hash: string) => {
    setPhase('finalizing');

    try {
      const res = await fetch(`/api/agents/${agentId}/reviews/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          txHash: hash,
          chainId: agentChainId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to confirm');
      }

      setPhase('success');
      onSuccess();
    } catch {
      // Even if confirm fails, the tx succeeded - just show success
      setPhase('success');
      onSuccess();
    }
  };

  const handleEnable = useCallback(async () => {
    if (!networkConfig?.identityRegistryAddress) return;

    setPhase('preparing');
    setError(null);

    try {
      // Step 1: Call prepare API to get feedbackSignerAddress
      let currentSignerAddress = signerAddress;

      if (!currentSignerAddress) {
        const prepareRes = await fetch(`/api/agents/${agentId}/reviews`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        if (!prepareRes.ok) {
          const data = await prepareRes.json();
          throw new Error(data.error || 'Failed to prepare');
        }

        const prepareData = await prepareRes.json();
        currentSignerAddress = prepareData.feedbackSignerAddress;
        setSignerAddress(currentSignerAddress);
      }

      if (!currentSignerAddress) {
        throw new Error('No feedback signer address');
      }

      // Step 2: Sign the transaction
      setPhase('signing');

      await writeContractAsync({
        address: networkConfig.identityRegistryAddress as `0x${string}`,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'setApprovalForAll',
        args: [currentSignerAddress as `0x${string}`, true],
      });

      // Step 3: Wait for confirmation (handled by useEffect above)
      setPhase('confirming');

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enable reviews';
      if (message.includes('rejected') || message.includes('denied')) {
        setPhase('ready');
      } else {
        setError(message);
        setPhase('error');
      }
    }
  }, [networkConfig, signerAddress, writeContractAsync, agentId, token]);

  const handleClose = () => {
    onOpenChange(false);
  };

  const getContent = () => {
    if (phase === 'ready') {
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

    if (phase === 'preparing') {
      return (
        <div className={styles.content}>
          <div className={styles.iconSpinner}>
            <Loader2 size={32} className={styles.spinner} />
          </div>
          <h3 className={styles.title}>Preparing...</h3>
          <p className={styles.subtitle}>Setting up reviews configuration</p>
        </div>
      );
    }

    if (phase === 'signing') {
      return (
        <div className={styles.content}>
          <div className={styles.iconSpinner}>
            <Loader2 size={32} className={styles.spinner} />
          </div>
          <h3 className={styles.title}>Sign Transaction</h3>
          <p className={styles.subtitle}>Please confirm in your wallet</p>
        </div>
      );
    }

    if (phase === 'confirming' || phase === 'finalizing') {
      return (
        <div className={styles.content}>
          <div className={styles.iconSpinner}>
            <Loader2 size={32} className={styles.spinner} />
          </div>
          <h3 className={styles.title}>{phase === 'confirming' ? 'Confirming...' : 'Finalizing...'}</h3>
          <p className={styles.subtitle}>
            {phase === 'confirming' ? 'Waiting for blockchain confirmation' : 'Almost done...'}
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
        </div>
      );
    }

    if (phase === 'success') {
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
          <Button onClick={handleClose} fullWidth>
            Done
          </Button>
        </div>
      );
    }

    if (phase === 'error') {
      return (
        <div className={styles.content}>
          <div className={styles.iconError}>
            <AlertCircle size={32} />
          </div>
          <h3 className={styles.title}>Failed</h3>
          <p className={styles.subtitle}>{error}</p>
          <Button onClick={() => setPhase('ready')} variant="outline">
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
