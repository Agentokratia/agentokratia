export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface UsageRecord {
  id: string;
  apiId: string;
  apiName: string;
  callCount: number;
  totalCost: number;
  date: string;
}

export interface EarningsRecord {
  id: string;
  apiId: string;
  apiName: string;
  amount: number;
  callCount: number;
  date: string;
}

export interface PayoutRecord {
  id: string;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  txHash?: string;
  createdAt: string;
  completedAt?: string;
}
