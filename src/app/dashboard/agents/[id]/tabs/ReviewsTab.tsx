'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Star,
  ExternalLink,
  Loader2,
  User,
  MessageSquare,
  Send,
  X,
  AlertCircle,
} from 'lucide-react';
import { Button, Textarea } from '@/components/ui';
import { formatRelativeTime } from '@/lib/utils/format';
import { useAuthStore } from '@/lib/store/authStore';
import { Agent } from '../page';
import styles from './tabs.module.css';
import reviewStyles from './ReviewsTab.module.css';

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
  stats: {
    avgScore: number;
    avgRating: number;
    reviewCount: number;
    distribution: {
      5: number;
      4: number;
      3: number;
      2: number;
      1: number;
    };
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
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

interface Props {
  agent: Agent;
  blockExplorerUrl?: string;
  reviewsEnabled: boolean;
  isCheckingReviews: boolean;
  onEnableReviews: () => void;
}

async function fetchReviews(agentId: string, token: string, page: number): Promise<ReviewsResponse> {
  const res = await fetch(`/api/agents/${agentId}/reviews?page=${page}&limit=10&sort=recent`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch reviews');
  return res.json();
}

async function respondToReview(
  agentId: string,
  reviewId: string,
  response: string,
  token: string
): Promise<void> {
  const res = await fetch(`/api/agents/${agentId}/reviews/${reviewId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ response }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to save response');
  }
}

export default function ReviewsTab({ agent, blockExplorerUrl, reviewsEnabled, isCheckingReviews, onEnableReviews }: Props) {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['agent-reviews', agent.id, token, page],
    queryFn: () => fetchReviews(agent.id, token!, page),
    enabled: !!token,
    staleTime: 30_000,
  });

  const respondMutation = useMutation({
    mutationFn: (params: { reviewId: string; response: string }) =>
      respondToReview(agent.id, params.reviewId, params.response, token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-reviews', agent.id] });
      setRespondingTo(null);
      setResponseText('');
    },
  });

  const handleRespond = (reviewId: string) => {
    if (!responseText.trim()) return;
    respondMutation.mutate({ reviewId, response: responseText.trim() });
  };

  const getExplorerUrl = (txHash: string) => {
    if (!blockExplorerUrl || !txHash) return null;
    return `${blockExplorerUrl}/tx/${txHash}`;
  };

  // Agent not published yet (no on-chain identity)
  if (!agent.erc8004TokenId) {
    return (
      <div className={styles.panel}>
        <div className={reviewStyles.emptyState}>
          <AlertCircle size={32} />
          <h3>Reviews not available</h3>
          <p>Reviews will be available after you publish your agent.</p>
        </div>
      </div>
    );
  }

  // Agent is published but reviews not enabled on-chain yet
  // This shows when: published but either no feedbackSigner OR signer exists but not approved on-chain
  if (!reviewsEnabled && !isCheckingReviews) {
    return (
      <div className={styles.panel}>
        <div className={reviewStyles.enableReviewsCta}>
          <div className={reviewStyles.enableReviewsIcon}>
            <MessageSquare size={28} />
          </div>
          <div className={reviewStyles.enableReviewsContent}>
            <h3>Enable Reviews to Build Trust</h3>
            <p>
              Reviews help users discover quality agents and build confidence before making API calls.
              Agents with reviews typically see <strong>3x more usage</strong>.
            </p>
            <ul className={reviewStyles.benefitsList}>
              <li>On-chain verified reviews users can trust</li>
              <li>Respond to feedback and engage with users</li>
              <li>Higher visibility in marketplace rankings</li>
            </ul>
          </div>
          <div className={reviewStyles.enableReviewsAction}>
            <Button onClick={onEnableReviews} size="lg">
              <MessageSquare size={18} />
              Enable Reviews
            </Button>
            <span className={reviewStyles.txNote}>One-time transaction required</span>
          </div>
        </div>
      </div>
    );
  }

  // Still checking on-chain status
  if (isCheckingReviews) {
    return (
      <div className={styles.panel}>
        <div className={reviewStyles.loading}>
          <Loader2 size={24} className={reviewStyles.spinner} />
          <span>Checking reviews status...</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.panel}>
        <div className={reviewStyles.loading}>
          <Loader2 size={24} className={reviewStyles.spinner} />
          <span>Loading reviews...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.panel}>
        <div className={reviewStyles.emptyState}>
          <AlertCircle size={32} />
          <p>Failed to load reviews</p>
        </div>
      </div>
    );
  }

  const reviews = data?.reviews || [];
  const stats = data?.stats;
  const pagination = data?.pagination;

  return (
    <div className={styles.panel}>
      {/* Stats Summary */}
      {stats && stats.reviewCount > 0 && (
        <div className={reviewStyles.statsCard}>
          <div className={reviewStyles.statsMain}>
            <div className={reviewStyles.avgRating}>
              <span className={reviewStyles.avgValue}>{stats.avgRating.toFixed(1)}</span>
              <div className={reviewStyles.avgStars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={16}
                    fill={star <= Math.round(stats.avgRating) ? '#fbbf24' : 'none'}
                    stroke={star <= Math.round(stats.avgRating) ? '#fbbf24' : '#d1d5db'}
                  />
                ))}
              </div>
              <span className={reviewStyles.reviewCount}>{stats.reviewCount} reviews</span>
            </div>
          </div>
          <div className={reviewStyles.distribution}>
            {([5, 4, 3, 2, 1] as const).map((rating) => {
              const count = stats.distribution[rating];
              const pct = stats.reviewCount > 0 ? Math.round((count / stats.reviewCount) * 100) : 0;
              return (
                <div key={rating} className={reviewStyles.barRow}>
                  <span className={reviewStyles.barLabel}>{rating}</span>
                  <div className={reviewStyles.bar}>
                    <div className={reviewStyles.barFill} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={reviewStyles.barPct}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reviews List */}
      {reviews.length === 0 ? (
        <div className={reviewStyles.emptyState}>
          <MessageSquare size={32} />
          <h3>No reviews yet</h3>
          <p>Reviews will appear here when users rate your agent.</p>
        </div>
      ) : (
        <div className={reviewStyles.reviewsList}>
          {reviews.map((review) => (
            <div key={review.id} className={reviewStyles.reviewCard}>
              <div className={reviewStyles.reviewHeader}>
                <div className={reviewStyles.reviewer}>
                  <div className={reviewStyles.avatar}>
                    <User size={16} />
                  </div>
                  <span className={reviewStyles.reviewerName}>
                    {review.reviewerHandle || review.reviewerAddress}
                  </span>
                  <span className={reviewStyles.date}>
                    {formatRelativeTime(review.createdAt)}
                  </span>
                </div>
                <div className={reviewStyles.stars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={14}
                      fill={star <= review.stars ? '#fbbf24' : 'none'}
                      stroke={star <= review.stars ? '#fbbf24' : '#d1d5db'}
                    />
                  ))}
                </div>
              </div>

              {review.title && (
                <h4 className={reviewStyles.reviewTitle}>{review.title}</h4>
              )}

              {review.content && (
                <p className={reviewStyles.reviewContent}>{review.content}</p>
              )}

              <div className={reviewStyles.reviewMeta}>
                <div className={reviewStyles.tags}>
                  {review.tag1 && (
                    <span className={reviewStyles.tag}>{TAG_DISPLAY[review.tag1] || review.tag1}</span>
                  )}
                  {review.tag2 && (
                    <span className={reviewStyles.tag}>{TAG_DISPLAY[review.tag2] || review.tag2}</span>
                  )}
                </div>
                {review.txHash && (
                  <a
                    href={getExplorerUrl(review.txHash) || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={reviewStyles.txLink}
                    title="Verified on-chain"
                  >
                    <ExternalLink size={12} />
                    <span>On-chain</span>
                  </a>
                )}
              </div>

              {/* Owner Response */}
              {review.response ? (
                <div className={reviewStyles.ownerResponse}>
                  <div className={reviewStyles.responseHeader}>
                    <span className={reviewStyles.responseLabel}>Your response</span>
                    <span className={reviewStyles.responseDate}>
                      {review.responseAt && formatRelativeTime(review.responseAt)}
                    </span>
                  </div>
                  <p className={reviewStyles.responseContent}>{review.response}</p>
                </div>
              ) : (
                <div className={reviewStyles.respondSection}>
                  {respondingTo === review.id ? (
                    <div className={reviewStyles.respondForm}>
                      <Textarea
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        placeholder="Write a response to this review..."
                        rows={3}
                        maxLength={1000}
                      />
                      <div className={reviewStyles.respondActions}>
                        <span className={reviewStyles.charCount}>
                          {responseText.length}/1000
                        </span>
                        <div className={reviewStyles.respondButtons}>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setRespondingTo(null);
                              setResponseText('');
                            }}
                          >
                            <X size={14} />
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleRespond(review.id)}
                            loading={respondMutation.isPending}
                            disabled={!responseText.trim()}
                          >
                            <Send size={14} />
                            Send
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      className={reviewStyles.respondBtn}
                      onClick={() => setRespondingTo(review.id)}
                    >
                      <MessageSquare size={14} />
                      Respond to this review
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total > pagination.limit && (
        <div className={reviewStyles.pagination}>
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className={reviewStyles.pageInfo}>
            Page {page} of {Math.ceil(pagination.total / pagination.limit)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!pagination.hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
