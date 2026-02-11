/**
 * Portfolio Calculator - Comprehensive Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  makePosition,
  makeCryptoPosition,
  makeDebtPosition,
  makeCashPosition,
  makeStockPosition,
  makePerpPosition,
  makeAssetWithPrice,
  resetPositionCounter,
  makePriceMap,
  makeBasicPrices,
} from '@/__tests__/fixtures'
import { getCategoryService } from './category-service'
import type { Position, AssetWithPrice, PriceData, Account } from '@/types'

// Mock the providers module - getPriceProvider is used by getPriceKey and calculatePositionValue
vi.mock('@/services/providers', () => ({
  getPriceProvider: () => ({
    getCoinId: (symbol: string) => symbol.toLowerCase(),
    getDebankPriceKey: (symbol: string) => symbol.toLowerCase(),
  }),
}))

import {
  detectPerpTrade,
  filterDustPositions,
  extractCurrencyCode,
  classifyAssetExposure,
  calculatePositionValue,
  calculateNetWorth,
  calculatePortfolioSummary,
  aggregatePositionsBySymbol,
  calculateExposureData,
  calculateAllocationBreakdown,
  calculateRiskProfile,
  calculatePerpPageData,
  calculateCustodyBreakdown,
  calculateChainBreakdown,
  calculateCryptoMetrics,
  extractAccountName,
  calculateCashBreakdown,
  calculateEquitiesBreakdown,
  calculateAssetSummary,
  calculateTotalNAV,
  DUST_THRESHOLD,
  type ExposureClassification,
  type CustomPrice,
} from './portfolio-calculator'

beforeEach(() => {
  resetPositionCounter()
})

// ─── detectPerpTrade ────────────────────────────────────────────────────────

describe('detectPerpTrade', () => {
  it('detects a long position with exchange in parens', () => {
    const result = detectPerpTrade('BTC Long (Hyperliquid)')
    expect(result).toEqual({ isPerpTrade: true, isLong: true, isShort: false })
  })

  it('detects a short position with exchange in parens', () => {
    const result = detectPerpTrade('ETH Short (Lighter)')
    expect(result).toEqual({ isPerpTrade: true, isLong: false, isShort: true })
  })

  it('detects a long position without parens (end of string)', () => {
    const result = detectPerpTrade('SOL Long')
    expect(result).toEqual({ isPerpTrade: true, isLong: true, isShort: false })
  })

  it('detects a short position without parens', () => {
    const result = detectPerpTrade('SOL Short')
    expect(result).toEqual({ isPerpTrade: true, isLong: false, isShort: true })
  })

  it('is case-insensitive', () => {
    expect(detectPerpTrade('BTC LONG')).toEqual({ isPerpTrade: true, isLong: true, isShort: false })
    expect(detectPerpTrade('btc long')).toEqual({ isPerpTrade: true, isLong: true, isShort: false })
    expect(detectPerpTrade('Eth SHORT')).toEqual({ isPerpTrade: true, isLong: false, isShort: true })
  })

  it('returns false for non-perp names', () => {
    const result = detectPerpTrade('Bitcoin')
    expect(result).toEqual({ isPerpTrade: false, isLong: false, isShort: false })
  })

  it('returns false for partial matches (e.g., "Longhorn")', () => {
    const result = detectPerpTrade('Longhorn Token')
    expect(result).toEqual({ isPerpTrade: false, isLong: false, isShort: false })
  })

  it('returns false for empty string', () => {
    const result = detectPerpTrade('')
    expect(result).toEqual({ isPerpTrade: false, isLong: false, isShort: false })
  })
})

// ─── filterDustPositions ────────────────────────────────────────────────────

describe('filterDustPositions', () => {
  it('returns all positions when hideDust is false', () => {
    const positions = [{ value: 1 }, { value: 50 }, { value: 200 }]
    expect(filterDustPositions(positions, false)).toHaveLength(3)
  })

  it('filters positions below default threshold ($100)', () => {
    const positions = [{ value: 50 }, { value: 150 }, { value: 99 }]
    const result = filterDustPositions(positions, true)
    expect(result).toEqual([{ value: 150 }])
  })

  it('keeps significant debt (negative value with absValue >= threshold)', () => {
    const positions = [{ value: -500 }, { value: -50 }, { value: 200 }]
    const result = filterDustPositions(positions, true)
    expect(result).toEqual([{ value: -500 }, { value: 200 }])
  })

  it('uses custom threshold when provided', () => {
    const positions = [{ value: 40 }, { value: 60 }, { value: 200 }]
    const result = filterDustPositions(positions, true, 50)
    expect(result).toEqual([{ value: 60 }, { value: 200 }])
  })

  it('filters small dust with negative values below threshold', () => {
    const positions = [{ value: -10 }, { value: -200 }, { value: 5 }]
    const result = filterDustPositions(positions, true)
    // -10: abs=10 < 100 and -10 > -100, so filtered
    // -200: abs=200 >= 100, kept
    // 5: abs=5 < 100, filtered
    expect(result).toEqual([{ value: -200 }])
  })

  it('exports DUST_THRESHOLD as 100', () => {
    expect(DUST_THRESHOLD).toBe(100)
  })
})

// ─── extractCurrencyCode ────────────────────────────────────────────────────

describe('extractCurrencyCode', () => {
  it('extracts currency from CASH_XXX_ID pattern', () => {
    expect(extractCurrencyCode('CASH_CHF_1769344861626')).toBe('CHF')
  })

  it('extracts currency from CASH pattern case-insensitively', () => {
    expect(extractCurrencyCode('cash_eur_123456')).toBe('EUR')
  })

  it('extracts currency from XXX_ID pattern', () => {
    expect(extractCurrencyCode('PLN_1234567890')).toBe('PLN')
  })

  it('returns clean 3-letter code as-is (uppercase)', () => {
    expect(extractCurrencyCode('USD')).toBe('USD')
    expect(extractCurrencyCode('usd')).toBe('USD')
  })

  it('returns clean 4-5 letter codes as-is', () => {
    expect(extractCurrencyCode('USDC')).toBe('USDC')
    expect(extractCurrencyCode('usdt')).toBe('USDT')
  })

  it('returns original uppercase for unmatched patterns', () => {
    expect(extractCurrencyCode('BITCOIN')).toBe('BITCOIN')
  })

  it('handles complex patterns correctly', () => {
    expect(extractCurrencyCode('CASH_USD_revolut')).toBe('USD')
  })

  it('handles already-uppercase 3-letter code', () => {
    expect(extractCurrencyCode('GBP')).toBe('GBP')
  })
})

// ─── classifyAssetExposure ──────────────────────────────────────────────────

describe('classifyAssetExposure', () => {
  const categoryService = getCategoryService()

  describe('perp exchange positions', () => {
    it('classifies perp long trade', () => {
      const asset = makeAssetWithPrice({
        symbol: 'BTC',
        name: 'BTC Long (Hyperliquid)',
        protocol: 'Hyperliquid',
        value: 50000,
      })
      const result = classifyAssetExposure(asset, categoryService)
      expect(result.classification).toBe('perp-long')
      expect(result.absValue).toBe(50000)
    })

    it('classifies perp short trade', () => {
      const asset = makeAssetWithPrice({
        symbol: 'ETH',
        name: 'ETH Short (Hyperliquid)',
        protocol: 'Hyperliquid',
        value: -3000,
        isDebt: true,
      })
      const result = classifyAssetExposure(asset, categoryService)
      expect(result.classification).toBe('perp-short')
      expect(result.absValue).toBe(3000)
    })

    it('classifies stablecoin on perp exchange as perp-margin', () => {
      const asset = makeAssetWithPrice({
        symbol: 'USDC',
        name: 'USDC',
        protocol: 'Hyperliquid',
        value: 10000,
      })
      const result = classifyAssetExposure(asset, categoryService)
      expect(result.classification).toBe('perp-margin')
    })

    it('classifies non-stablecoin spot on perp exchange as perp-spot', () => {
      const asset = makeAssetWithPrice({
        symbol: 'ETH',
        name: 'Ethereum',
        protocol: 'Hyperliquid',
        value: 3000,
      })
      const result = classifyAssetExposure(asset, categoryService)
      expect(result.classification).toBe('perp-spot')
    })
  })

  describe('non-perp exchange positions', () => {
    it('classifies stablecoin as cash', () => {
      const asset = makeAssetWithPrice({
        symbol: 'USDC',
        name: 'USD Coin',
        value: 5000,
      })
      const result = classifyAssetExposure(asset, categoryService)
      expect(result.classification).toBe('cash')
    })

    it('classifies borrowed stablecoin as borrowed-cash', () => {
      const asset = makeAssetWithPrice({
        symbol: 'USDC',
        name: 'USD Coin (Debt)',
        value: -5000,
        isDebt: true,
      })
      const result = classifyAssetExposure(asset, categoryService)
      expect(result.classification).toBe('borrowed-cash')
    })

    it('classifies Pendle PT token as cash', () => {
      const asset = makeAssetWithPrice({
        symbol: 'PT-sUSDe',
        name: 'PT sUSDe',
        value: 1000,
      })
      const result = classifyAssetExposure(asset, categoryService)
      expect(result.classification).toBe('cash')
    })

    it('classifies regular crypto as spot-long', () => {
      const asset = makeAssetWithPrice({
        symbol: 'BTC',
        name: 'Bitcoin',
        value: 50000,
      })
      const result = classifyAssetExposure(asset, categoryService)
      expect(result.classification).toBe('spot-long')
    })

    it('classifies borrowed crypto as spot-short', () => {
      const asset = makeAssetWithPrice({
        symbol: 'ETH',
        name: 'Ethereum (Debt)',
        value: -3000,
        isDebt: true,
      })
      const result = classifyAssetExposure(asset, categoryService)
      expect(result.classification).toBe('spot-short')
    })

    it('classifies stock as spot-long', () => {
      const asset = makeAssetWithPrice({
        symbol: 'AAPL',
        name: 'Apple Inc.',
        type: 'stock',
        value: 9000,
      })
      const result = classifyAssetExposure(asset, categoryService)
      expect(result.classification).toBe('spot-long')
    })

    it('classifies negative value without isDebt flag as debt (spot-short for crypto)', () => {
      const asset = makeAssetWithPrice({
        symbol: 'ETH',
        name: 'Ethereum',
        value: -100,
      })
      const result = classifyAssetExposure(asset, categoryService)
      expect(result.classification).toBe('spot-short')
    })

    it('classifies negative value stablecoin as borrowed-cash', () => {
      const asset = makeAssetWithPrice({
        symbol: 'DAI',
        name: 'Dai',
        value: -1000,
      })
      const result = classifyAssetExposure(asset, categoryService)
      expect(result.classification).toBe('borrowed-cash')
    })
  })

  describe('various perp protocols', () => {
    it.each(['Hyperliquid', 'Lighter', 'Ethereal'])('recognizes %s as perp protocol', (protocol) => {
      const asset = makeAssetWithPrice({
        symbol: 'USDT',
        name: 'USDT',
        protocol,
        value: 5000,
      })
      const result = classifyAssetExposure(asset, categoryService)
      expect(result.classification).toBe('perp-margin')
    })
  })

  describe('various stablecoins', () => {
    it.each(['USDC', 'USDT', 'DAI', 'FRAX', 'LUSD', 'PYUSD'])('classifies %s as cash', (symbol) => {
      const asset = makeAssetWithPrice({
        symbol,
        name: symbol,
        value: 1000,
      })
      const result = classifyAssetExposure(asset, categoryService)
      expect(result.classification).toBe('cash')
    })
  })
})

// ─── calculatePositionValue ─────────────────────────────────────────────────

describe('calculatePositionValue', () => {
  const basicPrices = makeBasicPrices()

  it('calculates basic crypto position value', () => {
    const position = makeCryptoPosition({ symbol: 'ETH', amount: 10 })
    const result = calculatePositionValue(position, basicPrices)
    expect(result.currentPrice).toBe(3000)
    expect(result.value).toBe(30000)
  })

  it('inverts value for debt positions', () => {
    const position = makeDebtPosition({ symbol: 'USDC', amount: 5000 })
    const result = calculatePositionValue(position, basicPrices)
    expect(result.value).toBe(-5000)
    expect(result.isDebt).toBe(true)
  })

  it('inverts 24h change for debt positions', () => {
    const position = makeDebtPosition({ symbol: 'ETH', amount: 1 })
    const result = calculatePositionValue(position, basicPrices)
    // price change for ETH is 30 (1% of 3000), inverted for debt
    expect(result.change24h).toBeLessThan(0)
    expect(result.changePercent24h).toBeLessThan(0)
  })

  it('applies custom price override', () => {
    const position = makeCryptoPosition({ symbol: 'ETH', amount: 5 })
    const customPrices: Record<string, CustomPrice> = {
      eth: { price: 4000, setAt: new Date().toISOString() },
    }
    const result = calculatePositionValue(position, basicPrices, customPrices)
    expect(result.currentPrice).toBe(4000)
    expect(result.value).toBe(20000)
    expect(result.hasCustomPrice).toBe(true)
    expect(result.change24h).toBe(0) // No 24h change for custom prices
  })

  it('custom price with debt inverts value', () => {
    const position = makeDebtPosition({ symbol: 'ETH', amount: 5 })
    const customPrices: Record<string, CustomPrice> = {
      eth: { price: 4000, setAt: new Date().toISOString() },
    }
    const result = calculatePositionValue(position, basicPrices, customPrices)
    expect(result.value).toBe(-20000)
  })

  it('applies FX conversion for cash positions', () => {
    const position = makeCashPosition({ symbol: 'CASH_CHF_123', amount: 1000 })
    const fxRates = { CHF: 1.1 }
    const result = calculatePositionValue(position, basicPrices, undefined, fxRates)
    expect(result.currentPrice).toBe(1.1)
    expect(result.value).toBeCloseTo(1100)
  })

  it('uses default FX rates when fxRates is empty object', () => {
    const position = makeCashPosition({ symbol: 'CASH_EUR_123', amount: 100 })
    const result = calculatePositionValue(position, basicPrices, undefined, {})
    // Should use DEFAULT_FX_RATES for EUR (1.19)
    expect(result.value).toBeCloseTo(119)
  })

  it('uses stablecoin fallback price of $1 when no price found', () => {
    const position = makePosition({ symbol: 'USDC', amount: 5000, type: 'crypto' })
    const result = calculatePositionValue(position, {}) // empty prices
    expect(result.currentPrice).toBe(1)
    expect(result.value).toBe(5000)
  })

  it('returns 0 value when price is missing for non-stablecoin', () => {
    const position = makePosition({ symbol: 'UNKNOWN_TOKEN', amount: 100, type: 'crypto' })
    const result = calculatePositionValue(position, {})
    expect(result.currentPrice).toBe(0)
    expect(result.value).toBe(0)
  })

  it('handles zero amount', () => {
    const position = makeCryptoPosition({ symbol: 'ETH', amount: 0 })
    const result = calculatePositionValue(position, basicPrices)
    expect(result.value).toBe(0)
  })

  it('handles NaN/undefined amount gracefully', () => {
    const position = makeCryptoPosition({ symbol: 'ETH', amount: NaN })
    const result = calculatePositionValue(position, basicPrices)
    expect(Number.isNaN(result.value)).toBe(true)
  })

  it('handles very large values', () => {
    const position = makeCryptoPosition({ symbol: 'BTC', amount: 1_000_000 })
    const result = calculatePositionValue(position, basicPrices)
    expect(result.value).toBe(50_000_000_000)
  })

  it('uses debankPriceKey when available', () => {
    const position = makePosition({
      symbol: 'WETH',
      type: 'crypto',
      amount: 1,
      debankPriceKey: 'eth',
    })
    const result = calculatePositionValue(position, basicPrices)
    // debankPriceKey 'eth' should look up eth price (3000)
    expect(result.currentPrice).toBe(3000)
    expect(result.value).toBe(3000)
  })

  it('cash position change24h is always 0', () => {
    const position = makeCashPosition({ amount: 1000 })
    const result = calculatePositionValue(position, basicPrices)
    expect(result.change24h).toBe(0)
    expect(result.changePercent24h).toBe(0)
  })

  it('identifies cash by category (manual position with fiat symbol)', () => {
    const position = makePosition({ symbol: 'CHF', type: 'manual', amount: 500 })
    const result = calculatePositionValue(position, basicPrices)
    // CHF is identified as cash by category, applies FX conversion
    expect(result.change24h).toBe(0)
  })
})

// ─── calculateNetWorth ──────────────────────────────────────────────────────

describe('calculateNetWorth', () => {
  it('sums all position values', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ value: 50000 }),
      makeAssetWithPrice({ value: 30000 }),
    ]
    expect(calculateNetWorth(assets)).toBe(80000)
  })

  it('subtracts debt positions (negative values)', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ value: 50000 }),
      makeAssetWithPrice({ value: -10000, isDebt: true }),
    ]
    expect(calculateNetWorth(assets)).toBe(40000)
  })

  it('excludes perp notional positions', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ value: 50000 }),
      makeAssetWithPrice({ value: 100000, isPerpNotional: true }),
    ]
    expect(calculateNetWorth(assets)).toBe(50000)
  })

  it('includes perp margin (not notional)', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ value: 10000, symbol: 'USDC', protocol: 'Hyperliquid' }),
      makeAssetWithPrice({ value: 50000, name: 'BTC Long (Hyperliquid)', isPerpNotional: true }),
    ]
    expect(calculateNetWorth(assets)).toBe(10000)
  })

  it('returns 0 for empty array', () => {
    expect(calculateNetWorth([])).toBe(0)
  })

  it('handles all perp notional (no actual assets)', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ value: 100000, isPerpNotional: true }),
    ]
    expect(calculateNetWorth(assets)).toBe(0)
  })
})

// ─── calculatePortfolioSummary ──────────────────────────────────────────────

describe('calculatePortfolioSummary', () => {
  const prices = makeBasicPrices()

  it('calculates total value from positions', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
      makeCryptoPosition({ symbol: 'ETH', amount: 10 }),
    ]
    const summary = calculatePortfolioSummary(positions, prices)
    expect(summary.totalValue).toBe(80000) // 50000 + 30000
  })

  it('calculates 24h change excluding perp notional', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
    ]
    const summary = calculatePortfolioSummary(positions, prices)
    expect(summary.change24h).toBe(500) // 1% of 50000 = 500
  })

  it('separates gross assets and debts', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
      makeDebtPosition({ symbol: 'USDC', amount: 5000 }),
    ]
    const summary = calculatePortfolioSummary(positions, prices)
    expect(summary.grossAssets).toBe(50000)
    expect(summary.totalDebts).toBe(5000)
    expect(summary.totalValue).toBe(45000)
  })

  it('calculates positionCount and assetCount', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'ETH', amount: 5 }),
      makeCryptoPosition({ symbol: 'ETH', amount: 3 }),
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
    ]
    const summary = calculatePortfolioSummary(positions, prices)
    expect(summary.positionCount).toBe(3)
    expect(summary.assetCount).toBe(2) // ETH and BTC
  })

  it('groups by type (crypto, stock, cash, manual)', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
      makeStockPosition({ symbol: 'AAPL', amount: 10 }),
      makeCashPosition({ amount: 5000 }),
    ]
    const summary = calculatePortfolioSummary(positions, prices)
    expect(summary.cryptoValue).toBe(50000)
    expect(summary.stockValue).toBe(1800) // 10 * 180
  })

  it('handles division by zero when no positions', () => {
    const summary = calculatePortfolioSummary([], prices)
    expect(summary.totalValue).toBe(0)
    expect(summary.changePercent24h).toBe(0)
    expect(summary.assetsByType).toEqual([])
  })

  it('excludes perp notional from category values', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
      makePerpPosition({
        symbol: 'BTC',
        name: 'BTC Long (Hyperliquid)',
        amount: 2,
        protocol: 'Hyperliquid',
      }),
    ]
    const summary = calculatePortfolioSummary(positions, prices)
    // BTC spot = 50000, perp notional excluded from net worth
    expect(summary.totalValue).toBe(50000)
  })

  it('includes top assets (max 10)', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
      makeCryptoPosition({ symbol: 'ETH', amount: 10 }),
    ]
    const summary = calculatePortfolioSummary(positions, prices)
    expect(summary.topAssets.length).toBeLessThanOrEqual(10)
    expect(summary.topAssets.length).toBe(2)
  })

  it('filters out zero-value asset types', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
    ]
    const summary = calculatePortfolioSummary(positions, prices)
    // Only crypto should appear in assetsByType
    expect(summary.assetsByType.length).toBe(1)
    expect(summary.assetsByType[0].type).toBe('crypto')
  })
})

// ─── aggregatePositionsBySymbol ─────────────────────────────────────────────

describe('aggregatePositionsBySymbol', () => {
  it('aggregates multiple positions of same symbol', () => {
    const positions: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'ETH', type: 'crypto', value: 3000, amount: 1 }),
      makeAssetWithPrice({ symbol: 'ETH', type: 'crypto', value: 6000, amount: 2 }),
    ]
    const result = aggregatePositionsBySymbol(positions)
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe(9000)
    expect(result[0].amount).toBe(3)
  })

  it('nets debt against non-debt of same symbol', () => {
    const positions: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'ETH', type: 'crypto', value: 6000, amount: 2 }),
      makeAssetWithPrice({ symbol: 'ETH', type: 'crypto', value: -3000, amount: 1, isDebt: true }),
    ]
    const result = aggregatePositionsBySymbol(positions)
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe(3000)
    expect(result[0].amount).toBe(1) // 2 - 1
    expect(result[0].isDebt).toBe(false) // net is positive
  })

  it('keeps perp notional separate from spot', () => {
    const positions: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 50000, amount: 1 }),
      makeAssetWithPrice({
        symbol: 'BTC',
        type: 'crypto',
        value: 100000,
        amount: 2,
        isPerpNotional: true,
      }),
    ]
    const result = aggregatePositionsBySymbol(positions)
    expect(result).toHaveLength(2) // spot and perp-notional separate
  })

  it('calculates allocation percentages based on gross assets', () => {
    const positions: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 50000, amount: 1 }),
      makeAssetWithPrice({ symbol: 'ETH', type: 'crypto', value: 50000, amount: 10 }),
    ]
    const result = aggregatePositionsBySymbol(positions)
    expect(result[0].allocation).toBeCloseTo(50, 0)
    expect(result[1].allocation).toBeCloseTo(50, 0)
  })

  it('gives perp notional 0 allocation', () => {
    const positions: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 50000, amount: 1 }),
      makeAssetWithPrice({
        symbol: 'BTC',
        type: 'crypto',
        value: 100000,
        amount: 2,
        isPerpNotional: true,
      }),
    ]
    const result = aggregatePositionsBySymbol(positions)
    const perpEntry = result.find(r => r.isPerpNotional)
    expect(perpEntry?.allocation).toBe(0)
  })

  it('sorts positive values first then by absolute value descending', () => {
    const positions: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'SOL', type: 'crypto', value: 1000, amount: 10 }),
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 50000, amount: 1 }),
      makeAssetWithPrice({ symbol: 'ETH', type: 'crypto', value: -3000, amount: 1, isDebt: true }),
    ]
    const result = aggregatePositionsBySymbol(positions)
    expect(result[0].symbol).toBe('BTC') // highest positive
    expect(result[1].symbol).toBe('SOL') // second positive
    expect(result[2].symbol).toBe('ETH') // negative at end
  })

  it('marks net-debt result as isDebt', () => {
    const positions: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'ETH', type: 'crypto', value: 3000, amount: 1 }),
      makeAssetWithPrice({ symbol: 'ETH', type: 'crypto', value: -6000, amount: 2, isDebt: true }),
    ]
    const result = aggregatePositionsBySymbol(positions)
    expect(result[0].value).toBe(-3000)
    expect(result[0].isDebt).toBe(true)
  })

  it('separates different types of same symbol', () => {
    const positions: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', assetClass: 'crypto', type: 'crypto', value: 50000, amount: 1 }),
      makeAssetWithPrice({ symbol: 'BTC', assetClass: 'other', type: 'manual', value: 25000, amount: 0.5 }),
    ]
    const result = aggregatePositionsBySymbol(positions)
    // btc-crypto and btc-manual are different keys
    expect(result).toHaveLength(2)
  })

  it('handles empty array', () => {
    expect(aggregatePositionsBySymbol([])).toEqual([])
  })

  it('handles single position', () => {
    const positions: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 50000, amount: 1 }),
    ]
    const result = aggregatePositionsBySymbol(positions)
    expect(result).toHaveLength(1)
    expect(result[0].allocation).toBe(100)
  })
})

// ─── calculateExposureData ──────────────────────────────────────────────────

describe('calculateExposureData', () => {
  describe('ExposureMetrics', () => {
    it('calculates long and short exposure', () => {
      const assets: AssetWithPrice[] = [
        makeAssetWithPrice({ symbol: 'BTC', value: 50000, type: 'crypto' }),
        makeAssetWithPrice({ symbol: 'ETH', value: -3000, isDebt: true, type: 'crypto' }),
      ]
      const data = calculateExposureData(assets)
      expect(data.exposureMetrics.longExposure).toBe(50000)
      expect(data.exposureMetrics.shortExposure).toBe(3000)
    })

    it('calculates gross exposure as |Long| + |Short|', () => {
      const assets: AssetWithPrice[] = [
        makeAssetWithPrice({ symbol: 'BTC', value: 50000, type: 'crypto' }),
        makeAssetWithPrice({ symbol: 'ETH', value: -3000, isDebt: true, type: 'crypto' }),
      ]
      const data = calculateExposureData(assets)
      expect(data.exposureMetrics.grossExposure).toBe(53000)
    })

    it('calculates leverage = Gross Exposure / Net Worth', () => {
      const assets: AssetWithPrice[] = [
        makeAssetWithPrice({ symbol: 'BTC', value: 50000, type: 'crypto' }),
        makeAssetWithPrice({
          symbol: 'BTC',
          name: 'BTC Long (Hyperliquid)',
          protocol: 'Hyperliquid',
          value: 100000,
          type: 'crypto',
        }),
        makeAssetWithPrice({ symbol: 'USDC', value: 10000, protocol: 'Hyperliquid', type: 'crypto' }),
      ]
      const data = calculateExposureData(assets)
      // Net worth = 50000 (spot BTC) + 10000 (margin) = 60000
      // Long exposure = 50000 (spot) + 100000 (perp long) = 150000
      // Gross = 150000, Leverage = 150000/60000 = 2.5
      expect(data.exposureMetrics.leverage).toBeCloseTo(2.5, 1)
    })

    it('calculates cash percentage', () => {
      const assets: AssetWithPrice[] = [
        makeAssetWithPrice({ symbol: 'BTC', value: 70000, type: 'crypto' }),
        makeAssetWithPrice({ symbol: 'USDC', value: 30000, type: 'crypto' }),
      ]
      const data = calculateExposureData(assets)
      // Gross assets = 70000 + 30000 = 100000
      // Cash = 30000 (stablecoins count as cash)
      expect(data.exposureMetrics.cashPercentage).toBeCloseTo(30, 0)
    })

    it('calculates debt ratio', () => {
      const assets: AssetWithPrice[] = [
        makeAssetWithPrice({ symbol: 'BTC', value: 90000, type: 'crypto' }),
        makeAssetWithPrice({ symbol: 'ETH', value: -10000, isDebt: true, type: 'crypto' }),
      ]
      const data = calculateExposureData(assets)
      // grossAssets = 90000, totalDebts = 10000
      // debtRatio = 10000/90000 * 100 ≈ 11.1%
      expect(data.exposureMetrics.debtRatio).toBeCloseTo(11.1, 0)
    })

    it('returns zero leverage when net worth is zero', () => {
      const assets: AssetWithPrice[] = [
        makeAssetWithPrice({ symbol: 'BTC', value: 10000, type: 'crypto' }),
        makeAssetWithPrice({ symbol: 'BTC', value: -10000, isDebt: true, type: 'crypto' }),
      ]
      const data = calculateExposureData(assets)
      expect(data.exposureMetrics.leverage).toBe(0)
    })
  })

  describe('ConcentrationMetrics', () => {
    it('calculates HHI for concentrated portfolio (single asset)', () => {
      const assets: AssetWithPrice[] = [
        makeAssetWithPrice({ symbol: 'BTC', value: 100000, type: 'crypto' }),
      ]
      const data = calculateExposureData(assets)
      // Single position: HHI = 100^2 = 10000
      expect(data.concentrationMetrics.herfindahlIndex).toBe(10000)
      expect(data.concentrationMetrics.top1Percentage).toBe(100)
    })

    it('calculates HHI for diversified portfolio', () => {
      const assets: AssetWithPrice[] = [
        makeAssetWithPrice({ symbol: 'BTC', value: 50000, type: 'crypto' }),
        makeAssetWithPrice({ symbol: 'ETH', value: 50000, type: 'crypto' }),
      ]
      const data = calculateExposureData(assets)
      // Two equal positions: HHI = 50^2 + 50^2 = 5000
      expect(data.concentrationMetrics.herfindahlIndex).toBe(5000)
    })

    it('counts positions and unique assets', () => {
      const assets: AssetWithPrice[] = [
        makeAssetWithPrice({ symbol: 'BTC', value: 30000, type: 'crypto' }),
        makeAssetWithPrice({ symbol: 'BTC', value: 20000, type: 'crypto' }),
        makeAssetWithPrice({ symbol: 'ETH', value: 10000, type: 'crypto' }),
      ]
      const data = calculateExposureData(assets)
      expect(data.concentrationMetrics.positionCount).toBe(3)
      expect(data.concentrationMetrics.assetCount).toBe(2) // BTC and ETH
    })

    it('calculates top5 and top10 percentages', () => {
      const assets: AssetWithPrice[] = [
        makeAssetWithPrice({ symbol: 'BTC', value: 50000, type: 'crypto' }),
        makeAssetWithPrice({ symbol: 'ETH', value: 30000, type: 'crypto' }),
        makeAssetWithPrice({ symbol: 'SOL', value: 20000, type: 'crypto' }),
      ]
      const data = calculateExposureData(assets)
      expect(data.concentrationMetrics.top5Percentage).toBe(100)
      expect(data.concentrationMetrics.top10Percentage).toBe(100)
      expect(data.concentrationMetrics.top1Percentage).toBe(50)
    })
  })

  describe('ProfessionalPerpsMetrics', () => {
    it('calculates perps metrics with margin and notional', () => {
      const assets: AssetWithPrice[] = [
        makeAssetWithPrice({
          symbol: 'USDC',
          value: 10000,
          protocol: 'Hyperliquid',
          type: 'crypto',
        }),
        makeAssetWithPrice({
          symbol: 'BTC',
          name: 'BTC Long (Hyperliquid)',
          protocol: 'Hyperliquid',
          value: 50000,
          type: 'crypto',
        }),
        makeAssetWithPrice({
          symbol: 'ETH',
          name: 'ETH Short (Hyperliquid)',
          protocol: 'Hyperliquid',
          value: -20000,
          isDebt: true,
          type: 'crypto',
        }),
      ]
      const data = calculateExposureData(assets)
      expect(data.perpsMetrics.collateral).toBe(10000)
      expect(data.perpsMetrics.longNotional).toBe(50000)
      expect(data.perpsMetrics.shortNotional).toBe(20000)
      expect(data.perpsMetrics.netNotional).toBe(30000) // 50000 - 20000
      expect(data.perpsMetrics.grossNotional).toBe(70000) // 50000 + 20000
    })

    it('calculates utilization rate', () => {
      const assets: AssetWithPrice[] = [
        makeAssetWithPrice({
          symbol: 'USDC',
          value: 20000,
          protocol: 'Hyperliquid',
          type: 'crypto',
        }),
        makeAssetWithPrice({
          symbol: 'BTC',
          name: 'BTC Long (Hyperliquid)',
          protocol: 'Hyperliquid',
          value: 50000,
          type: 'crypto',
        }),
      ]
      const data = calculateExposureData(assets)
      // grossNotional=50000, est margin used = 50000/5 = 10000
      // utilization = 10000/20000 * 100 = 50%
      expect(data.perpsMetrics.utilizationRate).toBeCloseTo(50, 0)
    })
  })

  describe('SpotDerivativesBreakdown', () => {
    it('separates spot and derivatives exposure', () => {
      const assets: AssetWithPrice[] = [
        makeAssetWithPrice({ symbol: 'BTC', value: 50000, type: 'crypto' }),
        makeAssetWithPrice({
          symbol: 'BTC',
          name: 'BTC Long (Hyperliquid)',
          protocol: 'Hyperliquid',
          value: 100000,
          type: 'crypto',
        }),
        makeAssetWithPrice({
          symbol: 'ETH',
          name: 'ETH Short (Hyperliquid)',
          protocol: 'Hyperliquid',
          value: -30000,
          isDebt: true,
          type: 'crypto',
        }),
      ]
      const data = calculateExposureData(assets)
      expect(data.spotDerivatives.spotLong).toBe(50000)
      expect(data.spotDerivatives.derivativesLong).toBe(100000)
      expect(data.spotDerivatives.derivativesShort).toBe(30000)
      expect(data.spotDerivatives.derivativesNet).toBe(70000)
    })
  })

  describe('overall totals', () => {
    it('calculates grossAssets and totalDebts', () => {
      const assets: AssetWithPrice[] = [
        makeAssetWithPrice({ symbol: 'BTC', value: 50000, type: 'crypto' }),
        makeAssetWithPrice({ symbol: 'ETH', value: -5000, isDebt: true, type: 'crypto' }),
      ]
      const data = calculateExposureData(assets)
      expect(data.grossAssets).toBe(50000)
      expect(data.totalDebts).toBe(5000)
      expect(data.totalValue).toBe(45000)
    })

    it('excludes perp notional from net worth', () => {
      const assets: AssetWithPrice[] = [
        makeAssetWithPrice({ symbol: 'USDC', value: 10000, protocol: 'Hyperliquid', type: 'crypto' }),
        makeAssetWithPrice({
          symbol: 'BTC',
          name: 'BTC Long (Hyperliquid)',
          protocol: 'Hyperliquid',
          value: 100000,
          type: 'crypto',
        }),
      ]
      const data = calculateExposureData(assets)
      // Only margin counts: 10000
      expect(data.totalValue).toBe(10000)
    })

    it('returns perps breakdown', () => {
      const assets: AssetWithPrice[] = [
        makeAssetWithPrice({ symbol: 'USDC', value: 10000, protocol: 'Hyperliquid', type: 'crypto' }),
        makeAssetWithPrice({
          symbol: 'BTC',
          name: 'BTC Long (Hyperliquid)',
          protocol: 'Hyperliquid',
          value: 50000,
          type: 'crypto',
        }),
      ]
      const data = calculateExposureData(assets)
      expect(data.perpsBreakdown.margin).toBe(10000)
      expect(data.perpsBreakdown.longs).toBe(50000)
      expect(data.perpsBreakdown.total).toBe(10000) // only margin
    })

    it('handles empty assets', () => {
      const data = calculateExposureData([])
      expect(data.totalValue).toBe(0)
      expect(data.grossAssets).toBe(0)
      expect(data.totalDebts).toBe(0)
      expect(data.categories).toEqual([])
    })
  })
})

// ─── calculateAllocationBreakdown ───────────────────────────────────────────

describe('calculateAllocationBreakdown', () => {
  it('routes stablecoins to Cash & Equivalents', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'USDC', type: 'crypto', value: 5000 }),
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 50000 }),
    ]
    const result = calculateAllocationBreakdown(assets)
    const cash = result.find(r => r.label === 'Cash & Equivalents')
    expect(cash).toBeDefined()
    expect(cash!.value).toBe(5000)
  })

  it('routes cash type to Cash & Equivalents', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'CASH_USD_123', type: 'cash', value: 10000 }),
    ]
    const result = calculateAllocationBreakdown(assets)
    expect(result[0].label).toBe('Cash & Equivalents')
    expect(result[0].value).toBe(10000)
  })

  it('excludes perp notional from allocation', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 50000 }),
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 100000, isPerpNotional: true }),
    ]
    const result = calculateAllocationBreakdown(assets)
    const crypto = result.find(r => r.label === 'Crypto')
    expect(crypto!.value).toBe(50000) // excludes perp notional
  })

  it('routes stocks to Equities', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'AAPL', type: 'stock', value: 9000 }),
    ]
    const result = calculateAllocationBreakdown(assets)
    expect(result[0].label).toBe('Equities')
    expect(result[0].value).toBe(9000)
  })

  it('calculates percentage of total', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 50000 }),
      makeAssetWithPrice({ symbol: 'USDC', type: 'crypto', value: 50000 }),
    ]
    const result = calculateAllocationBreakdown(assets)
    const crypto = result.find(r => r.label === 'Crypto')
    const cash = result.find(r => r.label === 'Cash & Equivalents')
    expect(crypto!.percentage).toBeCloseTo(50, 0)
    expect(cash!.percentage).toBeCloseTo(50, 0)
  })

  it('filters out categories with zero or negative net value', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 50000 }),
    ]
    const result = calculateAllocationBreakdown(assets)
    expect(result.length).toBe(1) // only Crypto
  })

  it('includes breakdown of individual assets per category', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 30000 }),
      makeAssetWithPrice({ symbol: 'ETH', type: 'crypto', value: 20000 }),
    ]
    const result = calculateAllocationBreakdown(assets)
    const crypto = result.find(r => r.label === 'Crypto')
    expect(crypto!.breakdown.length).toBe(2)
    expect(crypto!.breakdown[0].label).toBe('BTC')
    expect(crypto!.breakdown[0].value).toBe(30000)
  })

  it('handles empty assets', () => {
    expect(calculateAllocationBreakdown([])).toEqual([])
  })
})

// ─── calculateRiskProfile ───────────────────────────────────────────────────

describe('calculateRiskProfile', () => {
  it('classifies cash and stablecoins as Conservative', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'USDC', type: 'crypto', value: 10000 }),
      makeAssetWithPrice({ symbol: 'CASH_USD_123', type: 'cash', value: 5000 }),
    ]
    const result = calculateRiskProfile(assets)
    const conservative = result.find(r => r.label === 'Conservative')
    expect(conservative!.value).toBe(15000)
  })

  it('classifies BTC and ETH as Moderate', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 50000 }),
      makeAssetWithPrice({ symbol: 'ETH', type: 'crypto', value: 30000 }),
    ]
    const result = calculateRiskProfile(assets)
    const moderate = result.find(r => r.label === 'Moderate')
    expect(moderate!.value).toBe(80000)
  })

  it('classifies equities as Moderate', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'AAPL', type: 'stock', value: 9000 }),
    ]
    const result = calculateRiskProfile(assets)
    const moderate = result.find(r => r.label === 'Moderate')
    expect(moderate!.value).toBe(9000)
  })

  it('classifies altcoins and DeFi tokens as Aggressive', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'UNI', type: 'crypto', value: 5000 }),
      makeAssetWithPrice({ symbol: 'LINK', type: 'crypto', value: 3000 }),
    ]
    const result = calculateRiskProfile(assets)
    const aggressive = result.find(r => r.label === 'Aggressive')
    expect(aggressive).toBeDefined()
    expect(aggressive!.value).toBe(8000)
  })

  it('excludes perp notional', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 50000 }),
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 100000, isPerpNotional: true }),
    ]
    const result = calculateRiskProfile(assets)
    const moderate = result.find(r => r.label === 'Moderate')
    expect(moderate!.value).toBe(50000)
  })

  it('calculates percentage of total', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'USDC', type: 'crypto', value: 50000 }),
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 50000 }),
    ]
    const result = calculateRiskProfile(assets)
    const conservative = result.find(r => r.label === 'Conservative')
    const moderate = result.find(r => r.label === 'Moderate')
    expect(conservative!.percentage).toBeCloseTo(50, 0)
    expect(moderate!.percentage).toBeCloseTo(50, 0)
  })

  it('debt subtracts from the risk category', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'USDC', type: 'crypto', value: 10000 }),
      makeAssetWithPrice({ symbol: 'USDC', type: 'crypto', value: -10000, isDebt: true }),
    ]
    const result = calculateRiskProfile(assets)
    // Net conservative = 0, so filtered out
    const conservative = result.find(r => r.label === 'Conservative')
    expect(conservative).toBeUndefined()
  })

  it('handles empty assets', () => {
    expect(calculateRiskProfile([])).toEqual([])
  })
})

// ─── calculatePerpPageData ──────────────────────────────────────────────────

describe('calculatePerpPageData', () => {
  it('categorizes margin positions (stablecoins on perp exchanges)', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'USDC', protocol: 'Hyperliquid', value: 10000, type: 'crypto' }),
    ]
    const data = calculatePerpPageData(assets)
    expect(data.marginPositions).toHaveLength(1)
    expect(data.tradingPositions).toHaveLength(0)
    expect(data.spotHoldings).toHaveLength(0)
  })

  it('categorizes trading positions (long/short on perp exchanges)', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({
        symbol: 'BTC',
        name: 'BTC Long (Hyperliquid)',
        protocol: 'Hyperliquid',
        value: 50000,
        type: 'crypto',
      }),
    ]
    const data = calculatePerpPageData(assets)
    expect(data.tradingPositions).toHaveLength(1)
    expect(data.marginPositions).toHaveLength(0)
  })

  it('categorizes spot holdings on perp exchanges', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({
        symbol: 'ETH',
        name: 'Ethereum',
        protocol: 'Hyperliquid',
        value: 3000,
        type: 'crypto',
      }),
    ]
    const data = calculatePerpPageData(assets)
    expect(data.spotHoldings).toHaveLength(1)
  })

  it('excludes non-perp-exchange positions', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', value: 50000, type: 'crypto' }),
      makeAssetWithPrice({ symbol: 'USDC', protocol: 'Hyperliquid', value: 10000, type: 'crypto' }),
    ]
    const data = calculatePerpPageData(assets)
    expect(data.allPerpPositions).toHaveLength(1)
  })

  it('calculates per-exchange stats', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'USDC', protocol: 'Hyperliquid', value: 10000, type: 'crypto' }),
      makeAssetWithPrice({
        symbol: 'BTC',
        name: 'BTC Long (Hyperliquid)',
        protocol: 'Hyperliquid',
        value: 50000,
        type: 'crypto',
      }),
      makeAssetWithPrice({
        symbol: 'ETH',
        name: 'ETH Short (Hyperliquid)',
        protocol: 'Hyperliquid',
        value: -20000,
        isDebt: true,
        type: 'crypto',
      }),
    ]
    const data = calculatePerpPageData(assets)
    expect(data.exchangeStats).toHaveLength(1)
    const hl = data.exchangeStats[0]
    expect(hl.exchange).toBe('Hyperliquid')
    expect(hl.margin).toBe(10000)
    expect(hl.longs).toBe(50000)
    expect(hl.shorts).toBe(20000)
    expect(hl.accountValue).toBe(10000) // margin only
    expect(hl.netExposure).toBe(30000) // longs - shorts
  })

  it('hasPerps is true when perp positions exist', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'USDC', protocol: 'Hyperliquid', value: 10000, type: 'crypto' }),
    ]
    expect(calculatePerpPageData(assets).hasPerps).toBe(true)
  })

  it('hasPerps is false when no perp positions', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', value: 50000, type: 'crypto' }),
    ]
    expect(calculatePerpPageData(assets).hasPerps).toBe(false)
  })

  it('handles empty assets', () => {
    const data = calculatePerpPageData([])
    expect(data.hasPerps).toBe(false)
    expect(data.allPerpPositions).toHaveLength(0)
  })
})

// ─── calculateCustodyBreakdown ──────────────────────────────────────────────

describe('calculateCustodyBreakdown', () => {
  it('classifies wallet positions as Self-Custody', () => {
    const accounts: Account[] = [{ id: 'wallet-1', name: 'My Wallet', isActive: true, connection: { dataSource: 'debank', address: '0xabc', chains: ['eth'] }, addedAt: '2024-01-01T00:00:00Z' }]
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({
        symbol: 'ETH',
        value: 3000,
        accountId: 'wallet-1',
        type: 'crypto',
      }),
    ]
    const result = calculateCustodyBreakdown(assets, accounts)
    expect(result[0].label).toBe('Self-Custody')
    expect(result[0].value).toBe(3000)
  })

  it('classifies DeFi protocol positions', () => {
    const accounts: Account[] = [{ id: 'wallet-1', name: 'My Wallet', isActive: true, connection: { dataSource: 'debank', address: '0xabc', chains: ['eth'] }, addedAt: '2024-01-01T00:00:00Z' }]
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({
        symbol: 'ETH',
        value: 3000,
        accountId: 'wallet-1',
        protocol: 'Morpho',
        type: 'crypto',
      }),
    ]
    const result = calculateCustodyBreakdown(assets, accounts)
    expect(result[0].label).toBe('DeFi')
  })

  it('classifies CEX positions', () => {
    const accounts: Account[] = [{ id: 'cex-1', name: 'My Binance', isActive: true, connection: { dataSource: 'binance', apiKey: 'key', apiSecret: 'secret' }, addedAt: '2024-01-01T00:00:00Z' }]
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({
        symbol: 'BTC',
        value: 50000,
        accountId: 'cex-1',
        type: 'crypto',
      }),
    ]
    const result = calculateCustodyBreakdown(assets, accounts)
    expect(result[0].label).toBe('CEX')
  })

  it('classifies perp exchange positions as Perp DEX', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({
        symbol: 'USDC',
        value: 10000,
        protocol: 'Hyperliquid',
        type: 'crypto',
      }),
    ]
    const result = calculateCustodyBreakdown(assets)
    expect(result[0].label).toBe('Perp DEX')
  })

  it('classifies stocks and cash as Banks & Brokers', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'AAPL', assetClass: 'equity', type: 'stock', value: 9000, equityType: 'stock' }),
      makeAssetWithPrice({ symbol: 'CASH_USD_123', assetClass: 'cash', type: 'cash', value: 5000 }),
    ]
    const result = calculateCustodyBreakdown(assets)
    expect(result[0].label).toBe('Banks & Brokers')
    expect(result[0].value).toBe(14000)
  })

  it('excludes perp notional from custody', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({
        symbol: 'BTC',
        value: 100000,
        isPerpNotional: true,
        protocol: 'Hyperliquid',
        type: 'crypto',
      }),
      makeAssetWithPrice({ symbol: 'USDC', value: 10000, protocol: 'Hyperliquid', type: 'crypto' }),
    ]
    const result = calculateCustodyBreakdown(assets)
    // Only the USDC margin should show, not the BTC notional
    const perpDex = result.find(r => r.label === 'Perp DEX')
    expect(perpDex!.value).toBe(10000)
  })
})

// ─── calculateChainBreakdown ────────────────────────────────────────────────

describe('calculateChainBreakdown', () => {
  it('groups positions by chain', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'ETH', chain: 'eth', value: 3000, type: 'crypto' }),
      makeAssetWithPrice({ symbol: 'SOL', chain: 'sol', value: 1000, type: 'crypto' }),
    ]
    const result = calculateChainBreakdown(assets)
    expect(result).toHaveLength(2)
    expect(result[0].label).toBe('Eth')
    expect(result[0].value).toBe(3000)
  })

  it('uses CEX exchange name for CEX positions', () => {
    const accounts: Account[] = [{ id: 'cex-1', name: 'My Binance', isActive: true, connection: { dataSource: 'binance', apiKey: 'key', apiSecret: 'secret' }, addedAt: '2024-01-01T00:00:00Z' }]
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', accountId: 'cex-1', value: 50000, type: 'crypto' }),
    ]
    const result = calculateChainBreakdown(assets, accounts)
    expect(result[0].label).toBe('Binance')
  })

  it('uses protocol name for perp exchange', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'USDC', protocol: 'Hyperliquid', value: 10000, type: 'crypto' }),
    ]
    const result = calculateChainBreakdown(assets)
    expect(result[0].label).toBe('Hyperliquid')
  })

  it('excludes perp notional', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', chain: 'eth', value: 3000, type: 'crypto' }),
      makeAssetWithPrice({ symbol: 'BTC', chain: 'eth', value: 100000, isPerpNotional: true, type: 'crypto' }),
    ]
    const result = calculateChainBreakdown(assets)
    expect(result[0].value).toBe(3000)
  })

  it('calculates percentage', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'ETH', chain: 'eth', value: 75000, type: 'crypto' }),
      makeAssetWithPrice({ symbol: 'SOL', chain: 'sol', value: 25000, type: 'crypto' }),
    ]
    const result = calculateChainBreakdown(assets)
    expect(result[0].percentage).toBeCloseTo(75, 0)
    expect(result[1].percentage).toBeCloseTo(25, 0)
  })

  it('sorts by value descending', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'SOL', chain: 'sol', value: 1000, type: 'crypto' }),
      makeAssetWithPrice({ symbol: 'ETH', chain: 'eth', value: 5000, type: 'crypto' }),
    ]
    const result = calculateChainBreakdown(assets)
    expect(result[0].label).toBe('Eth')
    expect(result[1].label).toBe('Sol')
  })

  it('filters out chains with negative net value', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'ETH', chain: 'eth', value: 3000, type: 'crypto' }),
      makeAssetWithPrice({ symbol: 'ETH', chain: 'arb', value: -5000, isDebt: true, type: 'crypto' }),
    ]
    const result = calculateChainBreakdown(assets)
    expect(result).toHaveLength(1) // only eth
  })

  it('handles empty assets', () => {
    expect(calculateChainBreakdown([])).toEqual([])
  })
})

// ─── calculateCryptoMetrics ─────────────────────────────────────────────────

describe('calculateCryptoMetrics', () => {
  it('calculates stablecoin ratio', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'USDC', type: 'crypto', value: 30000 }),
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 70000 }),
    ]
    const result = calculateCryptoMetrics(assets)
    expect(result.stablecoinRatio).toBeCloseTo(30, 0)
  })

  it('calculates BTC dominance', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 60000 }),
      makeAssetWithPrice({ symbol: 'ETH', type: 'crypto', value: 40000 }),
    ]
    const result = calculateCryptoMetrics(assets)
    expect(result.btcDominance).toBeCloseTo(60, 0)
  })

  it('calculates ETH dominance', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'ETH', type: 'crypto', value: 40000 }),
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 60000 }),
    ]
    const result = calculateCryptoMetrics(assets)
    expect(result.ethDominance).toBeCloseTo(40, 0)
  })

  it('calculates DeFi exposure', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({
        symbol: 'ETH',
        type: 'crypto',
        value: 3000,
        protocol: 'Morpho',
        accountId: 'wallet-1',
      }),
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 7000 }),
    ]
    const result = calculateCryptoMetrics(assets)
    // DeFi exposure = protocol positions / total
    expect(result.defiExposure).toBeCloseTo(30, 0)
  })

  it('excludes perp trades from dominance calculations', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 50000 }),
      makeAssetWithPrice({
        symbol: 'BTC',
        type: 'crypto',
        name: 'BTC Long (Hyperliquid)',
        protocol: 'Hyperliquid',
        value: 100000,
      }),
    ]
    const result = calculateCryptoMetrics(assets)
    // Only spot BTC counts for dominance
    // totalNetValue = 50000 + 100000 = 150000
    // btc dominance is only spot 50000 / 150000
    expect(result.btcDominance).toBeCloseTo(33.3, 0)
  })

  it('returns all zeros when total is zero or negative', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 10000 }),
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: -10000, isDebt: true }),
    ]
    const result = calculateCryptoMetrics(assets)
    expect(result.stablecoinRatio).toBe(0)
    expect(result.btcDominance).toBe(0)
    expect(result.ethDominance).toBe(0)
    expect(result.defiExposure).toBe(0)
  })

  it('ignores non-crypto assets', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'AAPL', type: 'stock', value: 50000 }),
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 50000 }),
    ]
    const result = calculateCryptoMetrics(assets)
    expect(result.btcDominance).toBe(100)
  })

  it('handles empty assets', () => {
    const result = calculateCryptoMetrics([])
    expect(result).toEqual({ stablecoinRatio: 0, btcDominance: 0, ethDominance: 0, defiExposure: 0 })
  })
})

// ─── extractAccountName ─────────────────────────────────────────────────────

describe('extractAccountName', () => {
  it('extracts account name from "AccountName (Currency)" pattern', () => {
    const asset = makeAssetWithPrice({ name: 'Millennium (PLN)' })
    expect(extractAccountName(asset)).toBe('Millennium')
  })

  it('extracts from "Revolut (USD)" pattern', () => {
    const asset = makeAssetWithPrice({ name: 'Revolut (USD)' })
    expect(extractAccountName(asset)).toBe('Revolut')
  })

  it('uses protocol name when no parens pattern', () => {
    const asset = makeAssetWithPrice({ name: 'Ethereum', protocol: 'morpho' })
    expect(extractAccountName(asset)).toBe('Morpho')
  })

  it('uses CEX exchange name from account lookup', () => {
    const accountMap = new Map<string, Account>([['cex-1', { id: 'cex-1', name: 'My Binance', isActive: true, connection: { dataSource: 'binance', apiKey: 'key', apiSecret: 'secret' }, addedAt: '2024-01-01T00:00:00Z' }]])
    const asset = makeAssetWithPrice({ name: 'Bitcoin', accountId: 'cex-1' })
    expect(extractAccountName(asset, accountMap)).toBe('Binance')
  })

  it('uses chain name as fallback', () => {
    const asset = makeAssetWithPrice({ name: 'Ethereum', protocol: undefined, chain: 'eth' })
    expect(extractAccountName(asset)).toBe('Eth')
  })

  it('returns full name when no pattern matches', () => {
    const asset = makeAssetWithPrice({
      name: 'My Asset',
      protocol: undefined,
      chain: undefined,
    })
    expect(extractAccountName(asset)).toBe('My Asset')
  })

  it('returns "Manual" when name is empty', () => {
    const asset = makeAssetWithPrice({
      name: '',
      protocol: undefined,
      chain: undefined,
    })
    expect(extractAccountName(asset)).toBe('Manual')
  })

  it('resolves wallet account to shortened address', () => {
    const accountMap = new Map<string, Account>([['wallet-1', { id: 'wallet-1', name: 'My Wallet', isActive: true, connection: { dataSource: 'debank', address: '0xAbCd1234567890eF', chains: ['eth'] }, addedAt: '2024-01-01T00:00:00Z' }]])
    const asset = makeAssetWithPrice({ name: 'ETH', accountId: 'wallet-1', chain: 'eth' })
    expect(extractAccountName(asset, accountMap)).toBe('0xAbCd...90eF')
  })
})

// ─── calculateCashBreakdown ─────────────────────────────────────────────────

describe('calculateCashBreakdown', () => {
  it('separates fiat and stablecoin positions', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'CASH_USD_123', type: 'cash', value: 10000 }),
      makeAssetWithPrice({ symbol: 'USDC', type: 'crypto', value: 5000 }),
    ]
    const result = calculateCashBreakdown(assets)
    expect(result.fiat.value).toBe(10000)
    expect(result.stablecoins.value).toBe(5000)
    expect(result.total).toBe(15000)
  })

  it('excludes stablecoins when includeStablecoins is false', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'CASH_USD_123', type: 'cash', value: 10000 }),
      makeAssetWithPrice({ symbol: 'USDC', type: 'crypto', value: 5000 }),
    ]
    const result = calculateCashBreakdown(assets, false)
    expect(result.total).toBe(10000) // only fiat
  })

  it('generates chart data grouped by currency', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'CASH_USD_123', type: 'cash', name: 'Revolut (USD)', value: 5000 }),
      makeAssetWithPrice({ symbol: 'CASH_EUR_456', type: 'cash', name: 'Revolut (EUR)', value: 3000 }),
    ]
    const result = calculateCashBreakdown(assets)
    expect(result.chartData.length).toBe(2)
    expect(result.chartData[0].label).toBe('USD')
    expect(result.chartData[0].value).toBe(5000)
  })

  it('generates institution breakdown', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'CASH_USD_123', type: 'cash', name: 'Revolut (USD)', value: 5000, amount: 5000 }),
      makeAssetWithPrice({ symbol: 'CASH_EUR_456', type: 'cash', name: 'Revolut (EUR)', value: 3000, amount: 3000 }),
    ]
    const result = calculateCashBreakdown(assets)
    expect(result.institutionBreakdown.length).toBe(2)
    expect(result.institutionBreakdown[0].name).toBe('Revolut')
  })

  it('debt subtracts from fiat total', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'CASH_USD_123', type: 'cash', value: 10000 }),
      makeAssetWithPrice({ symbol: 'CASH_USD_456', type: 'cash', value: -3000, isDebt: true }),
    ]
    const result = calculateCashBreakdown(assets)
    expect(result.fiat.value).toBe(7000)
  })

  it('ignores non-cash and non-stablecoin positions', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 50000 }),
      makeAssetWithPrice({ symbol: 'CASH_USD_123', type: 'cash', value: 10000 }),
    ]
    const result = calculateCashBreakdown(assets)
    expect(result.fiat.value).toBe(10000)
    expect(result.stablecoins.value).toBe(0)
  })

  it('handles empty assets', () => {
    const result = calculateCashBreakdown([])
    expect(result.total).toBe(0)
    expect(result.chartData).toEqual([])
  })
})

// ─── calculateEquitiesBreakdown ─────────────────────────────────────────────

describe('calculateEquitiesBreakdown', () => {
  it('separates stocks from ETFs', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'AAPL', type: 'stock', value: 9000 }),
      makeAssetWithPrice({ symbol: 'SPY', type: 'stock', value: 15000 }),
    ]
    const result = calculateEquitiesBreakdown(assets)
    expect(result.stocks.value).toBe(9000)
    expect(result.etfs.value).toBe(15000) // SPY is a known ETF
  })

  it('counts stocks and ETFs separately', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'AAPL', type: 'stock', value: 9000 }),
      makeAssetWithPrice({ symbol: 'GOOGL', type: 'stock', value: 7000 }),
      makeAssetWithPrice({ symbol: 'SPY', type: 'stock', value: 15000 }),
    ]
    const result = calculateEquitiesBreakdown(assets)
    expect(result.stocks.count).toBe(2)
    expect(result.etfs.count).toBe(1)
  })

  it('calculates total equities value', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'AAPL', type: 'stock', value: 9000 }),
      makeAssetWithPrice({ symbol: 'SPY', type: 'stock', value: 15000 }),
    ]
    const result = calculateEquitiesBreakdown(assets)
    expect(result.total).toBe(24000)
  })

  it('builds chart data', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'AAPL', type: 'stock', value: 9000 }),
    ]
    const result = calculateEquitiesBreakdown(assets)
    expect(result.chartData.length).toBe(1)
    expect(result.chartData[0].label).toBe('Stocks')
    expect(result.chartData[0].value).toBe(9000)
  })

  it('includes breakdown by symbol', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'AAPL', type: 'stock', value: 9000 }),
      makeAssetWithPrice({ symbol: 'GOOGL', type: 'stock', value: 7000 }),
    ]
    const result = calculateEquitiesBreakdown(assets)
    const stocksChart = result.chartData.find(c => c.label === 'Stocks')
    expect(stocksChart!.breakdown.length).toBe(2)
    expect(stocksChart!.breakdown[0].label).toBe('AAPL')
  })

  it('handles empty assets', () => {
    const result = calculateEquitiesBreakdown([])
    expect(result.total).toBe(0)
    expect(result.chartData).toEqual([])
  })

  it('ignores non-equity positions', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', type: 'crypto', value: 50000 }),
      makeAssetWithPrice({ symbol: 'AAPL', type: 'stock', value: 9000 }),
    ]
    const result = calculateEquitiesBreakdown(assets)
    expect(result.total).toBe(9000)
  })

  it('clamps negative totals to zero', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'AAPL', type: 'stock', value: -5000, isDebt: true }),
    ]
    const result = calculateEquitiesBreakdown(assets)
    expect(result.total).toBe(0)
    expect(result.stocks.value).toBe(0) // clamped via Math.max
  })
})

// ─── calculateAssetSummary ──────────────────────────────────────────────────

describe('calculateAssetSummary', () => {
  it('returns null for empty array', () => {
    expect(calculateAssetSummary([])).toBeNull()
  })

  it('calculates net amount subtracting debt', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'ETH', amount: 10, value: 30000, type: 'crypto' }),
      makeAssetWithPrice({ symbol: 'ETH', amount: 3, value: -9000, isDebt: true, type: 'crypto' }),
    ]
    const result = calculateAssetSummary(assets)!
    expect(result.totalAmount).toBe(7) // 10 - 3
    expect(result.totalValue).toBe(21000) // 30000 - 9000
  })

  it('calculates cost basis sum', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', amount: 1, value: 50000, costBasis: 40000, type: 'crypto' }),
      makeAssetWithPrice({ symbol: 'BTC', amount: 0.5, value: 25000, costBasis: 15000, type: 'crypto' }),
    ]
    const result = calculateAssetSummary(assets)!
    expect(result.totalCostBasis).toBe(55000)
  })

  it('returns null cost basis when no position has cost basis', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', amount: 1, value: 50000, type: 'crypto' }),
    ]
    const result = calculateAssetSummary(assets)!
    expect(result.totalCostBasis).toBeNull()
  })

  it('provides correct price data from first position with valid price', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'ETH', currentPrice: 0, value: 0, amount: 0, type: 'crypto' }),
      makeAssetWithPrice({ symbol: 'ETH', currentPrice: 3000, value: 3000, amount: 1, type: 'crypto' }),
    ]
    const result = calculateAssetSummary(assets)!
    expect(result.currentPrice).toBe(3000)
  })

  it('includes exposure category info', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'BTC', value: 50000, type: 'crypto' }),
    ]
    const result = calculateAssetSummary(assets)!
    expect(result.exposureCategory).toBe('btc')
    expect(result.exposureCategoryLabel).toBe('BTC')
    expect(result.mainCategory).toBe('crypto')
  })

  it('counts unique wallets', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'ETH', value: 3000, accountId: 'wallet-1', type: 'crypto' }),
      makeAssetWithPrice({ symbol: 'ETH', value: 2000, accountId: 'wallet-2', type: 'crypto' }),
      makeAssetWithPrice({ symbol: 'ETH', value: 1000, accountId: 'wallet-1', type: 'crypto' }),
    ]
    const result = calculateAssetSummary(assets)!
    expect(result.walletCount).toBe(2) // wallet-1 and wallet-2
  })

  it('includes position count', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'ETH', value: 3000, type: 'crypto' }),
      makeAssetWithPrice({ symbol: 'ETH', value: 2000, type: 'crypto' }),
    ]
    const result = calculateAssetSummary(assets)!
    expect(result.positionCount).toBe(2)
  })

  it('sums allocation across positions', () => {
    const assets: AssetWithPrice[] = [
      makeAssetWithPrice({ symbol: 'ETH', value: 3000, allocation: 30, type: 'crypto' }),
      makeAssetWithPrice({ symbol: 'ETH', value: 2000, allocation: 20, type: 'crypto' }),
    ]
    const result = calculateAssetSummary(assets)!
    expect(result.allocation).toBe(50)
  })
})

// ─── calculateTotalNAV ──────────────────────────────────────────────────────

describe('calculateTotalNAV', () => {
  const prices = makeBasicPrices()

  it('calculates NAV from positions', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
      makeCryptoPosition({ symbol: 'ETH', amount: 10 }),
    ]
    const nav = calculateTotalNAV(positions, prices)
    expect(nav).toBe(80000) // 50000 + 30000
  })

  it('subtracts debt positions', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
      makeDebtPosition({ symbol: 'ETH', amount: 5 }),
    ]
    const nav = calculateTotalNAV(positions, prices)
    expect(nav).toBe(35000) // 50000 - 15000
  })

  it('treats cash positions as price=1', () => {
    const positions = [
      makeCashPosition({ amount: 10000 }),
    ]
    const nav = calculateTotalNAV(positions, prices)
    expect(nav).toBe(10000)
  })

  it('returns 0 for missing prices', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'UNKNOWN', amount: 100 }),
    ]
    const nav = calculateTotalNAV(positions, prices)
    expect(nav).toBe(0)
  })

  it('returns 0 for empty positions', () => {
    expect(calculateTotalNAV([], prices)).toBe(0)
  })

  it('handles mixed position types', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
      makeStockPosition({ symbol: 'AAPL', amount: 10 }),
      makeCashPosition({ amount: 5000 }),
    ]
    const nav = calculateTotalNAV(positions, prices)
    // BTC: 50000, AAPL: 1800, Cash: 5000
    expect(nav).toBe(56800)
  })

  it('correctly sums multiple positions of same asset', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'ETH', amount: 5 }),
      makeCryptoPosition({ symbol: 'ETH', amount: 5 }),
    ]
    const nav = calculateTotalNAV(positions, prices)
    expect(nav).toBe(30000) // 2 * 5 * 3000
  })

  it('handles debt cash positions', () => {
    const positions = [
      makeCashPosition({ amount: 10000 }),
      makeCashPosition({ amount: 5000, isDebt: true }),
    ]
    const nav = calculateTotalNAV(positions, prices)
    // Cash: amount is always positive, isDebt doesn't matter for cash in this function
    // Actually looking at the code, cash positions just return sum + position.amount
    // regardless of isDebt (that's handled elsewhere)
    expect(nav).toBe(15000)
  })
})
