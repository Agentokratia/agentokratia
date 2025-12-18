'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, Theme, lightTheme } from '@rainbow-me/rainbowkit';
import { useState, useEffect } from 'react';
import { config } from '@/lib/web3/config';
import '@rainbow-me/rainbowkit/styles.css';

// Suppress wallet extension errors in development
if (typeof window !== 'undefined') {
  const originalError = console.error;
  console.error = (...args) => {
    const message = args[0]?.toString() || '';
    // Suppress chrome extension errors
    if (
      message.includes('chrome.runtime.sendMessage') ||
      message.includes('Extension ID') ||
      message.includes('inpage.js')
    ) {
      return;
    }
    originalError.apply(console, args);
  };

  // Suppress unhandled extension errors from showing in Next.js overlay
  window.addEventListener('error', (event) => {
    if (
      event.message?.includes('chrome.runtime.sendMessage') ||
      event.message?.includes('Extension ID') ||
      event.filename?.includes('inpage.js') ||
      event.filename?.includes('chrome-extension')
    ) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || event.reason?.toString() || '';
    if (message.includes('chrome.runtime.sendMessage') || message.includes('Extension ID')) {
      event.preventDefault();
    }
  });
}

// Custom theme matching Agentokratia brand guidelines
const agentokratiaTheme: Theme = {
  ...lightTheme(),
  colors: {
    ...lightTheme().colors,
    accentColor: '#1A1A1A', // Ink - primary button color
    accentColorForeground: '#FFFFFF', // White text on buttons
    connectButtonBackground: '#1A1A1A', // Ink
    connectButtonBackgroundError: '#EF4444', // Error red
    connectButtonInnerBackground: '#F2F2EF', // Cloud
    connectButtonText: '#FFFFFF', // White
    connectButtonTextError: '#FFFFFF',
    modalBackground: '#FFFFFF', // White
    modalBorder: '#E5E5E2', // Sand
    modalText: '#1A1A1A', // Ink
    modalTextDim: '#6B6B6B', // Stone
    modalTextSecondary: '#6B6B6B', // Stone
    profileAction: '#FAFAF8', // Paper
    profileActionHover: '#F2F2EF', // Cloud
    profileForeground: '#F2F2EF', // Cloud
    generalBorder: '#E5E5E2', // Sand
    generalBorderDim: '#F2F2EF', // Cloud
    selectedOptionBorder: '#1A1A1A', // Ink
    actionButtonBorder: '#E5E5E2', // Sand
    actionButtonBorderMobile: '#E5E5E2', // Sand
    actionButtonSecondaryBackground: '#F2F2EF', // Cloud
    closeButton: '#6B6B6B', // Stone
    closeButtonBackground: '#F2F2EF', // Cloud
    connectionIndicator: '#22C55E', // Success green
    downloadBottomCardBackground: '#FAFAF8', // Paper
    downloadTopCardBackground: '#FFFFFF', // White
    error: '#EF4444', // Error red
    menuItemBackground: '#F2F2EF', // Cloud
    standby: '#F59E0B', // Warning amber
  },
  fonts: {
    body: "'DM Sans', sans-serif",
  },
  radii: {
    ...lightTheme().radii,
    actionButton: '8px',
    connectButton: '8px',
    menuButton: '8px',
    modal: '16px',
    modalMobile: '16px',
  },
  shadows: {
    connectButton: '0 2px 8px rgba(0, 0, 0, 0.08)',
    dialog: '0 8px 32px rgba(0, 0, 0, 0.12)',
    profileDetailsAction: '0 2px 4px rgba(0, 0, 0, 0.04)',
    selectedOption: '0 2px 8px rgba(0, 0, 0, 0.08)',
    selectedWallet: '0 2px 8px rgba(0, 0, 0, 0.08)',
    walletLogo: '0 2px 8px rgba(0, 0, 0, 0.08)',
  },
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={agentokratiaTheme}
          modalSize="compact"
          appInfo={{
            appName: 'Agentokratia',
            learnMoreUrl: 'https://agentokratia.com',
          }}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
