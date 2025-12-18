'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { MessageSquarePlus, X, Send, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/lib/store/authStore';
import styles from './FeedbackWidget.module.css';

type Category = 'bug' | 'feature' | 'other';

interface FeedbackWidgetProps {
  placement?: 'left' | 'right';
}

export function FeedbackWidget({ placement = 'right' }: FeedbackWidgetProps) {
  const { address } = useAccount();
  const { token } = useAuthStore();

  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<Category>('feature');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError('');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          walletAddress: address,
          category,
          message,
          pageUrl: window.location.href,
        }),
      });

      if (!res.ok) throw new Error('Failed to submit');

      setSubmitted(true);
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
        setMessage('');
        setCategory('feature');
      }, 2000);
    } catch {
      setError('Failed to submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`${styles.trigger} ${styles[placement]}`}
        aria-label="Send feedback"
      >
        <MessageSquarePlus size={18} />
        Feedback
      </button>

      {isOpen && (
        <div className={styles.overlay} onClick={() => setIsOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.header}>
              <h2 className={styles.title}>Send Feedback</h2>
              <button onClick={() => setIsOpen(false)} className={styles.close}>
                <X size={20} />
              </button>
            </div>

            {submitted ? (
              <div className={styles.success}>
                <p>Thanks for your feedback!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.categories}>
                  {(['feature', 'bug', 'other'] as Category[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`${styles.category} ${category === cat ? styles.active : ''}`}
                    >
                      {cat === 'feature' && '💡'}
                      {cat === 'bug' && '🐛'}
                      {cat === 'other' && '💬'}
                      <span>{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                    </button>
                  ))}
                </div>

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    category === 'bug'
                      ? "What's broken? Please describe the issue..."
                      : category === 'feature'
                        ? 'What would make this better? Describe your idea...'
                        : "What's on your mind?"
                  }
                  className={styles.textarea}
                  rows={4}
                  required
                  autoFocus
                />

                {error && <p className={styles.error}>{error}</p>}

                <button
                  type="submit"
                  disabled={!message.trim() || isSubmitting}
                  className={styles.submit}
                >
                  {isSubmitting ? (
                    <Loader2 size={18} className={styles.spinner} />
                  ) : (
                    <Send size={18} />
                  )}
                  {isSubmitting ? 'Sending...' : 'Send Feedback'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
