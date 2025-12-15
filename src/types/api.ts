export interface Api {
  id: string;
  name: string;
  description: string;
  category: string;
  pricing: ApiPricing;
  status: 'active' | 'pending' | 'inactive';
  endpoint: string;
  documentation?: string;
  provider: ApiProvider;
  stats: ApiStats;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiPricing {
  model: 'per_call' | 'per_unit' | 'flat_rate';
  price: number; // in USDC
  unit?: string; // e.g., "1000 tokens", "request"
}

export interface ApiProvider {
  id: string;
  name: string;
  walletAddress: string;
  avatar?: string;
  verified: boolean;
}

export interface ApiStats {
  totalCalls: number;
  averageLatency?: number; // in ms
  uptime?: number; // percentage
  totalEarnings?: number;
  rating?: number; // 0-5
  reviewCount?: number;
}

export interface ApiFilters {
  category?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'popular' | 'newest' | 'price_low' | 'price_high';
}

export interface ApiCreateInput {
  name: string;
  description: string;
  category: string;
  endpoint: string;
  pricing: ApiPricing;
  documentation?: string;
  tags: string[];
}

export interface ApiUpdateInput extends Partial<ApiCreateInput> {
  status?: 'active' | 'inactive';
}
