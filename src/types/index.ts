export type AssetType = 'crypto' | 'stock' | 'etf' | 'cash' | 'manual';

// Supported perpetual futures exchanges (type only - use PerpExchangeService for metadata)
export type PerpExchange = 'hyperliquid' | 'lighter' | 'ethereal';

// Supported centralized exchanges
export type CexExchange = 'binance' | 'coinbase' | 'kraken' | 'okx';

export interface CexAccount {
  id: string;
  exchange: CexExchange;
  name: string;
  apiKey: string;
  apiSecret: string;
  isActive: boolean;
  addedAt: string;
  lastSync?: string;
}

export interface Position {
  id: string;
  type: AssetType;
  symbol: string;
  name: string;
  amount: number;
  costBasis?: number;       // Total cost in USD when position was acquired
  purchaseDate?: string;    // ISO date when position was acquired (for CAGR/returns)
  walletAddress?: string;
  chain?: string;
  debankPriceKey?: string; // Key to look up DeBank price (more accurate for wallet tokens)
  protocol?: string; // DeFi protocol name (e.g., "Morpho", "Aave")
  isDebt?: boolean; // True if this is a borrowed/debt position
  logo?: string; // Token logo URL from DeBank/API (prioritized for display)
  addedAt: string;
  updatedAt: string;
}

export interface Wallet {
  id: string;
  address: string;
  name: string;
  chains: string[];
  perpExchanges?: PerpExchange[]; // Which perp exchanges this wallet is connected to
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
  hasCustomPrice?: boolean; // True if using a custom price override
  isPerpNotional?: boolean; // True if perp long/short (notional exposure, not actual holding)
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
  totalValue: number;       // Net value (assets - debts)
  grossAssets: number;      // Total positive positions
  totalDebts: number;       // Total debt (as positive number)
  change24h: number;
  changePercent24h: number;
  cryptoValue: number;
  stockValue: number;
  cashValue: number;
  manualValue: number;
  positionCount: number;    // Total number of positions
  assetCount: number;       // Unique assets (aggregated)
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
  tokenId?: string;
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
