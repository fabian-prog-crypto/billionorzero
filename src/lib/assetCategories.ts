/**
 * Asset Categories for portfolio exposure analysis
 */

export type AssetCategory = 'stablecoins' | 'btc' | 'eth' | 'sol' | 'cash' | 'stocks' | 'other';

// Stablecoins - USD-pegged and other stable assets
const STABLECOINS = new Set([
  'usdt', 'usdc', 'dai', 'busd', 'tusd', 'usdp', 'usdd', 'frax', 'lusd',
  'gusd', 'susd', 'cusd', 'ust', 'mim', 'fei', 'ousd', 'dola', 'rai',
  'euroc', 'eurt', 'ceur', 'ageur', 'jeur', 'gbpt', 'pyusd', 'usdm',
  'gho', 'crvusd', 'mkusd', 'eur', 'usds', 'dusd', 'husd', 'susd', 'xusd',
]);

// BTC and BTC-like wrapped/bridged tokens
const BTC_LIKE = new Set([
  'btc', 'wbtc', 'btcb', 'renbtc', 'hbtc', 'sbtc', 'tbtc', 'pbtc',
  'obtc', 'fbtc', 'mbtc', 'ibtc', 'bbtc', 'ebtc', 'xbtc', 'rbtc',
  'btc.b', 'cbbtc', 'lbtc', 'btcpx',
]);

// ETH and ETH-like (staked ETH, wrapped ETH, L2 ETH)
const ETH_LIKE = new Set([
  'eth', 'weth', 'steth', 'wsteth', 'reth', 'cbeth', 'seth', 'meth',
  'frxeth', 'sfrxeth', 'oeth', 'ankreth', 'seth2', 'reth2', 'eeth', 'weeth',
  'ezeth', 'rseth', 'pufeth', 'sweth', 'ethx', 'unsteth',
]);

// SOL and SOL-like (staked SOL, liquid staking tokens)
const SOL_LIKE = new Set([
  'sol', 'wsol', 'msol', 'jitosol', 'bsol', 'stsol', 'scnsol', 'lsol',
  'hsol', 'csol', 'dsol', 'vsol', 'risksol', 'laine', 'bonksol', 'jupsol',
  'inf', 'phsol', 'jsol',
]);

/**
 * Get the category of an asset by its symbol
 * Optionally pass asset type to handle special cases like cash
 */
export function getAssetCategory(symbol: string, assetType?: string): AssetCategory {
  const normalizedSymbol = symbol.toLowerCase().trim();

  // Cash positions have their own category
  if (assetType === 'cash' || normalizedSymbol.startsWith('cash_')) return 'cash';

  // Stock positions have their own category
  if (assetType === 'stock') return 'stocks';

  if (STABLECOINS.has(normalizedSymbol)) return 'stablecoins';
  if (BTC_LIKE.has(normalizedSymbol)) return 'btc';
  if (ETH_LIKE.has(normalizedSymbol)) return 'eth';
  if (SOL_LIKE.has(normalizedSymbol)) return 'sol';

  return 'other';
}

/**
 * Check if an asset belongs to a specific category
 */
export function isAssetInCategory(symbol: string, category: AssetCategory, assetType?: string): boolean {
  return getAssetCategory(symbol, assetType) === category;
}

/**
 * Get human-readable label for a category
 */
export function getCategoryLabel(category: AssetCategory): string {
  switch (category) {
    case 'stablecoins': return 'Stablecoins';
    case 'btc': return 'BTC';
    case 'eth': return 'ETH';
    case 'sol': return 'SOL';
    case 'cash': return 'Cash';
    case 'stocks': return 'Stocks';
    case 'other': return 'Other';
  }
}

/**
 * Category colors for charts
 */
export const CATEGORY_COLORS: Record<AssetCategory, string> = {
  stablecoins: '#4CAF50', // Green for stable
  btc: '#F7931A',         // Bitcoin orange
  eth: '#627EEA',         // Ethereum blue
  sol: '#9945FF',         // Solana purple
  cash: '#2196F3',        // Blue for cash/fiat
  stocks: '#E91E63',      // Pink for stocks
  other: '#8B7355',       // Neutral brown
};
