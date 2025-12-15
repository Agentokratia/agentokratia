export const ENDPOINTS = {
  // Auth
  AUTH_NONCE: '/auth/nonce',
  AUTH_VERIFY: '/auth/verify',
  AUTH_ME: '/auth/me',
  AUTH_LOGOUT: '/auth/logout',

  // APIs
  APIS: '/apis',
  API_DETAIL: (id: string) => `/apis/${id}`,
  MY_APIS: '/apis/mine',
  API_STATS: (id: string) => `/apis/${id}/stats`,

  // Usage
  USAGE: '/usage',
  USAGE_BY_API: (id: string) => `/usage/api/${id}`,
  USAGE_SUMMARY: '/usage/summary',

  // Earnings
  EARNINGS: '/earnings',
  EARNINGS_BY_API: (id: string) => `/earnings/api/${id}`,
  EARNINGS_SUMMARY: '/earnings/summary',

  // Payouts
  PAYOUTS: '/payouts',
  REQUEST_PAYOUT: '/payouts/request',

  // User
  USER_PROFILE: '/user/profile',
  USER_SETTINGS: '/user/settings',
} as const;
