import { http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';

// WalletConnect Project ID - get one from https://cloud.walletconnect.com/
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_ID || 'demo';

// Use testnet first in development, mainnet first in production
const isDevelopment = process.env.NODE_ENV === 'development';
const chains = isDevelopment
  ? [baseSepolia, base] as const  // Testnet first for dev
  : [base, baseSepolia] as const; // Mainnet first for prod

export const config = getDefaultConfig({
  appName: 'Agentokratia',
  projectId,
  chains,
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
  ssr: true,
});
