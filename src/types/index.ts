// --- Asset Classification ---

/** @deprecated Use AssetClass instead */
export type AssetType = 'crypto' | 'stock' | 'etf' | 'cash' | 'manual';

export type AssetClass = 'crypto' | 'equity' | 'metals' | 'cash' | 'other';

// Supported perpetual futures exchanges (type only - use PerpExchangeService for metadata)
export type PerpExchange = 'hyperliquid' | 'lighter' | 'ethereal';

// Supported centralized exchanges
export type CexExchange = 'binance' | 'coinbase' | 'kraken' | 'okx';

// --- Unified Account Model (v13) ---
// Account connection defines HOW we sync data. Account type is derived from what it holds.

export type DataSourceType = 'debank' | 'helius' | 'binance' | 'coinbase' | 'kraken' | 'okx' | 'manual';

export interface WalletConnection {
  dataSource: 'debank' | 'helius';
  address: string;
  chains?: string[];
  perpExchanges?: PerpExchange[];
}

export interface CexConnection {
  dataSource: 'binance' | 'coinbase' | 'kraken' | 'okx';
  apiKey: string;
  apiSecret: string;
  apiPassphrase?: string;
  lastSync?: string;
}

export interface ManualConnection {
  dataSource: 'manual';
}

export type AccountConnection = WalletConnection | CexConnection | ManualConnection;

export interface Account {
  id: string;
  name: string;
  isActive: boolean;
  connection: AccountConnection;
  slug?: string;              // For cash-account dedup (legacy, kept for backward compat)
  addedAt: string;
}

// --- Legacy Account Types (deprecated, kept for migration/backward compat) ---

/** @deprecated Use Account with AccountConnection instead */
export type AccountType = 'wallet' | 'brokerage' | 'cash' | 'cex';

/** @deprecated */
interface AccountBase {
  id: string;
  name: string;
  addedAt: string;
}

/** @deprecated Use Account with WalletConnection */
export interface WalletAccount extends AccountBase {
  type: 'wallet';
  address: string;
  chains: string[];
  perpExchanges?: PerpExchange[];
}

/** @deprecated Use Account with ManualConnection */
export interface BrokerageAccount extends AccountBase {
  type: 'brokerage';
  isActive: boolean;
}

/** @deprecated Use Account with ManualConnection + slug */
export interface CashAccount extends AccountBase {
  type: 'cash';
  slug: string;
  isActive: boolean;
}

/** @deprecated Use Account with CexConnection */
export interface CexAccount extends AccountBase {
  type: 'cex';
  exchange: CexExchange;
  apiKey: string;
  apiSecret: string;
  isActive: boolean;
  lastSync?: string;
}

/** @deprecated Use Account instead */
export type LegacyAccount = WalletAccount | BrokerageAccount | CashAccount | CexAccount;

// Legacy aliases
export type Wallet = WalletAccount;

export interface Position {
  id: string;
  assetClass: AssetClass;           // 'crypto' | 'equity' | 'metals' | 'cash' | 'other'
  /**
   * Optional per-asset category override.
   * When set, this supersedes assetClass for classification and grouping.
   */
  assetClassOverride?: AssetClass;
  /** @deprecated Use assetClass instead. Kept during transition for backward compat. */
  type: AssetType;
  symbol: string;
  name: string;
  amount: number;
  costBasis?: number;       // Total cost in USD when position was acquired
  purchaseDate?: string;    // ISO date when position was acquired (for CAGR/returns)
  accountId?: string;       // FK to Account.id (undefined = standalone manual position)
  chain?: string;
  debankPriceKey?: string; // Key to look up DeBank price (more accurate for wallet tokens)
  protocol?: string; // DeFi protocol name (e.g., "Morpho", "Aave", "Hyperliquid")
  isDebt?: boolean; // True if this is a borrowed/debt position
  detailTypes?: string[]; // Position detail types from DeBank (e.g., ['vesting'], ['locked'])
  unlockAt?: number; // Unix timestamp when vesting/locked position unlocks
  logo?: string; // Token logo URL from DeBank/API (prioritized for display)
  equityType?: 'stock' | 'etf';    // Sub-type within equity class
  addedAt: string;
  updatedAt: string;
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
  equityValue: number;
  metalsValue: number;
  cashValue: number;
  otherValue: number;
  /** @deprecated Use equityValue */
  stockValue?: number;
  /** @deprecated Use otherValue */
  manualValue?: number;
}

export interface PortfolioSummary {
  totalValue: number;       // Net value (assets - debts)
  grossAssets: number;      // Total positive positions
  totalDebts: number;       // Total debt (as positive number)
  change24h: number;
  changePercent24h: number;
  cryptoValue: number;
  equityValue: number;
  metalsValue: number;
  cashValue: number;
  otherValue: number;
  /** @deprecated Use equityValue */
  stockValue: number;
  /** @deprecated Use otherValue */
  manualValue: number;
  positionCount: number;    // Total number of positions
  assetCount: number;       // Unique assets (aggregated)
  topAssets: AssetWithPrice[];
  assetsByClass: {
    assetClass: AssetClass;
    value: number;
    percentage: number;
  }[];
  /** @deprecated Use assetsByClass */
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
export type PositionActionType = 'buy' | 'sell_partial' | 'sell_all' | 'add_cash' | 'remove' | 'set_price' | 'update_position';

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
  matchedAccountId?: string;
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

// --- Helper: get assetClass from legacy type ---
export function assetClassFromType(type: AssetType): AssetClass {
  switch (type) {
    case 'crypto': return 'crypto';
    case 'stock':
    case 'etf': return 'equity';
    case 'cash': return 'cash';
    case 'manual': return 'other';
    default: return 'other';
  }
}

// --- Helper: get legacy type from assetClass ---
export function typeFromAssetClass(assetClass: AssetClass, equityType?: 'stock' | 'etf'): AssetType {
  switch (assetClass) {
    case 'crypto': return 'crypto';
    case 'equity': return equityType || 'stock';
    case 'metals': return 'manual';
    case 'cash': return 'cash';
    case 'other': return 'manual';
    default: return 'manual';
  }
}
