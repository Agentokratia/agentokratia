import { http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';

// WalletConnect Project ID - get one from https://cloud.walletconnect.com/
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_ID || 'demo';

// Always use testnet (Base Sepolia) first, mainnet second
const chains = [baseSepolia, base] as const;

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

// Export supported chain IDs type for use in components
export type SupportedChainId = (typeof chains)[number]['id'];
