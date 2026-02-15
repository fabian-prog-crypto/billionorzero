/**
 * Category Service - Domain Service
 * Hierarchical asset categorization for portfolio exposure analysis
 *
 * Structure:
 * - Main Categories: crypto, equities, metals, cash, other
 * - Sub Categories: crypto (btc, eth, sol, stablecoins, tokens, perps), equities (stocks, etfs), metals (gold, silver, platinum, palladium, miners)
 * - Exposure Categories: More granular breakdown for crypto exposure (stablecoins, eth, defi, btc, rwa, sol, privacy, ai, tokens)
 */

import {
  CATEGORY_COLORS as UI_CATEGORY_COLORS,
  SUBCATEGORY_COLORS as UI_SUBCATEGORY_COLORS,
  EXPOSURE_CATEGORY_CONFIG,
} from '@/lib/colors';
import type { AssetClass } from '@/types';

// Main category types
export type MainCategory = 'crypto' | 'equities' | 'metals' | 'cash' | 'other';

// Sub-category types
export type CryptoSubCategory = 'btc' | 'eth' | 'sol' | 'stablecoins' | 'tokens' | 'perps';
export type EquitiesSubCategory = 'stocks' | 'etfs';
export type MetalsSubCategory = 'gold' | 'silver' | 'platinum' | 'palladium' | 'miners';
export type SubCategory = CryptoSubCategory | EquitiesSubCategory | MetalsSubCategory | 'none';

// Exposure category types (more granular than sub-categories for crypto exposure analysis)
// Perp positions are classified by their underlying asset (e.g., BTC perp -> BTC exposure)
export type ExposureCategoryType = 'stablecoins' | 'eth' | 'defi' | 'btc' | 'rwa' | 'sol' | 'privacy' | 'ai' | 'meme' | 'tokens';

// Combined category for compatibility (main_sub format)
export type AssetCategory =
  | 'crypto' | 'crypto_btc' | 'crypto_eth' | 'crypto_sol' | 'crypto_stablecoins' | 'crypto_tokens' | 'crypto_perps'
  | 'equities' | 'equities_stocks' | 'equities_etfs'
  | 'metals' | 'metals_gold' | 'metals_silver' | 'metals_platinum' | 'metals_palladium' | 'metals_miners'
  | 'cash' | 'other';

// Category hierarchy structure
export interface CategoryHierarchy {
  main: MainCategory;
  sub?: SubCategory;
  label: string;
  color: string;
}

// Exposure category config
export interface ExposureCategoryConfig {
  color: string;
  label: string;
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
    'usde', 'susde', 'wusde', 'usdai', 'usd0', 'usd0++', 'fdusd', 'usdb', 'usdx',
    'usdy', 'usdz', 'zusd', 'musd', 'pusd', 'ausd', 'rusd', 'cgusd',
    'euroc', 'eurt', 'ceur', 'ageur', 'jeur', 'eur', 'eurc', 'eure', 'eura',
    'steur', 'seur', 'gbpt', 'gbpc',
    'wxdai', 'xdai', 'sdai', // DAI variants (USD-pegged)
    'susds', 'stusdt', // Yield-bearing stablecoins (Savings USDS, staked USDT)
  ]);

  // USD-pegged stablecoins (explicit mapping to USD)
  private usdStablecoins = new Set([
    'usd', 'usdt', 'usdc', 'dai', 'busd', 'tusd', 'usdp', 'usdd', 'frax', 'lusd',
    'gusd', 'susd', 'cusd', 'ust', 'mim', 'fei', 'ousd', 'dola', 'rai',
    'pyusd', 'usdm', 'gho', 'crvusd', 'mkusd', 'usds', 'dusd', 'husd', 'xusd',
    'usde', 'susde', 'wusde', 'usdai', 'usd0', 'usd0++', 'fdusd', 'usdb', 'usdx',
    'usdy', 'usdz', 'zusd', 'musd', 'pusd', 'ausd', 'rusd', 'cgusd',
    'wxdai', 'xdai', 'sdai', // DAI variants are USD-pegged
    'susds', 'stusdt', // Yield-bearing USD stablecoins
  ]);

  // EUR-pegged stablecoins
  private eurStablecoins = new Set([
    'euroc', 'eurt', 'ceur', 'ageur', 'jeur', 'eur', 'eurc', 'eure', 'eura',
    'steur', 'seur',
  ]);

  // GBP-pegged stablecoins
  private gbpStablecoins = new Set([
    'gbpt', 'gbpc',
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

  // Fiat currencies (for bank accounts and manual cash entries)
  private fiatCurrencies = new Set([
    'usd', 'eur', 'gbp', 'chf', 'jpy', 'cny', 'cad', 'aud', 'nzd',
    'hkd', 'sgd', 'sek', 'nok', 'dkk', 'krw', 'inr', 'brl', 'mxn',
    'zar', 'aed', 'thb', 'pln', 'czk', 'ils', 'php', 'idr', 'myr',
    'try', 'rub', 'huf', 'ron', 'bgn', 'hrk', 'isk', 'twd', 'vnd',
  ]);

  // Perpetual futures / derivatives protocols
  private perpProtocols = new Set([
    'hyperliquid', 'lighter', 'ethereal', 'vertex', 'drift',
    'hyperliquid perp', 'hyperliquid perpetual',
    'lighter exchange', 'ethereal exchange',
    'vertex protocol', 'vertex exchange',
    'drift protocol', 'drift exchange',
  ]);

  // DeFi protocol tokens
  private defiTokens = new Set([
    // DEXs & AMMs
    'uni', 'uniswap', 'sushi', 'cake', 'crv', 'bal', 'joe', 'velo', 'aero', 'sky',
    'gmx', 'dydx', 'perp', 'rune', 'osmo', 'ray', 'orca', 'jup', 'jupiter',
    '1inch', 'dodo', 'bancor', 'bnt', 'kyber', 'knc', 'swapr', 'camelot',
    'thena', 'solidly', 'velodrome', 'aerodrome', 'trader joe', 'quickswap',
    // Lending & Borrowing (DeFi-native protocols)
    'aave', 'comp', 'compound', 'mkr', 'maker', 'ldo', 'lido', 'rpl', 'rocket pool',
    'morpho', 'euler', 'radiant', 'rdnt', 'geist', 'benqi', 'qi', 'venus', 'xvs',
    'cream', 'iron bank',
    // Note: maple, goldfinch, clearpool are in RWA (institutional lending focus)
    'fxs', 'spell', 'alchemix', 'alcx', 'abracadabra', 'liquity', 'lqty',
    // Yield & Vaults
    'yfi', 'yearn', 'cvx', 'convex', 'btrfly', 'redacted', 'ohm', 'olympus',
    'pendle', 'ribbon', 'rbn', 'dopex', 'dpx', 'jones', 'jdao', 'umami',
    'beefy', 'bifi', 'harvest', 'farm', 'pickle', 'stakedao', 'sdt',
    // Derivatives & Options
    'snx', 'synthetix', 'lyra', 'premia', 'hegic', 'opyn', 'pods',
    // Bridges & Cross-chain
    'stargate', 'stg', 'hop', 'across', 'acx', 'synapse', 'syn', 'celer', 'celr',
    'multichain', 'multi', 'anyswap', 'any', 'wormhole', 'layer zero', 'lz',
    // Other DeFi
    'inst', 'instadapp', 'gns', 'gains', 'kwenta', 'pols', 'polkastarter',
    'api3', 'band', 'uma', 'ren', 'keep', 'nu', 'nucypher', 'threshold', 't',
    'egg', 'eigenlayer', 'eigen', 'ether.fi', 'ethfi',
    'pendle', 'ena', 'ethena',
    // Additional DeFi protocols
    'drv', 'lit', 'resolv', 'angle', 'usdr',
    // L2 & Infrastructure tokens (protocol governance)
    'arb', 'arbitrum', 'op', 'optimism', 'strk', 'starknet', 'stark',
    'matic', 'polygon', 'pol', 'zk', 'zksync', 'manta', 'scroll', 'scr',
    'linea', 'base', 'blast', 'mode', 'metis', 'boba', 'mantle', 'mnt',
    'avax', 'avalanche', 'ftm', 'fantom', 'one', 'harmony', 'celo',
    'movr', 'moonriver', 'glmr', 'moonbeam', 'kava', 'canto',
    // Cross-chain infrastructure
    'atom', 'cosmos', 'dot', 'polkadot', 'ksm', 'kusama',
    'link', 'chainlink', 'pyth', 'band',
  ]);

  // RWA (Real World Assets) tokens
  private rwaTokens = new Set([
    // Tokenized treasuries & bonds
    'ondo', 'maple', 'mpl', 'goldfinch', 'gfi', 'centrifuge', 'cfg', 'syrup',
    'clearpool', 'cpool', 'truefi', 'tru', 'credix',
    // Tokenized commodities
    'paxg', 'xaut', 'tgold', 'dgld', 'pmgt', 'cache', 'cgo',
    // Real estate tokens
    'rwa', 'realtoken', 'realt', 'landshare', 'land', 'propy', 'pro',
    'labs', 'labs group', 'parcl', 'lofty',
    // RWA protocols
    'maker rwa', 'centrifuge', 'backed', 'buidl', 'superstate',
    'matrixdock', 'mstable', 'reserve', 'rsv',
    // Note: usdy, usdm, sdai are yield-bearing stablecoins - categorized as stablecoins
    // Yield-bearing RWA tokens (not stablecoins)
    'mountain', 'susds',
  ]);

  // Privacy tokens
  private privacyTokens = new Set([
    'xmr', 'monero', 'zec', 'zcash', 'dash', 'scrt', 'secret',
    'rose', 'oasis', 'arrr', 'pirate', 'firo', 'beam', 'grin',
    'nym', 'prcy', 'dero', 'haven', 'xhv', 'oxen', 'mask',
    'tornado', 'torn', 'railgun', 'rail', 'aztec', 'iron fish', 'iron',
    'penumbra', 'anoma', 'namada', 'zcn', 'zano',
  ]);

  // AI & Machine Learning tokens
  private aiTokens = new Set([
    'fet', 'fetch', 'agix', 'singularitynet', 'ocean', 'oceanprotocol', 'vvv', 'giza',
    'rndr', 'render', 'tao', 'bittensor', 'akt', 'akash', 'grt', 'thegraph',
    'ar', 'arweave', 'fil', 'filecoin', 'storj', 'sia', 'sc',
    'nmt', 'numer', 'numeraire', 'clv', 'cortex', 'ctxc', 'nmr',
    'vana', 'prime', 'ai16z', 'virtual', 'virtuals', 'goat', 'act',
    'arc', 'griffain', 'fartcoin', 'zerebro', 'aixbt', 'grass',
    'io', 'io.net', 'worldcoin', 'wld', 'jasmy', 'phala', 'pha',
    'nosana', 'nos', 'near', 'oort', 'gpu', 'exo', 'exabits',
  ]);

  // Meme coins
  // Note: GOAT removed - categorized as AI (AI agent token)
  private memeTokens = new Set([
    'doge', 'dogecoin', 'shib', 'shiba', 'pepe', 'floki', 'bonk',
    'wif', 'dogwifhat', 'meme', 'wojak', 'turbo', 'bob', 'ladys',
    'milady', 'brett', 'mog', 'popcat', 'pnut', 'neiro',
    'cate', 'cat', 'toshi', 'higher', 'degen', 'based', 'normie',
    'ponke', 'wen', 'myro', 'slerf', 'bome', 'book of meme',
    'trump', 'biden', 'tremp', 'boden', 'jeo', 'doland',
    'mother', 'father', 'retardio', 'gigachad', 'chad', 'pork', 'ham',
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

  // --- Metals (tokenized + ETFs/ETCs) ---
  private metalsGold = new Set([
    // Tokenized gold
    'xaut', 'paxg', 'xau', 'tgold', 'dgld', 'pmgt', 'cache', 'cgo',
    // Gold ETFs/ETCs
    'gld', 'iau', 'gldm', 'sgol', 'phys', 'bar', 'aau', 'aaau',
  ]);

  private metalsSilver = new Set([
    // Tokenized silver
    'xag', 'xage',
    // Silver ETFs/ETCs
    'slv', 'sivr', 'pslv',
  ]);

  private metalsPlatinum = new Set([
    // Platinum ETFs/ETCs
    'pplt',
    // Tokenized platinum (ISO code)
    'xpt',
  ]);

  private metalsPalladium = new Set([
    // Palladium ETFs/ETCs
    'pall',
    // Tokenized palladium (ISO code)
    'xpd',
  ]);

  private metalsMiners = new Set([
    // Mining ETFs
    'gdx', 'gdxj', 'sil', 'silj', 'ring',
  ]);

  // Main category colors
  private mainCategoryColors: Record<MainCategory, string> = {
    crypto: UI_CATEGORY_COLORS.crypto,
    equities: UI_CATEGORY_COLORS.equities,
    metals: UI_CATEGORY_COLORS.metals,
    cash: UI_CATEGORY_COLORS.cash,
    other: UI_CATEGORY_COLORS.other,
  };

  // Sub-category colors
  private subCategoryColors: Record<string, string> = {
    ...UI_SUBCATEGORY_COLORS,
  };

  // Category labels
  private mainCategoryLabels: Record<MainCategory, string> = {
    crypto: 'Crypto',
    equities: 'Equities',
    metals: 'Metals',
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
    metals_gold: 'Gold',
    metals_silver: 'Silver',
    metals_platinum: 'Platinum',
    metals_palladium: 'Palladium',
    metals_miners: 'Miners',
  };

  // Exposure category configuration (more granular breakdown for crypto)
  // Perp positions count towards their underlying asset exposure (e.g., BTC perp -> BTC)
  private exposureCategoryConfig: Record<ExposureCategoryType, ExposureCategoryConfig> = {
    stablecoins: { ...EXPOSURE_CATEGORY_CONFIG.stablecoins },
    eth: { ...EXPOSURE_CATEGORY_CONFIG.eth },
    defi: { ...EXPOSURE_CATEGORY_CONFIG.defi },
    btc: { ...EXPOSURE_CATEGORY_CONFIG.btc },
    rwa: { ...EXPOSURE_CATEGORY_CONFIG.rwa },
    sol: { ...EXPOSURE_CATEGORY_CONFIG.sol },
    privacy: { ...EXPOSURE_CATEGORY_CONFIG.privacy },
    ai: { ...EXPOSURE_CATEGORY_CONFIG.ai },
    meme: { ...EXPOSURE_CATEGORY_CONFIG.meme },
    tokens: { ...EXPOSURE_CATEGORY_CONFIG.tokens },
  };

  /**
   * Get the set of fiat currency codes (lowercase)
   */
  getFiatCurrencies(): Set<string> {
    return this.fiatCurrencies;
  }

  /**
   * Check if a protocol is a perps/derivatives protocol
   */
  isPerpProtocol(protocol?: string): boolean {
    if (!protocol) return false;
    const normalized = protocol.toLowerCase().trim();
    return this.perpProtocols.has(normalized) ||
           normalized.includes('hyperliquid') ||
           normalized.includes('lighter') ||
           normalized.includes('ethereal') ||
           normalized.includes('vertex') ||
           normalized.includes('drift');
  }

  /**
   * Get the underlying fiat currency for a stablecoin or cash position
   * Maps crypto stablecoins to their pegged fiat (USDC -> USD, EURC -> EUR)
   * Also handles Pendle PT tokens (PT-sUSDe -> USD)
   * Returns the fiat currency code (USD, EUR, GBP, etc.) or null if not a stablecoin
   */
  getUnderlyingFiatCurrency(symbol: string): string | null {
    const lower = symbol.toLowerCase().trim();

    // Direct fiat currency
    if (this.fiatCurrencies.has(lower)) {
      return lower.toUpperCase();
    }

    // USD stablecoins
    if (this.usdStablecoins.has(lower)) {
      return 'USD';
    }

    // EUR stablecoins
    if (this.eurStablecoins.has(lower)) {
      return 'EUR';
    }

    // GBP stablecoins
    if (this.gbpStablecoins.has(lower)) {
      return 'GBP';
    }

    // Handle Pendle PT/YT tokens - check underlying asset
    if (lower.startsWith('pt-') || lower.startsWith('yt-') ||
        lower.startsWith('pt_') || lower.startsWith('yt_')) {
      // USD-based underlyings
      if (lower.includes('usd') || lower.includes('dai') || lower.includes('frax') ||
          lower.includes('gho') || lower.includes('lusd') || lower.includes('mkusd') ||
          lower.includes('crvusd') || lower.includes('pyusd') || lower.includes('dola') ||
          lower.includes('mim') || lower.includes('fdusd')) {
        return 'USD';
      }
      // EUR-based underlyings
      if (lower.includes('eur')) {
        return 'EUR';
      }
      // GBP-based underlyings
      if (lower.includes('gbp')) {
        return 'GBP';
      }
    }

    // Handle wrapped/bridged stablecoins with prefixes
    // e.g., "wxdai" is already in usdStablecoins, but catch any variants
    if (lower.endsWith('dai') || lower.endsWith('usd') || lower.endsWith('usdc') ||
        lower.endsWith('usdt') || lower.endsWith('frax')) {
      return 'USD';
    }

    // Not a stablecoin or fiat
    return null;
  }

  /**
   * Check if a symbol is a stablecoin
   */
  isStablecoin(symbol: string): boolean {
    const lower = symbol.toLowerCase().trim();

    // Direct check
    if (this.stablecoins.has(lower)) {
      return true;
    }

    // Check for PT tokens on stablecoins
    if (lower.startsWith('pt-') || lower.startsWith('yt-') ||
        lower.startsWith('pt_') || lower.startsWith('yt_')) {
      if (lower.includes('usd') || lower.includes('dai') || lower.includes('frax') ||
          lower.includes('gho') || lower.includes('lusd') || lower.includes('eur') ||
          lower.includes('gbp') || lower.includes('mkusd') || lower.includes('crvusd')) {
        return true;
      }
    }

    return false;
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
   * Check if a symbol is a known metal (tokenized or ETF/ETC)
   */
  private isMetalSymbol(symbol: string): boolean {
    const normalized = symbol.toLowerCase().trim();
    return this.metalsGold.has(normalized) ||
      this.metalsSilver.has(normalized) ||
      this.metalsPlatinum.has(normalized) ||
      this.metalsPalladium.has(normalized) ||
      this.metalsMiners.has(normalized);
  }

  /**
   * Resolve metal sub-category for a symbol
   */
  private getMetalSubCategory(symbol: string): MetalsSubCategory {
    const normalized = symbol.toLowerCase().trim();
    if (this.metalsGold.has(normalized)) return 'gold';
    if (this.metalsSilver.has(normalized)) return 'silver';
    if (this.metalsPlatinum.has(normalized)) return 'platinum';
    if (this.metalsPalladium.has(normalized)) return 'palladium';
    return 'miners';
  }

  /**
   * Get the main category for an asset
   * Accepts both legacy AssetType ('crypto'|'stock'|'etf'|'cash'|'manual')
   * and new AssetClass ('crypto'|'equity'|'cash'|'other') values.
   */
  getMainCategory(symbol: string, assetType?: string): MainCategory {
    // Cash positions (explicit type or class)
    if (assetType === 'cash') {
      return 'cash';
    }

    // Check for cash symbol patterns (e.g., "CASH_CHF_123456")
    if (symbol.toLowerCase().startsWith('cash_')) {
      return 'cash';
    }

    // Metals positions (explicit class)
    if (assetType === 'metals') {
      return 'metals';
    }

    const normalizedSymbol = symbol.toLowerCase().trim();

    // Metals positions (symbol-based override)
    if (this.isMetalSymbol(normalizedSymbol)) {
      return 'metals';
    }

    // Stock/ETF positions (equities) - legacy types
    if (assetType === 'stock' || assetType === 'etf') {
      return 'equities';
    }

    // Equity positions (new AssetClass)
    if (assetType === 'equity') {
      return 'equities';
    }

    // Crypto positions
    if (assetType === 'crypto') {
      return 'crypto';
    }

    // Other positions (new AssetClass)
    if (assetType === 'other') {
      return 'other';
    }

    // Manual/untyped positions - try to categorize by symbol

    // Check if it's a fiat currency (for bank accounts)
    if (this.fiatCurrencies.has(normalizedSymbol)) {
      return 'cash';
    }

    // Check if it's a crypto asset
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
   * Accepts both legacy AssetType and new AssetClass values.
   */
  getSubCategory(symbol: string, assetType?: string): SubCategory {
    const normalizedSymbol = symbol.toLowerCase().trim();

    // Metals sub-categories
    if (assetType === 'metals' || this.getMainCategory(symbol, assetType) === 'metals') {
      return this.getMetalSubCategory(normalizedSymbol);
    }

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
    // Also handles new AssetClass 'equity'
    if (assetType === 'stock' || assetType === 'etf' || assetType === 'equity' || this.getMainCategory(symbol, assetType) === 'equities') {
      if (assetType === 'etf') return 'etfs';
      // Check known ETF symbols - this overrides legacy positions that were added as 'stock' before ETF selection existed
      if (this.isKnownEtf(normalizedSymbol)) return 'etfs';
      return 'stocks';
    }

    return 'none';
  }

  /**
   * Get exposure category for a crypto asset (more granular than sub-category)
   * Used for the Exposure donut chart breakdown
   * Priority: stablecoins > btc > eth > sol > defi > rwa > privacy > ai > meme > tokens
   */
  getExposureCategory(symbol: string, assetType?: string): ExposureCategoryType {
    const normalizedSymbol = symbol.toLowerCase().trim();

    // Only classify crypto assets
    if (this.getMainCategory(symbol, assetType) !== 'crypto') {
      return 'tokens'; // Non-crypto returns tokens as fallback
    }

    // Check core assets first (most common)
    if (this.stablecoins.has(normalizedSymbol)) return 'stablecoins';
    if (this.btcLike.has(normalizedSymbol)) return 'btc';
    if (this.ethLike.has(normalizedSymbol)) return 'eth';
    if (this.solLike.has(normalizedSymbol)) return 'sol';

    // Check thematic categories
    if (this.defiTokens.has(normalizedSymbol)) return 'defi';
    if (this.rwaTokens.has(normalizedSymbol)) return 'rwa';
    if (this.privacyTokens.has(normalizedSymbol)) return 'privacy';
    if (this.aiTokens.has(normalizedSymbol)) return 'ai';
    if (this.memeTokens.has(normalizedSymbol)) return 'meme';

    // Check Pendle tokens (yield derivatives)
    const isPendleToken = normalizedSymbol.startsWith('pt-') || normalizedSymbol.startsWith('yt-') ||
      normalizedSymbol.includes('pt-') || normalizedSymbol.includes('yt-');
    if (isPendleToken) {
      // Pendle tokens inherit the underlying asset's category
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
      // Default Pendle tokens to DeFi
      return 'defi';
    }

    // Default to tokens
    return 'tokens';
  }

  /**
   * Get exposure category config (color and label)
   */
  getExposureCategoryConfig(category: ExposureCategoryType): ExposureCategoryConfig {
    return this.exposureCategoryConfig[category] || this.exposureCategoryConfig.tokens;
  }

  /**
   * Get all exposure category configs
   */
  getAllExposureCategoryConfigs(): Record<ExposureCategoryType, ExposureCategoryConfig> {
    return { ...this.exposureCategoryConfig };
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
   * Get asset class (storage-level classification) from symbol + type.
   * Maps main categories to AssetClass values.
   */
  getAssetClass(symbol: string, assetType?: string): AssetClass {
    const main = this.getMainCategory(symbol, assetType);
    switch (main) {
      case 'crypto':
        return 'crypto';
      case 'equities':
        return 'equity';
      case 'metals':
        return 'metals';
      case 'cash':
        return 'cash';
      case 'other':
      default:
        return 'other';
    }
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
    return ['crypto', 'equities', 'metals', 'cash', 'other'];
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
      case 'metals':
        return ['gold', 'silver', 'platinum', 'palladium', 'miners'];
      default:
        return [];
    }
  }

  /**
   * Get all display categories (main categories for overview)
   */
  getDisplayCategories(): MainCategory[] {
    return ['crypto', 'equities', 'metals', 'cash', 'other'];
  }

  /**
   * Get all sub-categories for display (combined keys)
   */
  getAllSubCategories(): AssetCategory[] {
    return [
      'crypto_btc', 'crypto_eth', 'crypto_sol', 'crypto_stablecoins', 'crypto_tokens', 'crypto_perps',
      'equities_stocks', 'equities_etfs',
      'metals_gold', 'metals_silver', 'metals_platinum', 'metals_palladium', 'metals_miners',
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

  /**
   * Validate category data integrity - detect duplicate tokens across categories
   * Returns array of issues found (empty array means no issues)
   * Use this for debugging and ensuring clean categorization
   */
  validateCategories(): { token: string; categories: string[] }[] {
    const tokenCategories = new Map<string, string[]>();
    const categorySets: { name: string; set: Set<string> }[] = [
      { name: 'stablecoins', set: this.stablecoins },
      { name: 'btcLike', set: this.btcLike },
      { name: 'ethLike', set: this.ethLike },
      { name: 'solLike', set: this.solLike },
      { name: 'defiTokens', set: this.defiTokens },
      { name: 'rwaTokens', set: this.rwaTokens },
      { name: 'privacyTokens', set: this.privacyTokens },
      { name: 'aiTokens', set: this.aiTokens },
      { name: 'memeTokens', set: this.memeTokens },
    ];

    // Build map of token -> categories
    for (const { name, set } of categorySets) {
      for (const token of set) {
        const existing = tokenCategories.get(token) || [];
        existing.push(name);
        tokenCategories.set(token, existing);
      }
    }

    // Find duplicates
    const duplicates: { token: string; categories: string[] }[] = [];
    for (const [token, categories] of tokenCategories) {
      if (categories.length > 1) {
        duplicates.push({ token, categories });
      }
    }

    return duplicates.sort((a, b) => a.token.localeCompare(b.token));
  }

  /**
   * Get all categorized tokens with their assigned category
   * Useful for auditing and debugging
   */
  getAllCategorizedTokens(): { token: string; category: ExposureCategoryType }[] {
    const result: { token: string; category: ExposureCategoryType }[] = [];

    const addTokens = (set: Set<string>, category: ExposureCategoryType) => {
      for (const token of set) {
        result.push({ token, category });
      }
    };

    addTokens(this.stablecoins, 'stablecoins');
    addTokens(this.btcLike, 'btc');
    addTokens(this.ethLike, 'eth');
    addTokens(this.solLike, 'sol');
    addTokens(this.defiTokens, 'defi');
    addTokens(this.rwaTokens, 'rwa');
    addTokens(this.privacyTokens, 'privacy');
    addTokens(this.aiTokens, 'ai');
    addTokens(this.memeTokens, 'meme');

    return result.sort((a, b) => a.token.localeCompare(b.token));
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

export function getAssetClass(symbol: string, assetType?: string): AssetClass {
  return getCategoryService().getAssetClass(symbol, assetType);
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

export function getExposureCategory(symbol: string, assetType?: string): ExposureCategoryType {
  return getCategoryService().getExposureCategory(symbol, assetType);
}

export function getExposureCategoryConfig(category: ExposureCategoryType): ExposureCategoryConfig {
  return getCategoryService().getExposureCategoryConfig(category);
}

export function getAllExposureCategoryConfigs(): Record<ExposureCategoryType, ExposureCategoryConfig> {
  return getCategoryService().getAllExposureCategoryConfigs();
}

export function validateCategories(): { token: string; categories: string[] }[] {
  return getCategoryService().validateCategories();
}

export function getAllCategorizedTokens(): { token: string; category: ExposureCategoryType }[] {
  return getCategoryService().getAllCategorizedTokens();
}

export function getUnderlyingFiatCurrency(symbol: string): string | null {
  return getCategoryService().getUnderlyingFiatCurrency(symbol);
}

export function isStablecoin(symbol: string): boolean {
  return getCategoryService().isStablecoin(symbol);
}

export function getFiatCurrencies(): Set<string> {
  return getCategoryService().getFiatCurrencies();
}
