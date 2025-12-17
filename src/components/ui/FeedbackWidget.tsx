'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { useAccount } from 'wagmi';
import { useAuthStore } from '@/lib/store/authStore';

declare global {
  interface Window {
    Featurebase: {
      (...args: unknown[]): void;
      q?: unknown[];
    };
  }
}

interface FeedbackWidgetProps {
  placement?: 'left' | 'right';
}

export function FeedbackWidget({ placement = 'right' }: FeedbackWidgetProps) {
  const { address } = useAccount();
  const { user } = useAuthStore();

  useEffect(() => {
    if (typeof window.Featurebase !== 'function') {
      window.Featurebase = function (...args: unknown[]) {
        (window.Featurebase.q = window.Featurebase.q || []).push(args);
      };
    }

    window.Featurebase('initialize_feedback_widget', {
      organization: 'agentokratiacom',
      theme: 'light',
      placement,
      defaultBoard: 'feature-requests',
      ...(user?.email && { email: user.email }),
      metadata: {
        ...(address && { walletAddress: address }),
        ...(user?.handle && { handle: user.handle }),
        userType: user ? 'creator' : address ? 'consumer' : 'visitor',
      },
    });
  }, [placement, address, user?.email, user?.handle, user]);

  return <Script src="https://do.featurebase.app/js/sdk.js" id="featurebase-sdk" />;
}
