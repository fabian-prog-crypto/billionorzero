/**
 * Category Service - Domain Service
 * Hierarchical asset categorization for portfolio exposure analysis
 *
 * Structure:
 * - Main Categories: crypto, equities, cash, other
 * - Sub Categories: crypto (btc, eth, sol, stablecoins, tokens, perps), equities (stocks, etfs)
 */

// Main category types
export type MainCategory = 'crypto' | 'equities' | 'cash' | 'other';

// Sub-category types
export type CryptoSubCategory = 'btc' | 'eth' | 'sol' | 'stablecoins' | 'tokens' | 'perps';
export type EquitiesSubCategory = 'stocks' | 'etfs';
export type SubCategory = CryptoSubCategory | EquitiesSubCategory | 'none';

// Combined category for compatibility (main_sub format)
export type AssetCategory =
  | 'crypto' | 'crypto_btc' | 'crypto_eth' | 'crypto_sol' | 'crypto_stablecoins' | 'crypto_tokens' | 'crypto_perps'
  | 'equities' | 'equities_stocks' | 'equities_etfs'
  | 'cash' | 'other';

// Category hierarchy structure
export interface CategoryHierarchy {
  main: MainCategory;
  sub?: SubCategory;
  label: string;
  color: string;
}

/**
 * Category Service
 * Provides hierarchical asset categorization logic and metadata
 */
export class CategoryService {
  // Stablecoins - USD-pegged, EUR-pegged and other stable assets
  private stablecoins = new Set([
    'usd', 'usdt', 'usdc', 'dai', 'busd', 'tusd', 'usdp', 'usdd', 'frax', 'lusd',
    'gusd', 'susd', 'cusd', 'ust', 'mim', 'fei', 'ousd', 'dola', 'rai',
    'pyusd', 'usdm', 'gho', 'crvusd', 'mkusd', 'usds', 'dusd', 'husd', 'xusd',
    'usde', 'susde', 'usdai', 'usd0', 'usd0++', 'fdusd', 'usdb', 'usdx',
    'usdy', 'usdz', 'zusd', 'musd', 'pusd', 'ausd', 'rusd', 'cgusd',
    'euroc', 'eurt', 'ceur', 'ageur', 'jeur', 'eur', 'eurc', 'eure', 'eura',
    'steur', 'seur', 'gbpt', 'gbpc',
  ]);

  // BTC and BTC-like wrapped/bridged tokens
  private btcLike = new Set([
    'btc', 'wbtc', 'btcb', 'renbtc', 'hbtc', 'sbtc', 'tbtc', 'pbtc',
    'obtc', 'fbtc', 'mbtc', 'ibtc', 'bbtc', 'ebtc', 'xbtc', 'rbtc',
    'btc.b', 'cbbtc', 'lbtc', 'btcpx',
  ]);

  // ETH and ETH-like (staked ETH, wrapped ETH, L2 ETH)
  private ethLike = new Set([
    'eth', 'weth', 'steth', 'wsteth', 'reth', 'cbeth', 'seth', 'meth',
    'frxeth', 'sfrxeth', 'oeth', 'ankreth', 'seth2', 'reth2', 'eeth', 'weeth',
    'ezeth', 'rseth', 'pufeth', 'sweth', 'ethx', 'unsteth',
  ]);

  // SOL and SOL-like (staked SOL, liquid staking tokens)
  private solLike = new Set([
    'sol', 'wsol', 'msol', 'jitosol', 'bsol', 'stsol', 'scnsol', 'lsol',
    'hsol', 'csol', 'dsol', 'vsol', 'risksol', 'laine', 'bonksol', 'jupsol',
    'inf', 'phsol', 'jsol',
  ]);

  // Perpetual futures / derivatives protocols
  private perpProtocols = new Set([
    'hyperliquid', 'lighter', 'ethereal',
    'hyperliquid perp', 'hyperliquid perpetual',
    'lighter exchange', 'ethereal exchange',
  ]);

  // Common ETFs (by symbol)
  private etfs = new Set([
    // Broad market ETFs
    'spy', 'spx', 'voo', 'ivv', 'qqq', 'qqqm', 'dia', 'iwm', 'vti', 'vtv', 'vug',
    'schd', 'schx', 'schb', 'splg', 'sptm', 'itot',
    // Sector ETFs
    'xlk', 'xlf', 'xle', 'xlv', 'xli', 'xlp', 'xly', 'xlb', 'xlu', 'xlre',
    'vgt', 'vht', 'vde', 'vnq', 'vfh', 'vis', 'vox', 'vpu', 'vaw', 'vdc',
    // International ETFs
    'vxus', 'vea', 'vwo', 'efa', 'eem', 'iefa', 'iemg', 'vgk', 'vpl', 'fxi',
    // Bond ETFs
    'bnd', 'agg', 'lqd', 'tlt', 'ief', 'shy', 'tip', 'vcit', 'vcsh', 'bndx',
    // Thematic ETFs
    'arkk', 'arkw', 'arkg', 'arkf', 'arkq', 'soxx', 'smh', 'botz', 'robo', 'hack',
    'kweb', 'cqqq', 'mchi', 'gld', 'slv', 'gdx', 'gldm', 'iau', 'uso', 'ung',
    // Leveraged/Inverse ETFs
    'tqqq', 'sqqq', 'upro', 'spxu', 'soxl', 'soxs', 'fngu', 'fngd',
    // Crypto ETFs
    'gbtc', 'ethe', 'bito', 'bitq', 'blok', 'ibit', 'fbtc', 'btco', 'arkb',
    // European ETFs / Index trackers
    'dax', 'dax.pa', 'cac40', 'cac.pa', 'ftse', 'eurostoxx', 'stoxx50',
    'vgk', 'ewg', 'ewq', 'ewu', 'ezu', 'hedj', 'dbeu', 'ieur', 'fez',
    'veur.as', 'meud.pa', 'lyxdax.de', 'exs1.de', 'c40.pa',
  ]);

  // Main category colors
  private mainCategoryColors: Record<MainCategory, string> = {
    crypto: '#627EEA',     // Ethereum blue as main crypto color
    equities: '#E91E63',   // Pink for equities
    cash: '#4CAF50',       // Green for cash
    other: '#8B7355',      // Neutral brown
  };

  // Sub-category colors
  private subCategoryColors: Record<string, string> = {
    // Crypto sub-categories
    crypto_btc: '#F7931A',         // Bitcoin orange
    crypto_eth: '#627EEA',         // Ethereum blue
    crypto_sol: '#9945FF',         // Solana purple
    crypto_stablecoins: '#4CAF50', // Green for stable
    crypto_tokens: '#00BCD4',      // Cyan for tokens
    crypto_perps: '#FF5722',       // Deep orange for perps
    // Equities sub-categories
    equities_stocks: '#E91E63',    // Pink for individual stocks
    equities_etfs: '#9C27B0',      // Purple for ETFs
  };

  // Category labels
  private mainCategoryLabels: Record<MainCategory, string> = {
    crypto: 'Crypto',
    equities: 'Equities',
    cash: 'Cash',
    other: 'Other',
  };

  private subCategoryLabels: Record<string, string> = {
    crypto_btc: 'BTC',
    crypto_eth: 'ETH',
    crypto_sol: 'SOL',
    crypto_stablecoins: 'Stablecoins',
    crypto_tokens: 'Tokens',
    crypto_perps: 'Perps',
    equities_stocks: 'Stocks',
    equities_etfs: 'ETFs',
  };

  /**
   * Check if a protocol is a perps/derivatives protocol
   */
  isPerpProtocol(protocol?: string): boolean {
    if (!protocol) return false;
    const normalized = protocol.toLowerCase().trim();
    return this.perpProtocols.has(normalized) ||
           normalized.includes('hyperliquid') ||
           normalized.includes('lighter') ||
           normalized.includes('ethereal');
  }

  /**
   * Check if a symbol is a known ETF (handles exchange suffixes like .PA, .DE, .AS)
   */
  private isKnownEtf(symbol: string): boolean {
    const normalized = symbol.toLowerCase().trim();
    // Direct match
    if (this.etfs.has(normalized)) return true;
    // Check base symbol without exchange suffix (e.g., dax.pa -> dax)
    const dotIndex = normalized.lastIndexOf('.');
    if (dotIndex > 0) {
      const baseSymbol = normalized.substring(0, dotIndex);
      if (this.etfs.has(baseSymbol)) return true;
    }
    return false;
  }

  /**
   * Get the main category for an asset
   */
  getMainCategory(symbol: string, assetType?: string): MainCategory {
    // Cash positions
    if (assetType === 'cash' || symbol.toLowerCase().startsWith('cash_')) {
      return 'cash';
    }

    // Stock/ETF positions (equities)
    if (assetType === 'stock' || assetType === 'etf') {
      return 'equities';
    }

    // Crypto positions
    if (assetType === 'crypto') {
      return 'crypto';
    }

    // Manual/other positions - try to categorize
    const normalizedSymbol = symbol.toLowerCase().trim();
    if (this.stablecoins.has(normalizedSymbol) ||
        this.btcLike.has(normalizedSymbol) ||
        this.ethLike.has(normalizedSymbol) ||
        this.solLike.has(normalizedSymbol)) {
      return 'crypto';
    }

    // Check if it's an ETF
    if (this.etfs.has(normalizedSymbol)) {
      return 'equities';
    }

    return 'other';
  }

  /**
   * Get the sub-category for an asset (within its main category)
   */
  getSubCategory(symbol: string, assetType?: string): SubCategory {
    const normalizedSymbol = symbol.toLowerCase().trim();

    // Crypto sub-categories
    if (assetType === 'crypto' || this.getMainCategory(symbol, assetType) === 'crypto') {
      if (this.stablecoins.has(normalizedSymbol)) return 'stablecoins';
      if (this.btcLike.has(normalizedSymbol)) return 'btc';
      if (this.ethLike.has(normalizedSymbol)) return 'eth';
      if (this.solLike.has(normalizedSymbol)) return 'sol';

      // Check Pendle tokens
      const isPendleToken = normalizedSymbol.startsWith('pt-') || normalizedSymbol.startsWith('yt-') ||
        normalizedSymbol.includes('pt-') || normalizedSymbol.includes('yt-');
      if (isPendleToken) {
        if (normalizedSymbol.includes('usd') || normalizedSymbol.includes('dai') ||
            normalizedSymbol.includes('eur') || normalizedSymbol.includes('frax') ||
            normalizedSymbol.includes('gho') || normalizedSymbol.includes('lusd')) {
          return 'stablecoins';
        }
        if (normalizedSymbol.includes('eth') || normalizedSymbol.includes('steth') ||
            normalizedSymbol.includes('eeth') || normalizedSymbol.includes('reth') ||
            normalizedSymbol.includes('wsteth') || normalizedSymbol.includes('weeth')) {
          return 'eth';
        }
        if (normalizedSymbol.includes('btc') || normalizedSymbol.includes('wbtc') ||
            normalizedSymbol.includes('lbtc') || normalizedSymbol.includes('ebtc')) {
          return 'btc';
        }
        if (normalizedSymbol.includes('sol') || normalizedSymbol.includes('jsol') ||
            normalizedSymbol.includes('msol') || normalizedSymbol.includes('jitosol')) {
          return 'sol';
        }
      }

      return 'tokens'; // Default crypto sub-category
    }

    // Equities sub-categories (stocks vs ETFs)
    // Priority: explicit 'etf' assetType > known ETF symbols (overrides legacy 'stock' type) > default to stocks
    if (assetType === 'stock' || assetType === 'etf' || this.getMainCategory(symbol, assetType) === 'equities') {
      if (assetType === 'etf') return 'etfs';
      // Check known ETF symbols - this overrides legacy positions that were added as 'stock' before ETF selection existed
      if (this.isKnownEtf(normalizedSymbol)) return 'etfs';
      return 'stocks';
    }

    return 'none';
  }

  /**
   * Get combined category key (main_sub format)
   */
  getAssetCategory(symbol: string, assetType?: string): AssetCategory {
    const main = this.getMainCategory(symbol, assetType);
    const sub = this.getSubCategory(symbol, assetType);

    if (sub === 'none' || main === 'cash' || main === 'other') {
      return main as AssetCategory;
    }

    return `${main}_${sub}` as AssetCategory;
  }

  /**
   * Get full category hierarchy
   */
  getCategoryHierarchy(symbol: string, assetType?: string): CategoryHierarchy {
    const main = this.getMainCategory(symbol, assetType);
    const sub = this.getSubCategory(symbol, assetType);
    const category = this.getAssetCategory(symbol, assetType);

    return {
      main,
      sub: sub !== 'none' ? sub : undefined,
      label: this.getCategoryLabel(category),
      color: this.getCategoryColor(category),
    };
  }

  /**
   * Get human-readable label for a category
   */
  getCategoryLabel(category: AssetCategory): string {
    if (category.includes('_')) {
      return this.subCategoryLabels[category] || category;
    }
    return this.mainCategoryLabels[category as MainCategory] || category;
  }

  /**
   * Get main category label
   */
  getMainCategoryLabel(category: MainCategory): string {
    return this.mainCategoryLabels[category];
  }

  /**
   * Get color for a category
   */
  getCategoryColor(category: AssetCategory): string {
    if (category.includes('_')) {
      return this.subCategoryColors[category] || this.mainCategoryColors.other;
    }
    return this.mainCategoryColors[category as MainCategory] || this.mainCategoryColors.other;
  }

  /**
   * Get all category colors
   */
  getCategoryColors(): Record<AssetCategory, string> {
    return {
      ...this.mainCategoryColors,
      ...this.subCategoryColors,
    } as Record<AssetCategory, string>;
  }

  /**
   * Get all main categories
   */
  getMainCategories(): MainCategory[] {
    return ['crypto', 'equities', 'cash', 'other'];
  }

  /**
   * Get sub-categories for a main category
   */
  getSubCategories(main: MainCategory): SubCategory[] {
    switch (main) {
      case 'crypto':
        return ['btc', 'eth', 'sol', 'stablecoins', 'tokens', 'perps'];
      case 'equities':
        return ['stocks', 'etfs'];
      default:
        return [];
    }
  }

  /**
   * Get all display categories (main categories for overview)
   */
  getDisplayCategories(): MainCategory[] {
    return ['crypto', 'equities', 'cash', 'other'];
  }

  /**
   * Get all sub-categories for display (combined keys)
   */
  getAllSubCategories(): AssetCategory[] {
    return [
      'crypto_btc', 'crypto_eth', 'crypto_sol', 'crypto_stablecoins', 'crypto_tokens', 'crypto_perps',
      'equities_stocks', 'equities_etfs',
    ];
  }

  /**
   * Check if category is a sub-category
   */
  isSubCategory(category: AssetCategory): boolean {
    return category.includes('_');
  }

  /**
   * Get main category from combined key
   */
  getMainFromCombined(category: AssetCategory): MainCategory {
    if (category.includes('_')) {
      return category.split('_')[0] as MainCategory;
    }
    return category as MainCategory;
  }

  /**
   * Check if an asset belongs to a specific main category
   */
  isAssetInMainCategory(symbol: string, category: MainCategory, assetType?: string): boolean {
    return this.getMainCategory(symbol, assetType) === category;
  }

  /**
   * Check if an asset belongs to a specific category (main or sub)
   */
  isAssetInCategory(symbol: string, category: AssetCategory, assetType?: string): boolean {
    const assetCategory = this.getAssetCategory(symbol, assetType);

    // Direct match
    if (assetCategory === category) return true;

    // Check if filtering by main category and asset is in a sub-category of it
    if (!category.includes('_') && assetCategory.startsWith(category + '_')) {
      return true;
    }

    return false;
  }
}

// Singleton instance
let instance: CategoryService | null = null;

export function getCategoryService(): CategoryService {
  if (!instance) {
    instance = new CategoryService();
  }
  return instance;
}

// Convenience exports for backward compatibility
export const CATEGORY_COLORS = getCategoryService().getCategoryColors();

export function getAssetCategory(symbol: string, assetType?: string): AssetCategory {
  return getCategoryService().getAssetCategory(symbol, assetType);
}

export function getCategoryLabel(category: AssetCategory): string {
  return getCategoryService().getCategoryLabel(category);
}

export function isPerpProtocol(protocol?: string): boolean {
  return getCategoryService().isPerpProtocol(protocol);
}

export function isAssetInCategory(symbol: string, category: AssetCategory, assetType?: string): boolean {
  return getCategoryService().isAssetInCategory(symbol, category, assetType);
}

export function getMainCategory(symbol: string, assetType?: string): MainCategory {
  return getCategoryService().getMainCategory(symbol, assetType);
}

export function getSubCategory(symbol: string, assetType?: string): SubCategory {
  return getCategoryService().getSubCategory(symbol, assetType);
}
