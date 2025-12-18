'use client';

import { useState, useEffect } from 'react';
import { Star, Loader2, Check, X, AlertCircle } from 'lucide-react';
import { useAccount, useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { REPUTATION_REGISTRY_ABI, FEEDBACK_TAGS } from '@/lib/erc8004/contracts';
import { useNetworkConfig, getExplorerTxUrl } from '@/lib/network/client';
import { config, type SupportedChainId } from '@/lib/web3/config';
import styles from './ReviewForm.module.css';

interface ReviewFormProps {
  ownerHandle: string;
  agentSlug: string;
  tokenId: string;
  feedbackAuth: string;
  feedbackExpiry: string;
  onClose: () => void;
  onSuccess?: () => void;
}

type Status = 'idle' | 'processing' | 'success' | 'error';

const STORAGE_KEY = 'pending_review';

const TAG_LABELS: Record<string, string> = {
  fast: 'Fast',
  accurate: 'Accurate',
  reliable: 'Reliable',
  helpful: 'Helpful',
  slow: 'Slow',
  buggy: 'Buggy',
  expensive: 'Expensive',
};

const TAGS = Object.keys(FEEDBACK_TAGS)
  .filter((id) => TAG_LABELS[id])
  .map((id) => ({ id, label: TAG_LABELS[id] }));

export function ReviewForm({
  ownerHandle,
  agentSlug,
  tokenId,
  feedbackAuth,
  feedbackExpiry,
  onClose,
  onSuccess,
}: ReviewFormProps) {
  const { address } = useAccount();
  const { data: networkConfig } = useNetworkConfig();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isExpired = feedbackExpiry ? Date.now() > parseInt(feedbackExpiry) * 1000 : false;

  // Convert 1-5 rating to 0-100 score
  const scoreFromRating = (r: number) => (r - 1) * 25;

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId].slice(0, 2)
    );
  };

  // Check for pending transaction on mount (recovery)
  useEffect(() => {
    const pending = localStorage.getItem(STORAGE_KEY);
    if (pending) {
      try {
        const data = JSON.parse(pending);
        if (data.ownerHandle === ownerHandle && data.agentSlug === agentSlug) {
          recoverPendingTransaction(data);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [ownerHandle, agentSlug]);

  // Recovery function for pending transactions
  const recoverPendingTransaction = async (data: {
    txHash: string;
    reviewId: string;
    chainId: number;
  }) => {
    setStatus('processing');
    setTxHash(data.txHash);

    try {
      // Wait for receipt
      await waitForTransactionReceipt(config, {
        hash: data.txHash as `0x${string}`,
        chainId: data.chainId as SupportedChainId,
      });

      // Confirm with backend
      await confirmReview(data.reviewId, data.txHash, data.chainId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery failed');
      setStatus('error');
    }
  };

  // Main submit flow - single async function
  const handleSubmit = async () => {
    if (!rating || !address || !networkConfig?.reputationRegistryAddress) return;

    setStatus('processing');
    setError(null);

    try {
      const score = scoreFromRating(rating);

      // Step 1: Create review in backend (get fileuri and filehash)
      const apiRes = await fetch(`/api/marketplace/${ownerHandle}/${agentSlug}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackAuth,
          score,
          tag1: selectedTags[0] || null,
          tag2: selectedTags[1] || null,
        }),
      });

      if (!apiRes.ok) {
        const errData = await apiRes.json();
        throw new Error(errData.error || 'Failed to create review');
      }

      const { review, onchain } = await apiRes.json();

      // Step 2: Sign transaction
      const hash = await writeContractAsync({
        address: networkConfig.reputationRegistryAddress as `0x${string}`,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'giveFeedback',
        args: [
          BigInt(tokenId),
          score,
          onchain.tag1 as `0x${string}`,
          onchain.tag2 as `0x${string}`,
          onchain.fileuri,
          onchain.filehash as `0x${string}`,
          feedbackAuth as `0x${string}`,
        ],
      });

      setTxHash(hash);

      // Step 3: IMMEDIATELY save to localStorage (backup)
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ownerHandle,
          agentSlug,
          reviewId: review.id,
          txHash: hash,
          chainId: networkConfig.chainId,
          timestamp: Date.now(),
        })
      );

      // Step 4: Wait for receipt
      await waitForTransactionReceipt(config, { hash });

      // Step 5: Confirm with backend (CRITICAL)
      await confirmReview(review.id, hash, networkConfig.chainId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit review';
      if (message.includes('rejected') || message.includes('User rejected')) {
        setStatus('idle');
      } else {
        setError(message.includes('already') ? 'You have already reviewed this agent' : message);
        setStatus('error');
      }
    }
  };

  // Confirm with backend
  const confirmReview = async (reviewId: string, hash: string, chainId: number) => {
    const res = await fetch(`/api/marketplace/${ownerHandle}/${agentSlug}/reviews`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewId, txHash: hash, chainId }),
    });

    if (!res.ok) {
      console.error('Failed to confirm review:', await res.text());
      // Don't throw - tx succeeded, just log the error
    }

    // Success - clear localStorage and update state
    localStorage.removeItem(STORAGE_KEY);
    setStatus('success');

    // Invalidate queries to refresh reviews list
    queryClient.invalidateQueries({ queryKey: ['reviews', ownerHandle, agentSlug] });
    queryClient.invalidateQueries({ queryKey: ['agent', ownerHandle, agentSlug] });
  };

  // Expired auth
  if (isExpired) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3 className={styles.title}>Review Expired</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className={styles.expiredContent}>
          <AlertCircle size={32} className={styles.expiredIcon} />
          <p>Your review authorization has expired. Make another API call to get a new one.</p>
        </div>
      </div>
    );
  }

  // Success state
  if (status === 'success') {
    const handleDone = () => {
      onSuccess?.();
      onClose();
    };

    return (
      <div className={styles.container}>
        <div className={styles.successContent}>
          <div className={styles.successIcon}>
            <Check size={24} />
          </div>
          <h3 className={styles.successTitle}>Review Submitted!</h3>
          <p className={styles.successDesc}>
            Your on-chain review has been recorded. Thank you for your feedback!
          </p>
          {txHash && networkConfig && (
            <a
              href={getExplorerTxUrl(networkConfig.blockExplorerUrl, txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.txLink}
            >
              View on Explorer
            </a>
          )}
          <Button onClick={handleDone} size="sm">
            Done
          </Button>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3 className={styles.title}>Review Failed</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className={styles.errorContent}>
          <AlertCircle size={32} className={styles.errorIcon} />
          <p>{error}</p>
          <Button onClick={() => setStatus('idle')} variant="outline" size="sm">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Leave a Review</h3>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className={styles.content}>
        {/* Star Rating */}
        <div className={styles.ratingSection}>
          <label className={styles.label}>Rating</label>
          <div className={styles.stars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                className={`${styles.starBtn} ${star <= (hoveredRating || rating) ? styles.active : ''}`}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                onClick={() => setRating(star)}
                type="button"
              >
                <Star
                  size={28}
                  fill={star <= (hoveredRating || rating) ? 'currentColor' : 'none'}
                />
              </button>
            ))}
          </div>
          <span className={styles.ratingText}>
            {rating === 0 && 'Select a rating'}
            {rating === 1 && 'Poor'}
            {rating === 2 && 'Fair'}
            {rating === 3 && 'Good'}
            {rating === 4 && 'Great'}
            {rating === 5 && 'Excellent'}
          </span>
        </div>

        {/* Tags */}
        <div className={styles.tagsSection}>
          <label className={styles.label}>
            Tags <span className={styles.optional}>(optional, max 2)</span>
          </label>
          <div className={styles.tags}>
            {TAGS.map((tag) => (
              <button
                key={tag.id}
                className={`${styles.tag} ${selectedTags.includes(tag.id) ? styles.selected : ''}`}
                onClick={() => toggleTag(tag.id)}
                type="button"
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className={styles.actions}>
          <Button onClick={onClose} variant="outline" size="sm">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={rating === 0 || status === 'processing'}
            size="sm"
          >
            {status === 'processing' ? (
              <>
                <Loader2 size={16} className={styles.spinner} />
                Processing...
              </>
            ) : (
              'Submit Review'
            )}
          </Button>
        </div>

        <p className={styles.note}>
          Reviews are stored on-chain and cannot be modified. One review per payment.
        </p>
      </div>
    </div>
  );
}
