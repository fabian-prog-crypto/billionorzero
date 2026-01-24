/**
 * API Layer Types
 * Pure types for external API responses - no business logic
 */

// DeBank API Types
export interface DebankTokenResponse {
  id: string;
  chain: string;
  name: string;
  symbol: string;
  decimals: number;
  logo_url?: string;
  price: number;
  amount: number;
  raw_amount: number;
  // Spam filtering fields
  is_verified?: boolean;
  is_core?: boolean;
  is_scam?: boolean;
  is_suspicious?: boolean;
  is_wallet?: boolean;
}

export interface DebankProtocolResponse {
  id: string;
  chain: string;
  name: string;
  site_url?: string;
  logo_url?: string;
  portfolio_item_list: {
    name: string;
    stats: {
      asset_usd_value: number;
      net_usd_value: number;
    };
    detail: {
      supply_token_list?: DebankTokenResponse[];
      borrow_token_list?: DebankTokenResponse[];
      reward_token_list?: DebankTokenResponse[];
    };
  }[];
}

export interface DebankTotalBalanceResponse {
  total_usd_value: number;
}

// CoinGecko API Types
export interface CoinGeckoPriceResponse {
  [coinId: string]: {
    usd: number;
    usd_24h_change?: number;
  };
}

export interface CoinGeckoSearchResult {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank?: number;
}

// Stock API Types (Finnhub)
export interface StockQuoteResponse {
  c: number;  // Current price
  d: number;  // Change
  dp: number; // Percent change
  h: number;  // High
  l: number;  // Low
  o: number;  // Open
  pc: number; // Previous close
  t: number;  // Timestamp
}

// Generic API Error
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public service?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
