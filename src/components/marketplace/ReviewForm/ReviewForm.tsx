'use client';

import { useState, useCallback, useEffect } from 'react';
import { Star, Loader2, Check, X, AlertCircle } from 'lucide-react';
import { useAccount, useWriteContract } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { REPUTATION_REGISTRY_ABI, FEEDBACK_TAGS } from '@/lib/erc8004/contracts';
import { useNetworkConfig, getExplorerTxUrl } from '@/lib/network/client';
import styles from './ReviewForm.module.css';

interface ReviewFormProps {
  agentId: string;
  tokenId: string;
  feedbackAuth: string;
  feedbackExpiry: string;
  onClose: () => void;
  onSuccess?: () => void;
}

type ReviewState = 'idle' | 'submitting_api' | 'submitting_chain' | 'success' | 'error';

// Tag labels derived from FEEDBACK_TAGS constant for consistency
const TAG_LABELS: Record<string, string> = {
  fast: 'Fast',
  accurate: 'Accurate',
  reliable: 'Reliable',
  helpful: 'Helpful',
  slow: 'Slow',
  buggy: 'Buggy',
  expensive: 'Expensive',
};

// Build tags from FEEDBACK_TAGS constant to ensure consistency with backend
const TAGS = Object.keys(FEEDBACK_TAGS)
  .filter((id) => TAG_LABELS[id])
  .map((id) => ({ id, label: TAG_LABELS[id] }));

export function ReviewForm({
  agentId,
  tokenId,
  feedbackAuth,
  feedbackExpiry,
  onClose,
  onSuccess,
}: ReviewFormProps) {
  const { address } = useAccount();
  const { data: networkConfig } = useNetworkConfig();
  const { writeContractAsync, isPending } = useWriteContract();
  const queryClient = useQueryClient();

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [state, setState] = useState<ReviewState>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-close after successful submission
  useEffect(() => {
    if (state === 'success') {
      const timer = setTimeout(() => {
        onClose();
      }, 3000); // Close after 3 seconds
      return () => clearTimeout(timer);
    }
  }, [state, onClose]);

  // Check if auth is expired
  const isExpired = feedbackExpiry ? Date.now() > parseInt(feedbackExpiry) * 1000 : false;

  // Convert 1-5 rating to 0-100 score
  const scoreFromRating = (r: number) => {
    // 1 star = 0, 2 stars = 25, 3 stars = 50, 4 stars = 75, 5 stars = 100
    return (r - 1) * 25;
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId].slice(0, 2)
    );
  };

  const handleSubmit = useCallback(async () => {
    if (!rating || !address || !networkConfig?.reputationRegistryAddress) return;

    setState('submitting_api');
    setError(null);

    try {
      const score = scoreFromRating(rating);

      // Step 1: Submit review to API to get fileuri and filehash
      const apiResponse = await fetch(`/api/marketplace/${agentId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackAuth,
          score,
          tag1: selectedTags[0] || null,
          tag2: selectedTags[1] || null,
        }),
      });

      if (!apiResponse.ok) {
        const errData = await apiResponse.json();
        throw new Error(errData.error || 'Failed to create review');
      }

      const { onchain } = await apiResponse.json();

      // Step 2: Submit on-chain with proper fileuri/filehash from API
      setState('submitting_chain');

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
      setState('success');

      // Invalidate queries to refresh reviews list and agent stats
      queryClient.invalidateQueries({ queryKey: ['reviews', agentId] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-agent', agentId] });

      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit review';
      if (message.includes('rejected') || message.includes('User rejected')) {
        setState('idle');
      } else {
        setError(message.includes('already') ? 'You have already reviewed this agent' : message);
        setState('error');
      }
    }
  }, [rating, address, networkConfig, tokenId, agentId, selectedTags, feedbackAuth, writeContractAsync, onSuccess]);

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
  if (state === 'success') {
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
          <Button onClick={onClose} variant="outline" size="sm">
            Close
          </Button>
        </div>
      </div>
    );
  }

  // Error state
  if (state === 'error') {
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
          <Button onClick={() => setState('idle')} variant="outline" size="sm">
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
                <Star size={28} fill={star <= (hoveredRating || rating) ? 'currentColor' : 'none'} />
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
            disabled={rating === 0 || isPending || state === 'submitting_api' || state === 'submitting_chain'}
            size="sm"
          >
            {state === 'submitting_api' ? (
              <>
                <Loader2 size={16} className={styles.spinner} />
                Creating review...
              </>
            ) : state === 'submitting_chain' || isPending ? (
              <>
                <Loader2 size={16} className={styles.spinner} />
                Confirm in wallet...
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
