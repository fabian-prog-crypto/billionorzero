/**
 * Centralized color constants for the application.
 * All asset, chain, and category colors should be imported from here.
 */

// Crypto subcategory colors
export const CRYPTO_COLORS = {
  btc: '#F7931A',
  eth: '#627EEA',
  sol: '#9945FF',
  stablecoins: '#4CAF50',
  tokens: '#00BCD4',
  perps: '#FF5722',
} as const;

// Main category colors
export const CATEGORY_COLORS = {
  crypto: '#627EEA',
  equities: '#E91E63',
  cash: '#4CAF50',
  other: '#8B7355',
} as const;

// Subcategory colors (for portfolio breakdown)
export const SUBCATEGORY_COLORS = {
  // Crypto
  crypto_btc: '#F7931A',
  crypto_eth: '#627EEA',
  crypto_sol: '#9945FF',
  crypto_stablecoins: '#4CAF50',
  crypto_tokens: '#00BCD4',
  crypto_perps: '#FF5722',
  // Equities
  equities_stocks: '#E91E63',
  equities_etfs: '#9C27B0',
} as const;

// Chain colors
export const CHAIN_COLORS: Record<string, string> = {
  eth: '#627EEA',
  ethereum: '#627EEA',
  arb: '#28A0F0',
  arbitrum: '#28A0F0',
  op: '#FF0420',
  optimism: '#FF0420',
  base: '#0052FF',
  bsc: '#F0B90B',
  matic: '#8247E5',
  polygon: '#8247E5',
  avax: '#E84142',
  sol: '#9945FF',
  solana: '#9945FF',
  ftm: '#1969FF',
  fantom: '#1969FF',
  cro: '#002D74',
  cronos: '#002D74',
  gnosis: '#04795B',
  linea: '#61DFFF',
  scroll: '#FFEEDA',
  zksync: '#8C8DFC',
  manta: '#000000',
  blast: '#FCFC03',
  mode: '#DFFE00',
  uni: '#FF007A',
  unichain: '#FF007A',
};

// Custody type colors
export const CUSTODY_COLORS: Record<string, string> = {
  'Self-Custody': '#4CAF50',
  'DeFi': '#9C27B0',
  'Perp DEX': '#00BCD4',
  'CEX': '#FF9800',
  'Banks & Brokers': '#2196F3',
  'Manual': '#607D8B',
};

// Currency colors (fiat + stablecoins)
export const CURRENCY_COLORS: Record<string, string> = {
  'USD': '#4CAF50',
  'EUR': '#2196F3',
  'GBP': '#9C27B0',
  'CHF': '#F44336',
  'JPY': '#FF9800',
  'USDT': '#26A17B',
  'USDC': '#2775CA',
  'DAI': '#F5AC37',
  'BUSD': '#F0B90B',
  'FRAX': '#000000',
  'USDE': '#1E88E5',
  'SUSDE': '#1565C0',
};

// Risk profile colors
export const RISK_COLORS = {
  conservative: '#4CAF50',
  moderate: '#2196F3',
  aggressive: '#F44336',
} as const;

// Asset class colors (for exposure breakdown)
export const ASSET_CLASS_COLORS = {
  'Cash & Equivalents': '#4CAF50',
  'Crypto': '#FF9800',
  'Equities': '#F44336',
  'Other': '#8B7355',
} as const;

// Token category colors (for token breakdown)
export const TOKEN_CATEGORY_COLORS: Record<string, { color: string; label: string }> = {
  stablecoins: { color: '#4CAF50', label: 'Stablecoins' },
  eth: { color: '#627EEA', label: 'ETH' },
  btc: { color: '#F7931A', label: 'BTC' },
  sol: { color: '#9945FF', label: 'SOL' },
  tokens: { color: '#00BCD4', label: 'Tokens' },
  defi: { color: '#9C27B0', label: 'DeFi' },
  rwa: { color: '#795548', label: 'RWA' },
  privacy: { color: '#37474F', label: 'Privacy' },
  ai: { color: '#2196F3', label: 'AI' },
  meme: { color: '#E91E63', label: 'Meme' },
  other: { color: '#6B7280', label: 'Other' },
};

// Canonical exposure category styling shared by domain + UI.
export const EXPOSURE_CATEGORY_CONFIG = {
  stablecoins: TOKEN_CATEGORY_COLORS.stablecoins,
  eth: TOKEN_CATEGORY_COLORS.eth,
  defi: TOKEN_CATEGORY_COLORS.defi,
  btc: TOKEN_CATEGORY_COLORS.btc,
  rwa: TOKEN_CATEGORY_COLORS.rwa,
  sol: TOKEN_CATEGORY_COLORS.sol,
  privacy: TOKEN_CATEGORY_COLORS.privacy,
  ai: TOKEN_CATEGORY_COLORS.ai,
  meme: TOKEN_CATEGORY_COLORS.meme,
  tokens: TOKEN_CATEGORY_COLORS.tokens,
} as const;

// Exchange colors
export const EXCHANGE_COLORS: Record<string, string> = {
  hyperliquid: '#00D1FF',
  vertex: '#7B61FF',
  drift: '#FF6B6B',
};

// Exposure breakdown colors
export const EXPOSURE_COLORS = {
  stablecoins: '#10B981',
  btc: '#F7931A',
  eth: '#627EEA',
  other: '#22D3EE',
} as const;

// Chart fallback colors
export const CHART_FALLBACK_COLORS = [
  '#8B7355',
  '#A68B6A',
  '#C4A77D',
  '#D4C4A8',
  '#4A7C59',
  '#6B9B7A',
  '#8DB99A',
  '#B5D4C0',
  '#C75050',
  '#D47A7A',
];

// Default fallback color
export const DEFAULT_COLOR = '#6B7280';

// Helper functions
export function getChainColor(chain: string): string {
  return CHAIN_COLORS[chain.toLowerCase()] || DEFAULT_COLOR;
}

export function getCustodyColor(custodyType: string): string {
  return CUSTODY_COLORS[custodyType] || DEFAULT_COLOR;
}

export function getCurrencyColor(currency: string): string {
  return CURRENCY_COLORS[currency] || DEFAULT_COLOR;
}

export function getCryptoColor(category: keyof typeof CRYPTO_COLORS): string {
  return CRYPTO_COLORS[category] || DEFAULT_COLOR;
}

export function getCategoryColor(category: keyof typeof CATEGORY_COLORS): string {
  return CATEGORY_COLORS[category] || DEFAULT_COLOR;
}
