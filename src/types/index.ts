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

export interface BrokerageAccount {
  id: string;
  name: string;        // e.g., "Revolut", "IBKR Main"
  isActive: boolean;
  addedAt: string;
}

export interface CashAccount {
  id: string;
  slug: string;        // Normalized internal name for matching (e.g., "revolut"). Never changes after creation.
  name: string;        // User-editable display name (e.g., "My European Account")
  isActive: boolean;
  addedAt: string;
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
  detailTypes?: string[]; // Position detail types from DeBank (e.g., ['vesting'], ['locked'])
  unlockAt?: number; // Unix timestamp when vesting/locked position unlocks
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

// NL Position Management
export type PositionActionType = 'buy' | 'sell_partial' | 'sell_all' | 'add_cash' | 'remove' | 'update_cash' | 'set_price' | 'update_position';

export interface ParsedPositionAction {
  action: PositionActionType;
  symbol: string;
  name?: string;
  assetType: AssetType;
  amount?: number;
  pricePerUnit?: number;
  totalCost?: number;
  costBasis?: number;
  sellAmount?: number;
  sellPercent?: number;
  sellPrice?: number;
  totalProceeds?: number;
  date?: string;
  matchedPositionId?: string;
  missingFields?: string[];
  confidence: number;
  summary: string;
  currency?: string;
  accountName?: string;
  newPrice?: number;
}

export interface Transaction {
  id: string;
  type: 'buy' | 'sell' | 'transfer';
  symbol: string;
  name: string;
  assetType: AssetType;
  amount: number;
  pricePerUnit: number;
  totalValue: number;
  costBasisAtExecution?: number;
  realizedPnL?: number;
  positionId: string;
  date: string;
  notes?: string;
  createdAt: string;
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
    detailTypes?: string[]; // Raw detail_types from DeBank (e.g., ['vesting'])
    unlockAt?: number; // Unix timestamp when vesting/locked position unlocks
  }[];
  debtTokens?: {
    symbol: string;
    amount: number;
    price: number;
  }[];
}
