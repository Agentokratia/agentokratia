'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Star, ExternalLink, Loader2, ChevronDown, User, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/Button/Button';
import { formatRelativeTime } from '@/lib/utils/format';
import styles from './ReviewsList.module.css';

interface Review {
  id: string;
  score: number;
  stars: number;
  title: string | null;
  content: string | null;
  tag1: string | null;
  tag2: string | null;
  reviewerAddress: string;
  reviewerHandle: string | null;
  feedbackIndex: number | null;
  txHash: string | null;
  chainId: number | null;
  response: string | null;
  responseAt: string | null;
  createdAt: string;
}

interface ReviewsResponse {
  reviews: Review[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

interface ReviewsListProps {
  ownerHandle: string;
  agentSlug: string;
  chainId?: number | null;
  blockExplorerUrl?: string;
}

// Tag display names
const TAG_DISPLAY: Record<string, string> = {
  fast: 'Fast',
  accurate: 'Accurate',
  reliable: 'Reliable',
  helpful: 'Helpful',
  slow: 'Slow',
  buggy: 'Buggy',
  expensive: 'Expensive',
};

async function fetchReviews(ownerHandle: string, agentSlug: string, page: number): Promise<ReviewsResponse> {
  const res = await fetch(`/api/marketplace/${ownerHandle}/${agentSlug}/reviews?page=${page}&limit=10&sort=recent`);
  if (!res.ok) throw new Error('Failed to fetch reviews');
  return res.json();
}

export function ReviewsList({ ownerHandle, agentSlug, chainId, blockExplorerUrl }: ReviewsListProps) {
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['reviews', ownerHandle, agentSlug, page],
    queryFn: () => fetchReviews(ownerHandle, agentSlug, page),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Loader2 size={20} className={styles.spinner} />
        <span>Loading reviews...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        Failed to load reviews
      </div>
    );
  }

  const reviews = data?.reviews || [];
  const pagination = data?.pagination;

  if (reviews.length === 0) {
    return (
      <div className={styles.empty}>
        <MessageSquare size={32} />
        <p>No reviews yet</p>
        <span>Be the first to review this agent after using it!</span>
      </div>
    );
  }

  const getExplorerUrl = (txHash: string) => {
    if (!blockExplorerUrl || !txHash) return null;
    return `${blockExplorerUrl}/tx/${txHash}`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.reviewsList}>
        {reviews.map((review) => (
          <div key={review.id} className={styles.reviewCard}>
            <div className={styles.reviewHeader}>
              <div className={styles.reviewer}>
                <div className={styles.avatar}>
                  <User size={16} />
                </div>
                <span className={styles.reviewerName}>
                  {review.reviewerHandle || review.reviewerAddress}
                </span>
              </div>
              <div className={styles.stars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={14}
                    fill={star <= review.stars ? '#fbbf24' : 'none'}
                    stroke={star <= review.stars ? '#fbbf24' : 'currentColor'}
                  />
                ))}
              </div>
            </div>

            {review.title && (
              <h4 className={styles.reviewTitle}>{review.title}</h4>
            )}

            {review.content && (
              <p className={styles.reviewContent}>{review.content}</p>
            )}

            <div className={styles.reviewMeta}>
              <div className={styles.tags}>
                {review.tag1 && (
                  <span className={styles.tag}>{TAG_DISPLAY[review.tag1] || review.tag1}</span>
                )}
                {review.tag2 && (
                  <span className={styles.tag}>{TAG_DISPLAY[review.tag2] || review.tag2}</span>
                )}
              </div>
              <div className={styles.metaRight}>
                <span className={styles.date}>
                  {formatRelativeTime(review.createdAt)}
                </span>
                {review.txHash && (
                  <a
                    href={getExplorerUrl(review.txHash) || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.txLink}
                    title="View on blockchain"
                  >
                    <ExternalLink size={12} />
                    <span>On-chain</span>
                  </a>
                )}
              </div>
            </div>

            {/* Agent Owner Response */}
            {review.response && (
              <div className={styles.ownerResponse}>
                <span className={styles.responseLabel}>Owner response:</span>
                <p className={styles.responseContent}>{review.response}</p>
                {review.responseAt && (
                  <span className={styles.responseDate}>
                    {formatRelativeTime(review.responseAt)}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.total > pagination.limit && (
        <div className={styles.pagination}>
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >
            Previous
          </Button>
          <span className={styles.pageInfo}>
            Page {page} of {Math.ceil(pagination.total / pagination.limit)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!pagination.hasMore}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
