# Agentokratia

A marketplace for AI agents and APIs with pay-per-call pricing. Turn any API into an agent-ready service, set your price, and get paid in stablecoins (USDC on Base).

## Features

- **Wallet-based authentication** - Sign in with Ethereum (SIWE)
- **Agent marketplace** - Browse and discover AI agents
- **Pay-per-call pricing** - No subscriptions, pay only for what you use
- **Stablecoin payments** - USDC on Base network
- **Creator dashboard** - Manage your agents, view analytics, track payments

## Tech Stack

- [Next.js 16](https://nextjs.org/) - React framework
- [RainbowKit](https://www.rainbowkit.com/) - Wallet connection
- [wagmi](https://wagmi.sh/) - React hooks for Ethereum
- [viem](https://viem.sh/) - TypeScript Ethereum library
- [Supabase](https://supabase.com/) - Backend and database
- [TanStack Query](https://tanstack.com/query) - Data fetching

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- A wallet (MetaMask, Coinbase Wallet, etc.)

### Installation

```bash
# Clone the repository
git clone https://github.com/Agentokratia/agentokratia
cd agentokratia

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
```

### Environment Variables

Create a `.env.local` file with the following variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
```

### Development

```bash
# Start the development server
npm run dev

# Run type checking
npm run type-check

# Run linting
npm run lint
```

### Database (Supabase)

```bash
# Start local Supabase
npm run db:start

# Stop local Supabase
npm run db:stop

# Reset database
npm run db:reset

# Run migrations
npm run db:migrate
```

### Build

```bash
npm run build
npm run start
```

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── dashboard/          # Creator dashboard
│   ├── marketplace/        # Public marketplace
│   └── [handle]/[slug]/    # Agent detail pages
├── components/             # React components
│   ├── layout/             # Layout components
│   └── ui/                 # UI components
└── lib/                    # Utilities and helpers
    ├── auth/               # Authentication (SIWE)
    ├── store/              # State management (Zustand)
    └── utils/              # Utility functions
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0) - see the [LICENSE](LICENSE) file for details.
