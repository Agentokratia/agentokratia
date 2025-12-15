export interface User {
  id: string;
  walletAddress: string;
  name?: string;
  email?: string;
  avatar?: string;
  bio?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserStats {
  totalApis: number;
  totalEarnings: number;
  totalCalls: number;
  averageRating: number;
}
