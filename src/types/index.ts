export type AssetType = 'crypto' | 'stock' | 'cash' | 'manual';

export interface Position {
  id: string;
  type: AssetType;
  symbol: string;
  name: string;
  amount: number;
  costBasis?: number;
  walletAddress?: string;
  chain?: string;
  debankPriceKey?: string; // Key to look up DeBank price (more accurate for wallet tokens)
  protocol?: string; // DeFi protocol name (e.g., "Morpho", "Aave")
  isDebt?: boolean; // True if this is a borrowed/debt position
  addedAt: string;
  updatedAt: string;
}

export interface Wallet {
  id: string;
  address: string;
  name: string;
  chains: string[];
  addedAt: string;
}

export interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  lastUpdated: string;
}

export interface AssetWithPrice extends Position {
  currentPrice: number;
  value: number; // Negative for debt positions
  change24h: number;
  changePercent24h: number;
  allocation: number; // Negative for debt positions
}

export interface NetWorthSnapshot {
  id: string;
  date: string;
  totalValue: number;
  cryptoValue: number;
  stockValue: number;
  cashValue: number;
  manualValue: number;
}

export interface PortfolioSummary {
  totalValue: number;
  change24h: number;
  changePercent24h: number;
  cryptoValue: number;
  stockValue: number;
  cashValue: number;
  manualValue: number;
  topAssets: AssetWithPrice[];
  assetsByType: {
    type: AssetType;
    value: number;
    percentage: number;
  }[];
}

export interface WalletBalance {
  symbol: string;
  name: string;
  amount: number;
  price: number;
  value: number;
  chain: string;
  logo?: string;
  isVerified?: boolean;
}

export interface DefiPosition {
  protocol: string;
  chain: string;
  type: string;
  value: number;
  tokens: {
    symbol: string;
    amount: number;
    price: number;
  }[];
  debtTokens?: {
    symbol: string;
    amount: number;
    price: number;
  }[];
}
