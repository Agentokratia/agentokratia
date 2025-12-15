# Agentokratia Frontend Architecture

> Reference document for frontend implementation. All agents and developers should follow these conventions.

## Table of Contents
1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Folder Structure](#folder-structure)
4. [Design System](#design-system)
5. [Component Patterns](#component-patterns)
6. [State Management](#state-management)
7. [API Integration](#api-integration)
8. [Web3 Integration](#web3-integration)
9. [Pages & Routing](#pages--routing)
10. [Authentication Flow](#authentication-flow)
11. [Coding Conventions](#coding-conventions)

---

## Overview

Agentokratia is a marketplace for AI agents to discover, purchase, and consume APIs with crypto payments. The frontend serves two user types:

1. **API Providers** - List and monetize their APIs
2. **API Consumers** (AI Agents/Developers) - Discover and pay for API calls

### Core Principles
- **Simplicity over complexity** - MVP-focused, avoid over-engineering
- **Existing design system** - Reuse styles from `public/styles.css`
- **Headless components** - Use Radix UI only for complex interactions
- **Type safety** - TypeScript everywhere
- **Web3-native** - Wallet-first authentication

---

## Tech Stack

### Core
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14.x | Framework (App Router) |
| TypeScript | 5.x | Type safety |
| React | 18.x | UI library |

### Styling
| Technology | Purpose |
|------------|---------|
| CSS Modules | Component-scoped styles |
| CSS Variables | Design tokens (from existing system) |

### State Management
| Technology | Purpose |
|------------|---------|
| Zustand | Global client state (wallet, user, UI) |
| TanStack Query | Server state, caching, mutations |

### Web3
| Technology | Version | Purpose |
|------------|---------|---------|
| wagmi | 2.x | React hooks for Ethereum |
| viem | 2.x | TypeScript Ethereum library |
| @rainbow-me/rainbowkit | 2.x | Wallet connection UI |

### UI Components
| Technology | Purpose |
|------------|---------|
| Radix UI | Headless primitives (Dialog, Dropdown, Toast) |
| Lucide React | Icons |

### Development
| Technology | Purpose |
|------------|---------|
| ESLint | Code linting |
| Prettier | Code formatting |

---

## Folder Structure

```
frontend/
├── public/
│   ├── fonts/
│   └── images/
│
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Landing page
│   │   ├── globals.css         # Global styles + CSS variables
│   │   │
│   │   ├── marketplace/
│   │   │   ├── page.tsx        # Browse APIs
│   │   │   └── [id]/
│   │   │       └── page.tsx    # API detail
│   │   │
│   │   ├── dashboard/
│   │   │   ├── layout.tsx      # Dashboard layout (sidebar)
│   │   │   ├── page.tsx        # Overview
│   │   │   ├── apis/
│   │   │   │   ├── page.tsx    # My APIs list
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx # Create API
│   │   │   │   └── [id]/
│   │   │   │       └── edit/
│   │   │   │           └── page.tsx # Edit API
│   │   │   ├── usage/
│   │   │   │   └── page.tsx    # Usage analytics
│   │   │   ├── earnings/
│   │   │   │   └── page.tsx    # Earnings & payouts
│   │   │   └── settings/
│   │   │       └── page.tsx    # Account settings
│   │   │
│   │   └── api/                # API routes (if needed)
│   │       └── health/
│   │           └── route.ts
│   │
│   ├── components/
│   │   ├── ui/                 # Base UI components
│   │   │   ├── Button/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Button.module.css
│   │   │   │   └── index.ts
│   │   │   ├── Card/
│   │   │   ├── Input/
│   │   │   ├── Badge/
│   │   │   ├── Modal/
│   │   │   ├── Toast/
│   │   │   ├── Dropdown/
│   │   │   └── ...
│   │   │
│   │   ├── layout/             # Layout components
│   │   │   ├── Navbar/
│   │   │   ├── Footer/
│   │   │   ├── Sidebar/
│   │   │   └── MobileMenu/
│   │   │
│   │   ├── features/           # Feature-specific components
│   │   │   ├── marketplace/
│   │   │   │   ├── ApiCard/
│   │   │   │   ├── ApiFilters/
│   │   │   │   ├── ApiSearch/
│   │   │   │   └── PricingDisplay/
│   │   │   │
│   │   │   ├── dashboard/
│   │   │   │   ├── StatsCard/
│   │   │   │   ├── UsageChart/
│   │   │   │   ├── ApiForm/
│   │   │   │   └── EarningsTable/
│   │   │   │
│   │   │   └── wallet/
│   │   │       ├── ConnectButton/
│   │   │       ├── WalletInfo/
│   │   │       └── BalanceDisplay/
│   │   │
│   │   └── providers/          # Context providers
│   │       ├── Web3Provider.tsx
│   │       ├── QueryProvider.tsx
│   │       └── ToastProvider.tsx
│   │
│   ├── hooks/                  # Custom React hooks
│   │   ├── useApi.ts           # API CRUD operations
│   │   ├── useMarketplace.ts   # Marketplace queries
│   │   ├── useUser.ts          # User data
│   │   ├── useEarnings.ts      # Earnings data
│   │   └── useMediaQuery.ts    # Responsive breakpoints
│   │
│   ├── lib/                    # Utilities and config
│   │   ├── api/
│   │   │   ├── client.ts       # API client (fetch wrapper)
│   │   │   ├── endpoints.ts    # API endpoint definitions
│   │   │   └── types.ts        # API response types
│   │   │
│   │   ├── web3/
│   │   │   ├── config.ts       # wagmi config
│   │   │   ├── chains.ts       # Supported chains
│   │   │   └── contracts.ts    # Contract ABIs & addresses
│   │   │
│   │   ├── utils/
│   │   │   ├── format.ts       # Formatting helpers
│   │   │   ├── validation.ts   # Form validation
│   │   │   └── constants.ts    # App constants
│   │   │
│   │   └── store/              # Zustand stores
│   │       ├── useAuthStore.ts
│   │       ├── useUiStore.ts
│   │       └── index.ts
│   │
│   └── types/                  # TypeScript types
│       ├── api.ts              # API entity types
│       ├── user.ts             # User types
│       └── common.ts           # Shared types
│
├── .env.local                  # Environment variables
├── .env.example                # Example env file
├── next.config.js
├── tsconfig.json
├── package.json
└── README.md
```

---

## Design System

### CSS Variables (from existing styles.css)

Port these to `globals.css`:

```css
:root {
  /* Core Colors */
  --ink: #1A1A1A;
  --stone: #6B6B6B;
  --sand: #E5E5E2;
  --cloud: #F2F2EF;
  --paper: #FAFAF8;
  --white: #FFFFFF;

  /* Accent Colors */
  --success: #22C55E;
  --success-light: rgba(34, 197, 94, 0.1);
  --error: #EF4444;
  --error-light: rgba(239, 68, 68, 0.1);
  --warning: #F59E0B;
  --warning-light: rgba(245, 158, 11, 0.1);
  --info: #3B82F6;
  --info-light: rgba(59, 130, 246, 0.1);

  /* Typography */
  --font-serif: 'Newsreader', serif;
  --font-sans: 'DM Sans', sans-serif;
  --font-mono: 'Space Mono', monospace;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  --space-3xl: 64px;

  /* Border Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 9999px;
}
```

### Typography Scale

| Element | Font | Size | Weight | Line Height |
|---------|------|------|--------|-------------|
| h1 | Newsreader | 48px | 400 | 1.2 |
| h2 | Newsreader | 32px | 400 | 1.3 |
| h3 | Newsreader | 24px | 400 | 1.4 |
| h4 | DM Sans | 18px | 600 | 1.4 |
| body | DM Sans | 16px | 400 | 1.6 |
| small | DM Sans | 14px | 400 | 1.5 |
| caption | DM Sans | 12px | 400 | 1.4 |
| code | Space Mono | 13px | 400 | 1.5 |

### Component Variants

#### Buttons
- `btn-primary` - Black background, white text (primary actions)
- `btn-secondary` - White background, border (secondary actions)
- `btn-success` - Green background (confirm/success actions)
- `btn-outline` - Transparent with border (tertiary actions)
- Sizes: `btn-sm`, default, `btn-lg`

#### Badges
- `badge-success` - Green (active, online, verified)
- `badge-warning` - Orange (pending, beta)
- `badge-error` - Red (error, failed)
- `badge-info` - Blue (info, new)

#### Cards
- Default card with white background, sand border, radius-lg
- Card header with flex layout for title + actions

---

## Component Patterns

### File Structure per Component

```
Button/
├── Button.tsx          # Component implementation
├── Button.module.css   # Scoped styles
└── index.ts            # Re-export
```

### Component Template

```tsx
// Button/Button.tsx
import { forwardRef } from 'react';
import styles from './Button.module.css';
import { cn } from '@/lib/utils/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          styles.button,
          styles[variant],
          styles[size],
          loading && styles.loading,
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <span className={styles.spinner} /> : children}
      </button>
    );
  }
);

Button.displayName = 'Button';
```

```ts
// Button/index.ts
export { Button } from './Button';
export type { ButtonProps } from './Button';
```

### Radix UI Integration

Use Radix for complex interactive components:

```tsx
// Modal/Modal.tsx
import * as Dialog from '@radix-ui/react-dialog';
import styles from './Modal.module.css';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ open, onOpenChange, title, children }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>{title}</Dialog.Title>
          {children}
          <Dialog.Close className={styles.close}>
            <X size={20} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

---

## State Management

### Zustand Stores

#### Auth Store
```tsx
// lib/store/useAuthStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  isAuthenticated: boolean;
  walletAddress: string | null;
  user: User | null;
  setUser: (user: User | null) => void;
  setWalletAddress: (address: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      walletAddress: null,
      user: null,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setWalletAddress: (walletAddress) => set({ walletAddress }),
      logout: () => set({ user: null, walletAddress: null, isAuthenticated: false }),
    }),
    { name: 'auth-storage' }
  )
);
```

#### UI Store
```tsx
// lib/store/useUiStore.ts
import { create } from 'zustand';

interface UiState {
  sidebarOpen: boolean;
  mobileMenuOpen: boolean;
  toggleSidebar: () => void;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  mobileMenuOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleMobileMenu: () => set((state) => ({ mobileMenuOpen: !state.mobileMenuOpen })),
  closeMobileMenu: () => set({ mobileMenuOpen: false }),
}));
```

### TanStack Query

For server state (API data):

```tsx
// hooks/useMarketplace.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export function useMarketplaceApis(filters?: ApiFilters) {
  return useQuery({
    queryKey: ['marketplace', 'apis', filters],
    queryFn: () => apiClient.get('/apis', { params: filters }),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useApiDetail(id: string) {
  return useQuery({
    queryKey: ['api', id],
    queryFn: () => apiClient.get(`/apis/${id}`),
    enabled: !!id,
  });
}
```

---

## API Integration

### API Client

```tsx
// lib/api/client.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, ...fetchOptions } = options;

    let url = `${this.baseUrl}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams}`;
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
    });

    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }

    return response.json();
  }

  get<T>(endpoint: string, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, data?: unknown, options?: RequestOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  put<T>(endpoint: string, data?: unknown, options?: RequestOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  delete<T>(endpoint: string, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
```

### Endpoints

```tsx
// lib/api/endpoints.ts
export const ENDPOINTS = {
  // Auth
  AUTH_NONCE: '/auth/nonce',
  AUTH_VERIFY: '/auth/verify',
  AUTH_ME: '/auth/me',

  // APIs
  APIS: '/apis',
  API_DETAIL: (id: string) => `/apis/${id}`,
  MY_APIS: '/apis/mine',

  // Usage
  USAGE: '/usage',
  USAGE_BY_API: (id: string) => `/usage/api/${id}`,

  // Earnings
  EARNINGS: '/earnings',
  PAYOUTS: '/payouts',
} as const;
```

---

## Web3 Integration

### wagmi Config

```tsx
// lib/web3/config.ts
import { http, createConfig } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_ID!;

export const config = createConfig({
  chains: [base, baseSepolia],
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'Agentokratia' }),
    walletConnect({ projectId }),
  ],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
});
```

### Web3 Provider

```tsx
// components/providers/Web3Provider.tsx
'use client';

import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { config } from '@/lib/web3/config';

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#1A1A1A',
            borderRadius: 'medium',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

### Authentication Flow

Wallet-based authentication using SIWE (Sign-In with Ethereum):

```tsx
// hooks/useWalletAuth.ts
import { useAccount, useSignMessage } from 'wagmi';
import { SiweMessage } from 'siwe';
import { useAuthStore } from '@/lib/store/useAuthStore';
import { apiClient } from '@/lib/api/client';

export function useWalletAuth() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { setUser, setWalletAddress, logout } = useAuthStore();

  const signIn = async () => {
    if (!address) return;

    // 1. Get nonce from backend
    const { nonce } = await apiClient.get<{ nonce: string }>('/auth/nonce');

    // 2. Create SIWE message
    const message = new SiweMessage({
      domain: window.location.host,
      address,
      statement: 'Sign in to Agentokratia',
      uri: window.location.origin,
      version: '1',
      chainId: 8453, // Base
      nonce,
    });

    // 3. Sign message
    const signature = await signMessageAsync({
      message: message.prepareMessage(),
    });

    // 4. Verify with backend
    const { user } = await apiClient.post<{ user: User }>('/auth/verify', {
      message: message.prepareMessage(),
      signature,
    });

    setUser(user);
    setWalletAddress(address);
  };

  return { signIn, logout, isConnected, address };
}
```

---

## Pages & Routing

### Public Pages
| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Marketing page, hero, features |
| `/marketplace` | Browse | Search and filter APIs |
| `/marketplace/[id]` | Detail | API details, pricing, docs |

### Protected Pages (require wallet)
| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | Overview | Stats, recent activity |
| `/dashboard/apis` | My APIs | List of user's APIs |
| `/dashboard/apis/new` | Create API | API creation form |
| `/dashboard/apis/[id]/edit` | Edit API | Edit existing API |
| `/dashboard/usage` | Usage | API usage analytics |
| `/dashboard/earnings` | Earnings | Revenue, payouts |
| `/dashboard/settings` | Settings | Account settings |

### Route Protection

```tsx
// components/providers/AuthGuard.tsx
'use client';

import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (!isConnected) {
      router.push('/');
    }
  }, [isConnected, router]);

  if (!isConnected) {
    return null; // or loading spinner
  }

  return <>{children}</>;
}
```

---

## Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         AUTHENTICATION FLOW                      │
└─────────────────────────────────────────────────────────────────┘

1. User clicks "Connect Wallet"
         │
         ▼
2. RainbowKit modal opens
         │
         ▼
3. User selects wallet (MetaMask, Coinbase, etc.)
         │
         ▼
4. Wallet connected → useAccount returns address
         │
         ▼
5. Frontend requests nonce from backend
   GET /auth/nonce
         │
         ▼
6. Frontend creates SIWE message with nonce
         │
         ▼
7. User signs message in wallet
         │
         ▼
8. Frontend sends signature to backend
   POST /auth/verify { message, signature }
         │
         ▼
9. Backend verifies signature, creates/finds user
         │
         ▼
10. Backend returns user + session token
         │
         ▼
11. Frontend stores in Zustand + localStorage
         │
         ▼
12. User is authenticated, can access dashboard
```

---

## Coding Conventions

### TypeScript
- Enable strict mode
- Explicit return types on functions
- Use interfaces for object shapes, types for unions
- No `any` - use `unknown` if type is truly unknown

### React
- Functional components only
- Use `forwardRef` for components accepting refs
- Destructure props in function signature
- Use early returns for conditional rendering

### Naming
- **Components**: PascalCase (`Button.tsx`, `ApiCard.tsx`)
- **Hooks**: camelCase with `use` prefix (`useApi.ts`)
- **Utilities**: camelCase (`formatCurrency.ts`)
- **CSS Modules**: camelCase classes (`.buttonPrimary`)
- **Constants**: SCREAMING_SNAKE_CASE

### File Organization
- One component per file
- Co-locate styles with components
- Index files for re-exports only
- Group by feature in `components/features/`

### CSS
- Use CSS variables for all colors, spacing, fonts
- Mobile-first responsive design
- Use CSS Modules for component styles
- Global styles only in `globals.css`

### Imports Order
```tsx
// 1. React
import { useState, useEffect } from 'react';

// 2. External libraries
import { useQuery } from '@tanstack/react-query';

// 3. Internal components
import { Button } from '@/components/ui/Button';

// 4. Hooks
import { useApi } from '@/hooks/useApi';

// 5. Utils/lib
import { formatCurrency } from '@/lib/utils/format';

// 6. Types
import type { Api } from '@/types/api';

// 7. Styles
import styles from './Component.module.css';
```

---

## MVP Implementation Order

### Phase 1: Foundation
1. Project setup (Next.js, TypeScript, dependencies)
2. Design system (globals.css, base components)
3. Layout components (Navbar, Footer, Sidebar)
4. Web3 provider setup

### Phase 2: Public Pages
5. Landing page
6. Marketplace browse page
7. API detail page

### Phase 3: Dashboard
8. Dashboard layout with sidebar
9. Dashboard overview
10. My APIs list + create/edit forms

### Phase 4: Core Features
11. Usage analytics page
12. Earnings page
13. Settings page

### Phase 5: Polish
14. Loading states, error handling
15. Mobile responsiveness
16. Performance optimization

---

## Backend API Requirements

### Overview

The frontend requires a backend API for:
1. **Off-chain agent metadata** (name, description, logo, docs)
2. **Usage analytics** (call logs, earnings tracking)
3. **Marketplace search** (indexed agent data)

On-chain data (via smart contracts):
- Agent ownership (ERC-721 token)
- Agent ID, price, payment address
- Total calls, total earned (updated by x402 facilitator)

### API Endpoints Required

#### Authentication
```
POST /api/auth/nonce
  → { nonce: string }

POST /api/auth/verify
  ← { message: string, signature: string }
  → { token: string, user: { address, createdAt } }

GET /api/auth/me
  Headers: Authorization: Bearer <token>
  → { user: { address, createdAt } }
```

#### Agents (Provider Dashboard)
```
GET /api/agents
  Headers: Authorization: Bearer <token>
  → { agents: Agent[] }

POST /api/agents
  Headers: Authorization: Bearer <token>
  ← { name, description, endpoint, pricePerCall, category }
  → { agent: Agent, txHash: string, setupInstructions: {...} }

GET /api/agents/:id
  → { agent: Agent }

PUT /api/agents/:id
  Headers: Authorization: Bearer <token>
  ← { endpoint?, pricePerCall?, active?, description? }
  → { agent: Agent }

DELETE /api/agents/:id
  Headers: Authorization: Bearer <token>
  → { success: boolean }

GET /api/agents/:id/stats
  Headers: Authorization: Bearer <token>
  Query: ?period=24h|7d|30d
  → { calls, earnings, uniqueCallers, avgResponseTime, errorRate, callsOverTime[] }
```

#### Marketplace (Public)
```
GET /api/marketplace
  Query: ?category=&search=&sortBy=calls|rating|price|newest&offset=0&limit=20
  → { agents: MarketplaceAgent[], total: number, hasMore: boolean }

GET /api/marketplace/:id
  → { agent: MarketplaceAgent, endpoint, schema?, examples? }

GET /api/marketplace/categories
  → { categories: [{ id, name, count }] }
```

#### Payments & Earnings
```
GET /api/earnings
  Headers: Authorization: Bearer <token>
  Query: ?period=24h|7d|30d
  → { total, pending, paid, history[] }

GET /api/earnings/by-agent
  Headers: Authorization: Bearer <token>
  → { agents: [{ agentId, name, earnings, calls }] }

POST /api/payouts
  Headers: Authorization: Bearer <token>
  ← { amount, destinationAddress }
  → { txHash, status }
```

#### Call Logs (for analytics)
```
GET /api/calls
  Headers: Authorization: Bearer <token>
  Query: ?agentId=&limit=50&offset=0
  → { calls: CallLog[], total: number }

# Called by x402 middleware after successful payment
POST /api/calls/log
  Headers: X-API-Key: <internal-key>
  ← { agentId, callerAddress, amount, txHash, responseTimeMs, success }
  → { success: boolean }
```

### Data Types

```typescript
interface Agent {
  id: string                    // Internal DB ID
  tokenId: number              // On-chain ERC-721 token ID
  owner: string                // Wallet address
  name: string
  description: string
  endpoint: string
  pricePerCall: string         // USDC amount (e.g., "0.05")
  category: string
  active: boolean
  logoUrl?: string
  documentationUrl?: string
  apiSchema?: object           // OpenAPI schema
  stats: {
    totalCalls: number
    totalEarned: string        // USDC amount
    avgResponseTime: number    // ms
    rating?: number            // 1-5 (post-MVP)
  }
  createdAt: string
  updatedAt: string
}

interface MarketplaceAgent {
  id: string
  tokenId: number
  name: string
  description: string
  pricePerCall: string
  category: string
  owner: string
  logoUrl?: string
  stats: {
    totalCalls: number
    rating?: number
  }
}

interface CallLog {
  id: string
  agentId: string
  callerAddress: string
  amount: string
  txHash: string
  responseTimeMs: number
  success: boolean
  createdAt: string
}

interface Earnings {
  total: string               // Total earned (USDC)
  pending: string             // Pending payout
  paid: string                // Already paid out
  history: {
    date: string
    amount: string
    type: 'earning' | 'payout'
    txHash?: string
  }[]
}
```

### Data Storage Strategy (Hybrid)

| Data | Storage | Reason |
|------|---------|--------|
| Agent ownership | On-chain (ERC-721) | Proof of ownership |
| Agent ID | On-chain | Unique identifier |
| Price per call | On-chain | x402 reads this |
| Payment address | On-chain | x402 sends payments here |
| Name, description | Off-chain (DB) | Frequently updated, searchable |
| Logo, docs URL | Off-chain (DB) | Large data |
| API schema | Off-chain (DB) | Complex object |
| Call logs | Off-chain (DB) | High volume, analytics |
| Total calls/earned | Both | On-chain = source of truth, DB = cache |

### Backend Tech Stack Options

**Option A: Next.js API Routes (Simplest)**
- Use existing Next.js app
- API routes in `/app/api/`
- Good for MVP, may need to split later

**Option B: Separate Express/Fastify Backend**
- Dedicated API server
- Better separation of concerns
- Required if x402 middleware needs to call back

**Option C: Supabase + Edge Functions**
- Managed PostgreSQL
- Built-in auth (can integrate with wallet)
- Edge functions for custom logic

**Recommendation for MVP:** Option A (Next.js API routes) + Supabase for database

### On-Chain Contract Reads

For data that lives on-chain, use viem directly:

```typescript
// lib/contracts/registry.ts
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { REGISTRY_ABI, REGISTRY_ADDRESS } from './abi'

const client = createPublicClient({
  chain: base,
  transport: http()
})

export async function getAgentOnChain(tokenId: number) {
  return client.readContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'agents',
    args: [BigInt(tokenId)]
  })
}

export async function getAgentsByOwner(ownerAddress: string) {
  return client.readContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'getAgentsByOwner',
    args: [ownerAddress as `0x${string}`]
  })
}
```

### Syncing On-Chain & Off-Chain Data

**Option 1: Event Indexing (Recommended)**
- Listen to `AgentRegistered`, `AgentUpdated`, `CallRecorded` events
- Update DB when events occur
- Use services like Alchemy, The Graph, or custom indexer

**Option 2: On-Demand Reads**
- Read from chain when needed
- Cache in DB
- Simpler but slower

**Option 3: Hybrid**
- Read from DB for list views (fast)
- Read from chain for detail views (accurate)
- Sync periodically

---

## Environment Variables

```env
# .env.local

# API
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# Web3
NEXT_PUBLIC_WALLETCONNECT_ID=your_project_id
NEXT_PUBLIC_CHAIN_ID=8453
NEXT_PUBLIC_REGISTRY_ADDRESS=0x...

# Database (server-side only)
DATABASE_URL=postgres://...
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...

# x402 (server-side only)
X402_FACILITATOR_ADDRESS=0x...
INTERNAL_API_KEY=...

# Analytics (optional)
NEXT_PUBLIC_UMAMI_WEBSITE_ID=your_umami_id
```

---

## Commands

```bash
# Development
npm run dev

# Build
npm run build

# Start production
npm start

# Lint
npm run lint

# Type check
npm run type-check
```
