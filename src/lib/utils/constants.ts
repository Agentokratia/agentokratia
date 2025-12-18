export const APP_NAME = 'Agentokratia';

// Default placeholder endpoint for new agents
export const PLACEHOLDER_ENDPOINT = 'https://placeholder.example.com';

// Default schemas for agent API
export const DEFAULT_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'The input query' }
  },
  required: ['query']
};

export const DEFAULT_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    result: { type: 'string', description: 'The response' }
  }
};

// External links
export const EXTERNAL_LINKS = {
  WHAT_IS_WALLET: 'https://ethereum.org/en/wallets/',
  TERMS: 'https://agentokratia.com/terms.html',
  PRIVACY: 'https://agentokratia.com/privacy.html',
  DOCS: 'https://docs.agentokratia.com',
  MANIFESTO: 'https://agentokratia.com/#manifesto',
  TWITTER: 'https://x.com/agentokratia',
  DISCORD: 'https://discord.gg/agentokratia',
  TELEGRAM: 'https://t.me/agentokratia',
  GITHUB: 'https://github.com/Agentokratia/agentokratia',
} as const;

export const API_CATEGORIES = [
  'AI & ML',
  'Data',
  'Finance',
  'Social',
  'Utilities',
  'Search',
  'Media',
  'Other',
] as const;

export const PRICING_MODELS = [
  { value: 'per_call', label: 'Per Call' },
  { value: 'per_unit', label: 'Per Unit' },
  { value: 'flat_rate', label: 'Flat Rate' },
] as const;

export const API_STATUS = {
  ACTIVE: 'active',
  PENDING: 'pending',
  INACTIVE: 'inactive',
} as const;

export const ROUTES = {
  HOME: '/',
  MARKETPLACE: '/marketplace',
  AGENT_DETAIL: (handle: string, slug: string) => `/${handle}/${slug}`,
  AGENT_API: (handle: string, slug: string) => `/api/v1/call/${handle}/${slug}`,
  CREATOR: (handle: string) => `/creator/${handle}`,
  DASHBOARD: '/dashboard',
  DASHBOARD_APIS: '/dashboard/apis',
  DASHBOARD_NEW_API: '/dashboard/apis/new',
  DASHBOARD_EDIT_API: (id: string) => `/dashboard/apis/${id}/edit`,
  DASHBOARD_USAGE: '/dashboard/usage',
  DASHBOARD_EARNINGS: '/dashboard/earnings',
  DASHBOARD_SETTINGS: '/dashboard/settings',
} as const;
