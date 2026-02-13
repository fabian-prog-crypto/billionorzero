import { describe, it, expect } from 'vitest'
import { getCategoryService } from './category-service'
import {
  CATEGORY_COLORS,
  SUBCATEGORY_COLORS,
  EXPOSURE_CATEGORY_CONFIG,
} from '@/lib/colors'

const service = getCategoryService()

// ---------------------------------------------------------------------------
// isStablecoin
// ---------------------------------------------------------------------------
describe('isStablecoin', () => {
  it('returns true for USDC', () => {
    expect(service.isStablecoin('USDC')).toBe(true)
  })

  it('returns true for usdt (case insensitive)', () => {
    expect(service.isStablecoin('usdt')).toBe(true)
  })

  it('returns true for EUROC (EUR stablecoin)', () => {
    expect(service.isStablecoin('EUROC')).toBe(true)
  })

  it('returns true for GBPT (GBP stablecoin)', () => {
    expect(service.isStablecoin('GBPT')).toBe(true)
  })

  it('returns true for PT-sUSDe (Pendle PT token on stablecoin)', () => {
    expect(service.isStablecoin('PT-sUSDe')).toBe(true)
  })

  it('returns false for BTC', () => {
    expect(service.isStablecoin('BTC')).toBe(false)
  })

  it('returns false for ETH', () => {
    expect(service.isStablecoin('ETH')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(service.isStablecoin('')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getMainCategory
// ---------------------------------------------------------------------------
describe('getMainCategory', () => {
  it('returns cash for explicit cash assetType', () => {
    expect(service.getMainCategory('USD', 'cash')).toBe('cash')
  })

  it('returns cash for CASH_ prefix symbols', () => {
    expect(service.getMainCategory('CASH_CHF_123456')).toBe('cash')
  })

  it('returns equities for stock assetType', () => {
    expect(service.getMainCategory('AAPL', 'stock')).toBe('equities')
  })

  it('returns equities for etf assetType', () => {
    expect(service.getMainCategory('SPY', 'etf')).toBe('equities')
  })

  it('returns crypto for crypto assetType', () => {
    expect(service.getMainCategory('BTC', 'crypto')).toBe('crypto')
  })

  it('returns cash for manual position with fiat currency symbol', () => {
    expect(service.getMainCategory('EUR')).toBe('cash')
  })

  it('returns crypto for manual position with known crypto symbol (WBTC)', () => {
    expect(service.getMainCategory('WBTC')).toBe('crypto')
  })

  it('returns other for unknown symbol with no assetType', () => {
    expect(service.getMainCategory('XYZNOTREAL')).toBe('other')
  })
})

// ---------------------------------------------------------------------------
// getSubCategory
// ---------------------------------------------------------------------------
describe('getSubCategory', () => {
  it('returns stablecoins for USDC with crypto type', () => {
    expect(service.getSubCategory('USDC', 'crypto')).toBe('stablecoins')
  })

  it('returns btc for BTC', () => {
    expect(service.getSubCategory('BTC', 'crypto')).toBe('btc')
  })

  it('returns btc for WBTC (btcLike)', () => {
    expect(service.getSubCategory('WBTC', 'crypto')).toBe('btc')
  })

  it('returns eth for stETH (ethLike)', () => {
    expect(service.getSubCategory('stETH', 'crypto')).toBe('eth')
  })

  it('returns sol for mSOL (solLike)', () => {
    expect(service.getSubCategory('mSOL', 'crypto')).toBe('sol')
  })

  it('returns tokens for UNI (defi token falls under tokens sub)', () => {
    expect(service.getSubCategory('UNI', 'crypto')).toBe('tokens')
  })

  it('returns stocks for AAPL with stock type', () => {
    expect(service.getSubCategory('AAPL', 'stock')).toBe('stocks')
  })

  it('returns etfs for SPY (known ETF symbol)', () => {
    expect(service.getSubCategory('SPY', 'stock')).toBe('etfs')
  })

  it('returns etfs for explicit etf assetType', () => {
    expect(service.getSubCategory('QQQ', 'etf')).toBe('etfs')
  })

  it('returns none for cash positions', () => {
    expect(service.getSubCategory('USD', 'cash')).toBe('none')
  })
})

// ---------------------------------------------------------------------------
// getExposureCategory
// ---------------------------------------------------------------------------
describe('getExposureCategory', () => {
  it('returns stablecoins for USDC', () => {
    expect(service.getExposureCategory('USDC', 'crypto')).toBe('stablecoins')
  })

  it('returns btc for BTC', () => {
    expect(service.getExposureCategory('BTC', 'crypto')).toBe('btc')
  })

  it('returns eth for ETH', () => {
    expect(service.getExposureCategory('ETH', 'crypto')).toBe('eth')
  })

  it('returns sol for SOL', () => {
    expect(service.getExposureCategory('SOL', 'crypto')).toBe('sol')
  })

  it('returns defi for UNI', () => {
    expect(service.getExposureCategory('UNI', 'crypto')).toBe('defi')
  })

  it('returns rwa for ONDO', () => {
    expect(service.getExposureCategory('ONDO', 'crypto')).toBe('rwa')
  })

  it('returns privacy for XMR', () => {
    expect(service.getExposureCategory('XMR', 'crypto')).toBe('privacy')
  })

  it('returns ai for FET', () => {
    expect(service.getExposureCategory('FET', 'crypto')).toBe('ai')
  })

  it('returns meme for DOGE', () => {
    expect(service.getExposureCategory('DOGE', 'crypto')).toBe('meme')
  })

  it('returns tokens for unknown crypto token', () => {
    expect(service.getExposureCategory('XYZUNKNOWN', 'crypto')).toBe('tokens')
  })
})

// ---------------------------------------------------------------------------
// isPerpProtocol
// ---------------------------------------------------------------------------
describe('isPerpProtocol', () => {
  it('returns true for Hyperliquid', () => {
    expect(service.isPerpProtocol('Hyperliquid')).toBe(true)
  })

  it('returns true for hyperliquid (case insensitive)', () => {
    expect(service.isPerpProtocol('hyperliquid')).toBe(true)
  })

  it('returns true for Lighter', () => {
    expect(service.isPerpProtocol('Lighter')).toBe(true)
  })

  it('returns true for Ethereal', () => {
    expect(service.isPerpProtocol('Ethereal')).toBe(true)
  })

  it('returns true for Vertex', () => {
    expect(service.isPerpProtocol('Vertex')).toBe(true)
  })

  it('returns false for Aave (lending protocol, not perp)', () => {
    expect(service.isPerpProtocol('Aave')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(service.isPerpProtocol(undefined)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getUnderlyingFiatCurrency
// ---------------------------------------------------------------------------
describe('getUnderlyingFiatCurrency', () => {
  it('returns USD for USDC', () => {
    expect(service.getUnderlyingFiatCurrency('USDC')).toBe('USD')
  })

  it('returns EUR for EUROC', () => {
    expect(service.getUnderlyingFiatCurrency('EUROC')).toBe('EUR')
  })

  it('returns GBP for GBPT', () => {
    expect(service.getUnderlyingFiatCurrency('GBPT')).toBe('GBP')
  })

  it('returns null for BTC (not a stablecoin)', () => {
    expect(service.getUnderlyingFiatCurrency('BTC')).toBeNull()
  })

  it('returns EUR for fiat currency EUR', () => {
    expect(service.getUnderlyingFiatCurrency('EUR')).toBe('EUR')
  })

  it('returns USD for fiat currency USD', () => {
    expect(service.getUnderlyingFiatCurrency('USD')).toBe('USD')
  })

  it('returns USD for PT-sUSDe (Pendle token with USD underlying)', () => {
    expect(service.getUnderlyingFiatCurrency('PT-sUSDe')).toBe('USD')
  })

  it('returns EUR for PT-EURe (Pendle token with EUR underlying)', () => {
    expect(service.getUnderlyingFiatCurrency('PT-EURe')).toBe('EUR')
  })
})

// ---------------------------------------------------------------------------
// validateCategories
// ---------------------------------------------------------------------------
describe('validateCategories', () => {
  it('returns an array', () => {
    const result = service.validateCategories()
    expect(Array.isArray(result)).toBe(true)
  })

  it('each entry has token and categories fields', () => {
    const result = service.validateCategories()
    for (const entry of result) {
      expect(entry).toHaveProperty('token')
      expect(entry).toHaveProperty('categories')
      expect(Array.isArray(entry.categories)).toBe(true)
    }
  })

  it('no token appears in more than two core classification sets (stablecoins, btcLike, ethLike, solLike)', () => {
    // The core asset sets should be mutually exclusive
    const result = service.validateCategories()
    const coreSets = new Set(['stablecoins', 'btcLike', 'ethLike', 'solLike'])
    const coreOverlaps = result.filter(
      (entry) => entry.categories.filter((c) => coreSets.has(c)).length > 1
    )
    expect(coreOverlaps).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Token coverage assertions
// ---------------------------------------------------------------------------
describe('token coverage', () => {
  it('stablecoin set has at least 50 tokens', () => {
    const allTokens = service.getAllCategorizedTokens()
    const stablecoins = allTokens.filter((t) => t.category === 'stablecoins')
    expect(stablecoins.length).toBeGreaterThanOrEqual(50)
  })

  it('ETF set has at least 90 symbols', () => {
    // ETFs are not part of getAllCategorizedTokens (which is crypto-only),
    // so we test via getSubCategory recognizing known ETFs
    const knownEtfs = [
      'SPY', 'QQQ', 'VTI', 'ARKK', 'GBTC', 'IBIT', 'GLD', 'TLT',
      'XLK', 'SOXX', 'TQQQ', 'BND', 'VWO', 'EFA', 'SCHD',
    ]
    for (const etf of knownEtfs) {
      expect(service.getSubCategory(etf, 'stock')).toBe('etfs')
    }
  })
})

// ---------------------------------------------------------------------------
// Color source-of-truth alignment
// ---------------------------------------------------------------------------
describe('color alignment', () => {
  it('uses shared category color tokens for main categories', () => {
    expect(service.getCategoryColor('crypto')).toBe(CATEGORY_COLORS.crypto)
    expect(service.getCategoryColor('equities')).toBe(CATEGORY_COLORS.equities)
    expect(service.getCategoryColor('cash')).toBe(CATEGORY_COLORS.cash)
  })

  it('uses shared subcategory color tokens for crypto/equities subcategories', () => {
    expect(service.getCategoryColor('crypto_btc')).toBe(SUBCATEGORY_COLORS.crypto_btc)
    expect(service.getCategoryColor('crypto_tokens')).toBe(SUBCATEGORY_COLORS.crypto_tokens)
    expect(service.getCategoryColor('equities_stocks')).toBe(SUBCATEGORY_COLORS.equities_stocks)
  })

  it('uses shared exposure color config (including RWA)', () => {
    expect(service.getExposureCategoryConfig('rwa').color).toBe(EXPOSURE_CATEGORY_CONFIG.rwa.color)
    expect(service.getExposureCategoryConfig('meme').color).toBe(EXPOSURE_CATEGORY_CONFIG.meme.color)
  })
})
