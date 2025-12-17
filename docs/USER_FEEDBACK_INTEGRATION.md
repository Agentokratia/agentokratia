# User Feedback Integration Strategy

Lightweight approaches to capture actionable feedback without over-engineering.

---

## Recommended: Tier 1 (Launch Day)

### 1. Feedback Widget (5 min setup)

**Use [Canny](https://canny.io) or [Featurebase](https://featurebase.app)** - both have free tiers.

```tsx
// components/FeedbackButton.tsx
'use client';

import { MessageSquarePlus } from 'lucide-react';

export function FeedbackButton() {
  return (
    <a
      href="https://agentokratia.canny.io/feedback"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 bg-ink text-white px-4 py-2 rounded-full
                 flex items-center gap-2 text-sm font-medium shadow-lg
                 hover:bg-gray-800 transition-colors z-50"
    >
      <MessageSquarePlus size={18} />
      Feedback
    </a>
  );
}
```

Add to `app/layout.tsx` inside the auth-protected section.

**Why this works:**
- Users vote on features (prioritization for free)
- Public roadmap builds trust
- No backend work needed
- Captures structured feedback (bug vs feature request)

---

### 2. In-App Micro-Surveys (NPS/CSAT)

Trigger contextual feedback at key moments:

```tsx
// components/FeedbackPrompt.tsx
'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface FeedbackPromptProps {
  trigger: 'first_api_published' | 'first_payment_received' | 'session_count_5';
  userId: string;
}

export function FeedbackPrompt({ trigger, userId }: FeedbackPromptProps) {
  const [visible, setVisible] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const storageKey = `feedback_${trigger}_${userId}`;

  useEffect(() => {
    const alreadyShown = localStorage.getItem(storageKey);
    if (!alreadyShown) {
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [storageKey]);

  const handleSubmit = async () => {
    localStorage.setItem(storageKey, 'true');

    // Send to your analytics or a simple webhook
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger, userId, rating }),
    });

    setSubmitted(true);
    setTimeout(() => setVisible(false), 2000);
  };

  const dismiss = () => {
    localStorage.setItem(storageKey, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  const prompts: Record<string, string> = {
    first_api_published: 'How easy was it to publish your first API?',
    first_payment_received: 'How satisfied are you with the payment experience?',
    session_count_5: 'How likely are you to recommend Agentokratia?',
  };

  return (
    <div className="fixed bottom-24 right-6 bg-white border border-sand rounded-xl
                    shadow-xl p-4 w-80 z-50 animate-in slide-in-from-bottom-4">
      <button onClick={dismiss} className="absolute top-3 right-3 text-stone hover:text-ink">
        <X size={16} />
      </button>

      {!submitted ? (
        <>
          <p className="text-sm font-medium text-ink mb-3">{prompts[trigger]}</p>
          <div className="flex gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className={`w-10 h-10 rounded-lg border text-sm font-medium transition-colors
                  ${rating === n
                    ? 'bg-ink text-white border-ink'
                    : 'bg-cloud text-stone border-sand hover:border-ink'
                  }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-stone mb-3">
            <span>Not at all</span>
            <span>Very much</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!rating}
            className="w-full py-2 bg-ink text-white rounded-lg text-sm font-medium
                       disabled:bg-sand disabled:cursor-not-allowed"
          >
            Submit
          </button>
        </>
      ) : (
        <p className="text-sm text-center text-stone py-4">Thanks for your feedback!</p>
      )}
    </div>
  );
}
```

**Trigger points:**
| Event | When | Question Type |
|-------|------|---------------|
| `first_api_published` | After first successful publish | Effort score (1-5) |
| `first_payment_received` | After first USDC received | Satisfaction (1-5) |
| `session_count_5` | 5th session | NPS (0-10) |

---

### 3. Simple Webhook Backend (Optional)

If you want to collect feedback in Supabase:

```sql
-- Migration: feedback_responses table
CREATE TABLE feedback_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  trigger TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_trigger ON feedback_responses(trigger);
CREATE INDEX idx_feedback_created ON feedback_responses(created_at DESC);
```

```ts
// app/api/feedback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase';

export async function POST(request: NextRequest) {
  const { trigger, userId, rating, comment } = await request.json();

  await supabaseAdmin.from('feedback_responses').insert({
    user_id: userId,
    trigger,
    rating,
    comment,
  });

  return NextResponse.json({ ok: true });
}
```

---

## Tier 2 (Week 2-4)

### 4. Exit Intent Survey

Capture why users leave without completing key actions:

```tsx
// hooks/useExitIntent.ts
import { useEffect, useCallback } from 'react';

export function useExitIntent(onExit: () => void) {
  const handleMouseLeave = useCallback((e: MouseEvent) => {
    if (e.clientY <= 0) {
      onExit();
    }
  }, [onExit]);

  useEffect(() => {
    document.addEventListener('mouseleave', handleMouseLeave);
    return () => document.removeEventListener('mouseleave', handleMouseLeave);
  }, [handleMouseLeave]);
}
```

Use sparingly - only on critical pages (publish flow, pricing page).

---

### 5. Session Recording (Optional)

**Use [PostHog](https://posthog.com)** (generous free tier, self-hostable):
- Session replays show where users struggle
- Funnels show drop-off points
- No code changes needed beyond snippet

```tsx
// app/providers.tsx - add to existing providers
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';

if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: 'https://app.posthog.com',
    capture_pageview: false, // We capture manually for SPA
  });
}
```

---

## Tier 3 (Month 2+)

### 6. In-App Chat (Intercom Alternative)

**Use [Crisp](https://crisp.chat)** - free for 2 seats:
- Live chat for urgent issues
- Saved replies for common questions
- Integrates with Slack

---

## Quick Wins Without Code

| Method | Setup Time | Value |
|--------|-----------|-------|
| Discord/Slack community | 10 min | Direct user conversations |
| Twitter/X mentions monitoring | 5 min | Public sentiment |
| Email "Reply to this email" | 0 min | Already built into transactional emails |
| Google Form link in footer | 5 min | Long-form feedback |

---

## Recommended Launch Stack

**Day 1:**
1. Canny feedback board (free) - link in app footer
2. FeedbackButton component (floating button)

**Week 1:**
3. Micro-survey after first API publish

**Week 2:**
4. PostHog for session recordings

**Total engineering time: ~2 hours**

---

## Metrics to Track

| Metric | Target | How to Measure |
|--------|--------|----------------|
| NPS Score | > 30 | In-app survey at session 5 |
| First API publish rate | > 40% | PostHog funnel |
| Time to first publish | < 10 min | Event timestamps |
| Feature request votes | Top 5 weekly | Canny dashboard |

---

## Anti-Patterns to Avoid

1. **Popup fatigue** - Max 1 feedback prompt per session
2. **Too many questions** - Keep surveys to 1-2 questions
3. **No follow-up** - Close the loop when you ship requested features
4. **Ignoring negative feedback** - Low ratings should trigger founder outreach
5. **Building feedback infrastructure** - Use existing tools, don't reinvent

---

## Sample User Journey

```
Connect Wallet → SIWE Sign → [New User: Invite Code + Handle]
                                        ↓
                              Dashboard (first visit)
                                        ↓
                              Create First API
                                        ↓
                              Publish API ← [Trigger: first_api_published survey]
                                        ↓
                              First Payment ← [Trigger: first_payment_received survey]
                                        ↓
                              Session 5 ← [Trigger: NPS survey]
```

---

## Implementation Priority

```
[ ] Add Canny/Featurebase board
[ ] Add FeedbackButton to dashboard layout
[ ] Create feedback_responses table (optional)
[ ] Add FeedbackPrompt after first publish
[ ] Set up PostHog (week 2)
```
