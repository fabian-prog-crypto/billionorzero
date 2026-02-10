/**
 * Portfolio Calculator - Integration Tests
 *
 * Tests the calculator pipeline with real CategoryService (no mocking of domain code).
 * Verifies multi-function pipeline consistency:
 *   positions -> calculateAllPositionsWithPrices -> calculatePortfolioSummary -> exposure
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  makeCryptoPosition,
  makeDebtPosition,
  makeCashPosition,
  makeStockPosition,
  makePerpPosition,
  makeBasicPrices,
  resetPositionCounter,
} from '@/__tests__/fixtures'

// Mock the providers module (needed by getPriceKey and calculatePositionValue)
vi.mock('@/services/providers', () => ({
  getPriceProvider: () => ({
    getCoinId: (symbol: string) => symbol.toLowerCase(),
    getDebankPriceKey: (symbol: string) => symbol.toLowerCase(),
  }),
}))

import {
  calculateAllPositionsWithPrices,
  calculatePortfolioSummary,
  calculateExposureData,
  calculateAllocationBreakdown,
  calculateRiskProfile,
  calculateNetWorth,
  calculateCashBreakdown,
  calculateEquitiesBreakdown,
  calculateCryptoMetrics,
} from './portfolio-calculator'

beforeEach(() => {
  resetPositionCounter()
})

// ─── Full pipeline: positions -> assetsWithPrice -> summary ─────────────────

describe('full pipeline: positions -> summary', () => {
  const prices = makeBasicPrices()

  it('calculates consistent totals through the entire pipeline', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
      makeCryptoPosition({ symbol: 'ETH', amount: 10 }),
      makeStockPosition({ symbol: 'AAPL', amount: 10 }),
      makeCashPosition({ amount: 5000 }),
    ]

    const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices)
    const summary = calculatePortfolioSummary(positions, prices)

    // Net worth from assets matches summary total
    const netWorth = calculateNetWorth(assetsWithPrice)
    expect(netWorth).toBe(summary.totalValue)

    // Individual type values add up
    expect(summary.cryptoValue + summary.stockValue + summary.cashValue + summary.manualValue)
      .toBe(summary.totalValue)

    // BTC=50000 + ETH=30000 + AAPL=1800 + cash=5000 = 86800
    expect(summary.totalValue).toBe(86800)
    expect(summary.grossAssets).toBe(86800)
    expect(summary.totalDebts).toBe(0)
  })

  it('debt positions reduce net worth correctly throughout pipeline', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),     // 50000
      makeCryptoPosition({ symbol: 'ETH', amount: 10 }),    // 30000
      makeDebtPosition({ symbol: 'USDC', amount: 10000 }), // -10000
    ]

    const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices)
    const summary = calculatePortfolioSummary(positions, prices)

    // Debt reduces total
    expect(summary.totalValue).toBe(70000) // 50000 + 30000 - 10000
    expect(summary.grossAssets).toBe(80000)
    expect(summary.totalDebts).toBe(10000)

    // Net worth calculation matches
    const netWorth = calculateNetWorth(assetsWithPrice)
    expect(netWorth).toBe(70000)

    // Debt position has negative value
    const debtAsset = assetsWithPrice.find(a => a.isDebt)
    expect(debtAsset).toBeDefined()
    expect(debtAsset!.value).toBe(-10000)
  })

  it('allocations sum to 100% for non-debt positions', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
      makeCryptoPosition({ symbol: 'ETH', amount: 10 }),
    ]

    const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices)
    const positiveAllocations = assetsWithPrice
      .filter(a => a.value > 0 && !a.isPerpNotional)
      .reduce((sum, a) => sum + a.allocation, 0)

    expect(positiveAllocations).toBeCloseTo(100, 1)
  })
})

// ─── Exposure pipeline: positions -> assetsWithPrice -> exposureData ────────

describe('exposure pipeline consistency', () => {
  const prices = makeBasicPrices()

  it('exposure totals match portfolio summary totals', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
      makeCryptoPosition({ symbol: 'ETH', amount: 10 }),
      makeDebtPosition({ symbol: 'USDC', amount: 5000 }),
    ]

    const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices)
    const summary = calculatePortfolioSummary(positions, prices)
    const exposure = calculateExposureData(assetsWithPrice)

    expect(exposure.totalValue).toBe(summary.totalValue)
    expect(exposure.grossAssets).toBe(summary.grossAssets)
    expect(exposure.totalDebts).toBe(summary.totalDebts)
  })

  it('long and short exposure are calculated correctly', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),     // 50000 spot-long
      makeCryptoPosition({ symbol: 'ETH', amount: 10 }),    // 30000 spot-long
      makeDebtPosition({ symbol: 'ETH', amount: 5 }),       // -15000 spot-short
      makeDebtPosition({ symbol: 'USDC', amount: 10000 }),  // -10000 borrowed-cash
    ]

    const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices)
    const exposure = calculateExposureData(assetsWithPrice)

    // Long exposure = BTC(50000) + ETH(30000) = 80000
    expect(exposure.exposureMetrics.longExposure).toBe(80000)
    // Short exposure = borrowed ETH (15000) - borrowed USDC is NOT short exposure
    expect(exposure.exposureMetrics.shortExposure).toBe(15000)
    // Gross = |Long| + |Short| = 80000 + 15000 = 95000
    expect(exposure.exposureMetrics.grossExposure).toBe(95000)
  })

  it('perp positions affect exposure but not net worth', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'USDC', amount: 10000, protocol: 'Hyperliquid' }),
      makePerpPosition({
        symbol: 'BTC',
        name: 'BTC Long (Hyperliquid)',
        amount: 2,
        protocol: 'Hyperliquid',
      }),
    ]

    const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices)
    const summary = calculatePortfolioSummary(positions, prices)
    const exposure = calculateExposureData(assetsWithPrice)

    // Net worth = only USDC margin (10000)
    expect(summary.totalValue).toBe(10000)
    expect(exposure.totalValue).toBe(10000)

    // But long exposure includes the perp notional
    expect(exposure.exposureMetrics.longExposure).toBe(100000) // 2 * 50000 from perp

    // Leverage = gross exposure / net worth
    expect(exposure.exposureMetrics.leverage).toBeCloseTo(10, 0)
  })
})

// ─── Allocation -> Exposure -> Risk profile consistency ─────────────────────

describe('allocation -> exposure -> risk profile consistency', () => {
  const prices = makeBasicPrices()

  it('all breakdowns account for the same total value', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
      makeCryptoPosition({ symbol: 'ETH', amount: 10 }),
      makeStockPosition({ symbol: 'AAPL', amount: 10 }),
      makeCryptoPosition({ symbol: 'USDC', amount: 5000 }),
    ]

    const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices)

    const allocation = calculateAllocationBreakdown(assetsWithPrice)
    const riskProfile = calculateRiskProfile(assetsWithPrice)

    // All allocation category values should sum to total portfolio value
    const allocationTotal = allocation.reduce((sum, cat) => sum + cat.value, 0)
    const riskTotal = riskProfile.reduce((sum, r) => sum + r.value, 0)

    // Both should equal total portfolio value (86800)
    const totalValue = calculateNetWorth(assetsWithPrice)
    expect(allocationTotal).toBe(totalValue)
    expect(riskTotal).toBe(totalValue)
  })

  it('allocation percentages sum to 100%', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
      makeCryptoPosition({ symbol: 'USDC', amount: 5000 }),
      makeStockPosition({ symbol: 'AAPL', amount: 10 }),
    ]

    const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices)
    const allocation = calculateAllocationBreakdown(assetsWithPrice)

    const totalPct = allocation.reduce((sum, cat) => sum + cat.percentage, 0)
    expect(totalPct).toBeCloseTo(100, 0)
  })

  it('risk profile percentages sum to 100%', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
      makeCryptoPosition({ symbol: 'USDC', amount: 5000 }),
      makeStockPosition({ symbol: 'AAPL', amount: 10 }),
    ]

    const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices)
    const riskProfile = calculateRiskProfile(assetsWithPrice)

    const totalPct = riskProfile.reduce((sum, r) => sum + r.percentage, 0)
    expect(totalPct).toBeCloseTo(100, 0)
  })
})

// ─── Mixed portfolio end-to-end ─────────────────────────────────────────────

describe('mixed portfolio (crypto + stock + cash + perp) end-to-end', () => {
  const prices = makeBasicPrices()

  it('handles all asset types in one portfolio correctly', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),                // 50000
      makeCryptoPosition({ symbol: 'ETH', amount: 10 }),               // 30000
      makeStockPosition({ symbol: 'AAPL', amount: 10 }),               // 1800
      makeCashPosition({ amount: 5000 }),                               // 5000
      makeCryptoPosition({ symbol: 'USDC', amount: 10000, protocol: 'Hyperliquid' }), // 10000 margin
      makePerpPosition({                                                // notional (excluded)
        symbol: 'BTC',
        name: 'BTC Long (Hyperliquid)',
        amount: 2,
        protocol: 'Hyperliquid',
      }),
      makeDebtPosition({ symbol: 'ETH', amount: 3 }),                  // -9000
    ]

    const summary = calculatePortfolioSummary(positions, prices)

    // Total = 50000 + 30000 + 1800 + 5000 + 10000 - 9000 = 87800
    // (perp notional excluded from net worth)
    expect(summary.totalValue).toBe(87800)
    expect(summary.grossAssets).toBe(96800) // all positive values except perp notional
    expect(summary.totalDebts).toBe(9000)

    // Crypto value = 50000 + 30000 + 10000 - 9000 = 81000
    expect(summary.cryptoValue).toBe(81000)
    expect(summary.stockValue).toBe(1800)
    expect(summary.cashValue).toBe(5000)

    // Position count includes perp notional position too
    expect(summary.positionCount).toBe(7)
  })

  it('exposure data reflects perp positions correctly', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),
      makeCryptoPosition({ symbol: 'USDC', amount: 10000, protocol: 'Hyperliquid' }),
      makePerpPosition({
        symbol: 'BTC',
        name: 'BTC Long (Hyperliquid)',
        amount: 2,
        protocol: 'Hyperliquid',
      }),
      makePerpPosition({
        symbol: 'ETH',
        name: 'ETH Short (Hyperliquid)',
        amount: 10,
        protocol: 'Hyperliquid',
        isDebt: true,
      }),
    ]

    const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices)
    const exposure = calculateExposureData(assetsWithPrice)

    // Net worth = spot BTC (50000) + margin USDC (10000) = 60000
    expect(exposure.totalValue).toBe(60000)

    // Perps breakdown
    expect(exposure.perpsBreakdown.margin).toBe(10000)
    expect(exposure.perpsBreakdown.longs).toBe(100000) // 2 * 50000
    expect(exposure.perpsBreakdown.shorts).toBe(30000)  // 10 * 3000

    // Professional perps metrics
    expect(exposure.perpsMetrics.collateral).toBe(10000)
    expect(exposure.perpsMetrics.longNotional).toBe(100000)
    expect(exposure.perpsMetrics.shortNotional).toBe(30000)
    expect(exposure.perpsMetrics.netNotional).toBe(70000)
    expect(exposure.perpsMetrics.grossNotional).toBe(130000)
  })
})

// ─── Short positions classified and calculated correctly ────────────────────

describe('short positions', () => {
  const prices = makeBasicPrices()

  it('borrowed crypto is classified as spot-short', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),      // spot-long
      makeDebtPosition({ symbol: 'ETH', amount: 5 }),        // spot-short
    ]

    const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices)
    const exposure = calculateExposureData(assetsWithPrice)

    // Short exposure from borrowed ETH
    expect(exposure.exposureMetrics.shortExposure).toBe(15000) // 5 * 3000
    expect(exposure.spotDerivatives.spotShort).toBe(15000)
  })

  it('borrowed stablecoin is NOT short exposure (just leverage)', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),       // spot-long
      makeDebtPosition({ symbol: 'USDC', amount: 10000 }),    // borrowed-cash (not short)
    ]

    const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices)
    const exposure = calculateExposureData(assetsWithPrice)

    // Short exposure should be 0 (borrowed stablecoins are NOT short exposure)
    expect(exposure.exposureMetrics.shortExposure).toBe(0)
    // But debt ratio should reflect the debt
    expect(exposure.totalDebts).toBe(10000)
    expect(exposure.exposureMetrics.debtRatio).toBeCloseTo(20, 0) // 10000/50000 * 100
  })

  it('perp short is classified as derivatives short', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'USDC', amount: 10000, protocol: 'Hyperliquid' }),
      makePerpPosition({
        symbol: 'ETH',
        name: 'ETH Short (Hyperliquid)',
        amount: 5,
        protocol: 'Hyperliquid',
        isDebt: true,
      }),
    ]

    const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices)
    const exposure = calculateExposureData(assetsWithPrice)

    expect(exposure.spotDerivatives.derivativesShort).toBe(15000) // 5 * 3000
    expect(exposure.perpsMetrics.shortNotional).toBe(15000)
  })
})

// ─── Cash breakdown integration ─────────────────────────────────────────────

describe('cash breakdown integration', () => {
  const prices = makeBasicPrices()

  it('stablecoins are routed to cash in allocation and cash breakdown', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'USDC', amount: 5000 }),
      makeCryptoPosition({ symbol: 'USDT', amount: 3000 }),
      makeCashPosition({ symbol: 'CASH_EUR_123', name: 'Revolut (EUR)', amount: 1000 }),
    ]

    const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices)

    // Allocation breakdown: stablecoins go to Cash & Equivalents
    const allocation = calculateAllocationBreakdown(assetsWithPrice)
    const cashAlloc = allocation.find(a => a.label === 'Cash & Equivalents')
    expect(cashAlloc).toBeDefined()

    // Cash breakdown separates fiat and stablecoins
    const cashBreakdown = calculateCashBreakdown(assetsWithPrice)
    expect(cashBreakdown.stablecoins.value).toBe(8000) // 5000 + 3000
    // Fiat value depends on FX rate (EUR defaults to 1.19)
    expect(cashBreakdown.fiat.value).toBeCloseTo(1190, 0)
  })
})

// ─── Equities breakdown integration ─────────────────────────────────────────

describe('equities breakdown integration', () => {
  const prices = makeBasicPrices()

  it('stocks are correctly calculated and separated from ETFs', () => {
    const positions = [
      makeStockPosition({ symbol: 'AAPL', amount: 10 }),   // 1800
      makeStockPosition({ symbol: 'GOOGL', amount: 5 }),   // 700
    ]

    const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices)
    const equities = calculateEquitiesBreakdown(assetsWithPrice)

    expect(equities.total).toBe(2500) // 1800 + 700
    expect(equities.stocks.count).toBe(2)
  })
})

// ─── Crypto metrics integration ─────────────────────────────────────────────

describe('crypto metrics integration', () => {
  const prices = makeBasicPrices()

  it('BTC and ETH dominance add up with stablecoin ratio to cover all crypto', () => {
    const positions = [
      makeCryptoPosition({ symbol: 'BTC', amount: 1 }),     // 50000
      makeCryptoPosition({ symbol: 'ETH', amount: 10 }),    // 30000
      makeCryptoPosition({ symbol: 'USDC', amount: 20000 }),// 20000
    ]

    const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices)
    const metrics = calculateCryptoMetrics(assetsWithPrice)

    // Total crypto = 100000
    // BTC dominance = 50000/100000 = 50%
    // ETH dominance = 30000/100000 = 30%
    // Stablecoin ratio = 20000/100000 = 20%
    expect(metrics.btcDominance).toBeCloseTo(50, 0)
    expect(metrics.ethDominance).toBeCloseTo(30, 0)
    expect(metrics.stablecoinRatio).toBeCloseTo(20, 0)

    // These three cover the entire crypto portfolio
    expect(metrics.btcDominance + metrics.ethDominance + metrics.stablecoinRatio)
      .toBeCloseTo(100, 0)
  })
})
