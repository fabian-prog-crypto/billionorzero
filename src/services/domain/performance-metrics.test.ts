import {
  calculateCAGR,
  calculateMaxDrawdown,
  calculateDailyReturns,
  calculateVolatility,
  calculateSharpeRatio,
  calculatePerformanceMetrics,
  calculateUnrealizedPnL,
  getSharpeInterpretation,
  getDrawdownInterpretation,
  DEFAULT_RISK_FREE_RATE,
} from '@/services/domain/performance-metrics'
import { makeSnapshot, makeSnapshotSeries, resetSnapshotCounter } from '@/__tests__/fixtures/snapshots'

beforeEach(() => {
  resetSnapshotCounter()
})

// ---------------------------------------------------------------------------
// calculateCAGR
// ---------------------------------------------------------------------------
describe('calculateCAGR', () => {
  it('computes standard growth over one year', () => {
    // $100k -> $110k in 365 days = 10% CAGR
    const result = calculateCAGR(100_000, 110_000, 365)
    expect(result).toBeCloseTo(10, 1)
  })

  it('computes loss scenario', () => {
    // $100k -> $80k in 365 days => -20%
    const result = calculateCAGR(100_000, 80_000, 365)
    expect(result).toBeCloseTo(-20, 1)
  })

  it('returns 0 for zero start value', () => {
    expect(calculateCAGR(0, 100_000, 365)).toBe(0)
  })

  it('returns 0 for zero period', () => {
    expect(calculateCAGR(100_000, 110_000, 0)).toBe(0)
  })

  it('returns 0 for negative start value', () => {
    expect(calculateCAGR(-100, 200, 365)).toBe(0)
  })

  it('handles 1-day period', () => {
    // $100k -> $101k in 1 day => huge annualized CAGR
    // CAGR = (101000/100000)^(365/1) - 1
    const expected = (Math.pow(101_000 / 100_000, 365) - 1) * 100
    const result = calculateCAGR(100_000, 101_000, 1)
    expect(result).toBeCloseTo(expected, 0)
  })

  it('handles extreme growth (1000x)', () => {
    // $1k -> $1M in 365 days
    const expected = (Math.pow(1_000_000 / 1_000, 1) - 1) * 100 // 99900%
    const result = calculateCAGR(1_000, 1_000_000, 365)
    expect(result).toBeCloseTo(expected, 0)
  })

  it('handles multi-year calculation', () => {
    // $100k -> $200k in 730 days (2 years)
    // CAGR = (2)^(1/2) - 1 ≈ 41.42%
    const expected = (Math.pow(2, 0.5) - 1) * 100
    const result = calculateCAGR(100_000, 200_000, 730)
    expect(result).toBeCloseTo(expected, 1)
  })
})

// ---------------------------------------------------------------------------
// calculateMaxDrawdown
// ---------------------------------------------------------------------------
describe('calculateMaxDrawdown', () => {
  it('returns zeros for fewer than 2 snapshots', () => {
    const single = [makeSnapshot({ totalValue: 100_000 })]
    const result = calculateMaxDrawdown(single)
    expect(result.maxDrawdownPercent).toBe(0)
    expect(result.maxDrawdownAbsolute).toBe(0)
    expect(result.maxDrawdownDate).toBeNull()
    expect(result.currentDrawdown).toBe(0)
    expect(result.peak).toBe(100_000)
  })

  it('returns zeros for empty array', () => {
    const result = calculateMaxDrawdown([])
    expect(result.maxDrawdownPercent).toBe(0)
    expect(result.peak).toBe(0)
  })

  it('returns 0% drawdown for monotonic increase', () => {
    const snapshots = makeSnapshotSeries(100_000, [1000, 2000, 3000, 4000])
    const result = calculateMaxDrawdown(snapshots)
    expect(result.maxDrawdownPercent).toBe(0)
    expect(result.maxDrawdownAbsolute).toBe(0)
    expect(result.currentDrawdown).toBe(0)
  })

  it('computes drawdown for monotonic decrease', () => {
    // 100k -> 90k -> 80k -> 70k
    const snapshots = makeSnapshotSeries(100_000, [-10_000, -10_000, -10_000])
    const result = calculateMaxDrawdown(snapshots)
    // Peak = 100k, trough = 70k => 30% drawdown
    expect(result.maxDrawdownPercent).toBeCloseTo(30, 1)
    expect(result.maxDrawdownAbsolute).toBeCloseTo(30_000, 0)
    expect(result.currentDrawdown).toBeCloseTo(30, 1)
  })

  it('computes V-shaped recovery', () => {
    // 100k -> 80k -> 60k -> 80k -> 100k
    const snapshots = makeSnapshotSeries(100_000, [-20_000, -20_000, 20_000, 20_000])
    const result = calculateMaxDrawdown(snapshots)
    // Peak = 100k, trough = 60k => 40% max drawdown
    expect(result.maxDrawdownPercent).toBeCloseTo(40, 1)
    expect(result.maxDrawdownAbsolute).toBeCloseTo(40_000, 0)
    // Recovered fully, so current drawdown = 0
    expect(result.currentDrawdown).toBeCloseTo(0, 1)
  })

  it('finds the deepest drawdown among multiple dips', () => {
    // 100k -> 90k -> 110k -> 85k -> 105k
    const snapshots = makeSnapshotSeries(100_000, [-10_000, 20_000, -25_000, 20_000])
    const result = calculateMaxDrawdown(snapshots)
    // First dip: peak=100k, low=90k => 10%
    // Second dip: peak=110k, low=85k => 22.7%
    expect(result.maxDrawdownPercent).toBeCloseTo((25_000 / 110_000) * 100, 1)
    expect(result.maxDrawdownAbsolute).toBeCloseTo(25_000, 0)
  })

  it('reports current drawdown correctly when still in drawdown', () => {
    // 100k -> 120k -> 90k
    const snapshots = makeSnapshotSeries(100_000, [20_000, -30_000])
    const result = calculateMaxDrawdown(snapshots)
    // Peak = 120k, current = 90k => (30k/120k)*100 = 25%
    expect(result.currentDrawdown).toBeCloseTo(25, 1)
    expect(result.peak).toBe(120_000)
  })

  it('handles peak=0 gracefully', () => {
    const snapshots = [
      makeSnapshot({ totalValue: 0, date: '2024-01-01' }),
      makeSnapshot({ totalValue: 0, date: '2024-01-02' }),
    ]
    const result = calculateMaxDrawdown(snapshots)
    expect(result.maxDrawdownPercent).toBe(0)
    expect(result.currentDrawdown).toBe(0)
  })

  it('records the date of the maximum drawdown', () => {
    const snapshots = makeSnapshotSeries(100_000, [10_000, -30_000, 5_000])
    const result = calculateMaxDrawdown(snapshots)
    // The deepest point is day 3 (index 2): 2024-01-03
    expect(result.maxDrawdownDate).toBe('2024-01-03')
  })
})

// ---------------------------------------------------------------------------
// calculateDailyReturns
// ---------------------------------------------------------------------------
describe('calculateDailyReturns', () => {
  it('returns empty array for fewer than 2 snapshots', () => {
    expect(calculateDailyReturns([])).toEqual([])
    expect(calculateDailyReturns([makeSnapshot()])).toEqual([])
  })

  it('computes known daily returns', () => {
    // 100k -> 110k -> 99k
    const snapshots = makeSnapshotSeries(100_000, [10_000, -11_000])
    const returns = calculateDailyReturns(snapshots)
    expect(returns).toHaveLength(2)
    expect(returns[0]).toBeCloseTo(0.10, 5) // +10%
    expect(returns[1]).toBeCloseTo(-0.10, 5) // -10% of 110k
  })

  it('skips days where previous value is zero', () => {
    const snapshots = [
      makeSnapshot({ totalValue: 0, date: '2024-01-01' }),
      makeSnapshot({ totalValue: 100_000, date: '2024-01-02' }),
      makeSnapshot({ totalValue: 110_000, date: '2024-01-03' }),
    ]
    const returns = calculateDailyReturns(snapshots)
    // First pair (0 -> 100k) is skipped; second pair (100k -> 110k) = +10%
    expect(returns).toHaveLength(1)
    expect(returns[0]).toBeCloseTo(0.10, 5)
  })

  it('handles negative values', () => {
    // -100k -> -50k is a return of (-50k - (-100k)) / -100k = 50k / -100k = -0.5
    const snapshots = [
      makeSnapshot({ totalValue: -100_000, date: '2024-01-01' }),
      makeSnapshot({ totalValue: -50_000, date: '2024-01-02' }),
    ]
    const returns = calculateDailyReturns(snapshots)
    // prevValue = -100000 which is not > 0, so it's skipped
    expect(returns).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// calculateVolatility
// ---------------------------------------------------------------------------
describe('calculateVolatility', () => {
  it('returns 0 for fewer than 2 returns', () => {
    expect(calculateVolatility([])).toBe(0)
    expect(calculateVolatility([0.01])).toBe(0)
  })

  it('returns 0 for all-equal returns', () => {
    const returns = [0.01, 0.01, 0.01, 0.01, 0.01]
    const result = calculateVolatility(returns)
    expect(result).toBeCloseTo(0, 5)
  })

  it('applies sqrt(252) annualization factor', () => {
    // Two returns: +1%, -1%. Mean = 0.
    // Variance = ((0.01)^2 + (-0.01)^2) / (2-1) = 0.0002
    // StdDev = sqrt(0.0002) ≈ 0.01414
    // Annualized = 0.01414 * sqrt(252) * 100
    const returns = [0.01, -0.01]
    const expectedStdDev = Math.sqrt(0.0002)
    const expectedAnnualized = expectedStdDev * Math.sqrt(252) * 100
    const result = calculateVolatility(returns)
    expect(result).toBeCloseTo(expectedAnnualized, 2)
  })

  it('handles a single return (returns 0)', () => {
    expect(calculateVolatility([0.05])).toBe(0)
  })

  it('computes volatility for negative returns', () => {
    // Returns: -0.02, -0.03. Mean = -0.025.
    // Diffs from mean: 0.005, -0.005. Squared: 0.000025, 0.000025.
    // Variance = 0.00005 / 1 = 0.00005
    // StdDev = sqrt(0.00005) ≈ 0.007071
    // Annualized = 0.007071 * sqrt(252) * 100
    const returns = [-0.02, -0.03]
    const expectedStdDev = Math.sqrt(0.00005)
    const expectedAnnualized = expectedStdDev * Math.sqrt(252) * 100
    const result = calculateVolatility(returns)
    expect(result).toBeCloseTo(expectedAnnualized, 2)
  })
})

// ---------------------------------------------------------------------------
// calculateSharpeRatio
// ---------------------------------------------------------------------------
describe('calculateSharpeRatio', () => {
  it('returns 0 for zero volatility', () => {
    expect(calculateSharpeRatio(0.10, 0)).toBe(0)
  })

  it('returns 0 for negative volatility', () => {
    expect(calculateSharpeRatio(0.10, -0.05)).toBe(0)
  })

  it('computes positive excess return', () => {
    // return=15%, vol=20%, risk-free=5% => (0.15-0.05)/0.20 = 0.5
    const result = calculateSharpeRatio(0.15, 0.20, 0.05)
    expect(result).toBeCloseTo(0.5, 5)
  })

  it('computes negative excess return', () => {
    // return=2%, vol=20%, risk-free=5% => (0.02-0.05)/0.20 = -0.15
    const result = calculateSharpeRatio(0.02, 0.20, 0.05)
    expect(result).toBeCloseTo(-0.15, 5)
  })

  it('computes zero excess return', () => {
    // return=5%, vol=20%, risk-free=5% => (0.05-0.05)/0.20 = 0
    const result = calculateSharpeRatio(0.05, 0.20, 0.05)
    expect(result).toBeCloseTo(0, 5)
  })
})

// ---------------------------------------------------------------------------
// calculatePerformanceMetrics
// ---------------------------------------------------------------------------
describe('calculatePerformanceMetrics', () => {
  it('returns defaults with insufficient data flag for <2 snapshots', () => {
    const result = calculatePerformanceMetrics([])
    expect(result.totalReturn).toBe(0)
    expect(result.cagr).toBe(0)
    expect(result.sharpeRatio).toBe(0)
    expect(result.dataQuality.hasInsufficientData).toBe(true)
    expect(result.dataPoints).toBe(0)
  })

  it('returns defaults for single snapshot', () => {
    const result = calculatePerformanceMetrics([makeSnapshot()])
    expect(result.dataPoints).toBe(1)
    expect(result.dataQuality.hasInsufficientData).toBe(true)
    expect(result.periodDays).toBe(0)
  })

  it('flags hasInsufficientData for 10-day period', () => {
    // 10 days of data: below MIN_DAYS_FOR_CAGR(30), MIN_DAYS_FOR_VOLATILITY(30), MIN_DAYS_FOR_SHARPE(60)
    const changes = Array.from({ length: 10 }, () => 1000)
    const snapshots = makeSnapshotSeries(100_000, changes)
    const result = calculatePerformanceMetrics(snapshots)
    expect(result.dataQuality.hasInsufficientData).toBe(true)
    expect(result.dataQuality.cagrWarning).not.toBeNull()
    expect(result.dataQuality.volatilityWarning).not.toBeNull()
    expect(result.dataQuality.sharpeWarning).not.toBeNull()
  })

  it('gives CAGR and volatility warnings but no sharpe warning at 45 data points / 44 days', () => {
    // 45 data points: above MIN_DAYS_FOR_VOLATILITY(30) but below RECOMMENDED(60)
    // periodDays = 44, below RECOMMENDED_DAYS_FOR_CAGR(365) but above MIN(30)
    // 45 points < MIN_DAYS_FOR_SHARPE(60)
    const changes = Array.from({ length: 44 }, () => 500)
    const snapshots = makeSnapshotSeries(100_000, changes)
    const result = calculatePerformanceMetrics(snapshots)
    // cagrWarning: annualized from 44 days (above 30 but below 365)
    expect(result.dataQuality.cagrWarning).not.toBeNull()
    // volatilityWarning: 45 points, above 30 but below 60
    expect(result.dataQuality.volatilityWarning).not.toBeNull()
    // sharpeWarning: 45 < 60
    expect(result.dataQuality.sharpeWarning).not.toBeNull()
    expect(result.dataQuality.hasInsufficientData).toBe(true)
  })

  it('has no warnings for 90+ days and 400+ day period', () => {
    // 400 day period, 401 data points
    const changes = Array.from({ length: 400 }, () => 250)
    const snapshots = makeSnapshotSeries(100_000, changes)
    const result = calculatePerformanceMetrics(snapshots)
    expect(result.dataQuality.cagrWarning).toBeNull()
    expect(result.dataQuality.volatilityWarning).toBeNull()
    expect(result.dataQuality.sharpeWarning).toBeNull()
    expect(result.dataQuality.hasInsufficientData).toBe(false)
  })

  it('wires all sub-calculations correctly for a known series', () => {
    // 100k -> 110k -> 121k (two days, 10% daily growth)
    const snapshots = makeSnapshotSeries(100_000, [10_000, 11_000])
    const result = calculatePerformanceMetrics(snapshots)

    // totalReturn: (121k - 100k) / 100k * 100 = 21%
    expect(result.totalReturn).toBeCloseTo(21, 1)
    expect(result.totalReturnAbsolute).toBeCloseTo(21_000, 0)

    // periodDays = 2
    expect(result.periodDays).toBe(2)
    expect(result.dataPoints).toBe(3)

    // CAGR = (121000/100000)^(365/2) - 1 (very large annualized)
    const expectedCagr = (Math.pow(121_000 / 100_000, 365 / 2) - 1) * 100
    expect(result.cagr).toBeCloseTo(expectedCagr, 0)

    // maxDrawdown should be 0 (monotonically increasing)
    expect(result.maxDrawdown).toBe(0)
    expect(result.currentDrawdown).toBe(0)

    // Both daily returns are exactly 10%, so volatility = 0 (no variance)
    expect(result.volatility).toBeCloseTo(0, 5)

    // riskFreeRateUsed
    expect(result.riskFreeRateUsed).toBe(DEFAULT_RISK_FREE_RATE)
  })
})

// ---------------------------------------------------------------------------
// calculateUnrealizedPnL
// ---------------------------------------------------------------------------
describe('calculateUnrealizedPnL', () => {
  it('returns zeros when costBasis is undefined', () => {
    const result = calculateUnrealizedPnL(50_000, undefined, undefined)
    expect(result.pnl).toBe(0)
    expect(result.pnlPercent).toBe(0)
    expect(result.annualizedReturn).toBe(0)
    expect(result.holdingDays).toBe(0)
  })

  it('returns zeros when costBasis is 0', () => {
    const result = calculateUnrealizedPnL(50_000, 0, '2024-01-01')
    expect(result.pnl).toBe(0)
    expect(result.pnlPercent).toBe(0)
  })

  it('computes profit correctly', () => {
    const result = calculateUnrealizedPnL(120_000, 100_000, undefined)
    expect(result.pnl).toBe(20_000)
    expect(result.pnlPercent).toBeCloseTo(20, 1)
    // No purchaseDate => holdingDays and annualized remain 0
    expect(result.holdingDays).toBe(0)
    expect(result.annualizedReturn).toBe(0)
  })

  it('computes loss correctly', () => {
    const result = calculateUnrealizedPnL(80_000, 100_000, undefined)
    expect(result.pnl).toBe(-20_000)
    expect(result.pnlPercent).toBeCloseTo(-20, 1)
  })

  it('computes annualized return with purchaseDate', () => {
    // Buy 365 days ago at 100k, now worth 121k => CAGR = 21%
    const purchaseDate = new Date()
    purchaseDate.setDate(purchaseDate.getDate() - 365)
    const dateStr = purchaseDate.toISOString().split('T')[0]
    const result = calculateUnrealizedPnL(121_000, 100_000, dateStr)
    expect(result.pnl).toBe(21_000)
    expect(result.pnlPercent).toBeCloseTo(21, 1)
    expect(result.holdingDays).toBeCloseTo(365, 1)
    expect(result.annualizedReturn).toBeCloseTo(21, 1)
  })
})

// ---------------------------------------------------------------------------
// getSharpeInterpretation
// ---------------------------------------------------------------------------
describe('getSharpeInterpretation', () => {
  it('returns "Excellent" for sharpe >= 3', () => {
    const result = getSharpeInterpretation(3.5)
    expect(result.label).toBe('Excellent')
    expect(result.color).toBe('var(--positive)')
  })

  it('returns "Very Good" for sharpe >= 2 and < 3', () => {
    const result = getSharpeInterpretation(2.5)
    expect(result.label).toBe('Very Good')
    expect(result.color).toBe('var(--positive)')
  })

  it('returns "Good" for sharpe >= 1 and < 2', () => {
    const result = getSharpeInterpretation(1.5)
    expect(result.label).toBe('Good')
    expect(result.color).toBe('var(--foreground)')
  })

  it('returns "Below Average" for sharpe >= 0 and < 1', () => {
    const result = getSharpeInterpretation(0.5)
    expect(result.label).toBe('Below Average')
    expect(result.color).toBe('var(--foreground-muted)')
  })

  it('returns "Poor" for negative sharpe', () => {
    const result = getSharpeInterpretation(-0.5)
    expect(result.label).toBe('Poor')
    expect(result.color).toBe('var(--negative)')
  })
})

// ---------------------------------------------------------------------------
// getDrawdownInterpretation
// ---------------------------------------------------------------------------
describe('getDrawdownInterpretation', () => {
  it('returns "Low Risk" for drawdown <= 5', () => {
    const result = getDrawdownInterpretation(3)
    expect(result.label).toBe('Low Risk')
    expect(result.color).toBe('var(--positive)')
  })

  it('returns "Moderate" for drawdown > 5 and <= 10', () => {
    const result = getDrawdownInterpretation(8)
    expect(result.label).toBe('Moderate')
    expect(result.color).toBe('var(--foreground)')
  })

  it('returns "Elevated" for drawdown > 10 and <= 20', () => {
    const result = getDrawdownInterpretation(15)
    expect(result.label).toBe('Elevated')
    expect(result.color).toBe('var(--foreground-muted)')
  })

  it('returns "High" for drawdown > 20 and <= 30', () => {
    const result = getDrawdownInterpretation(25)
    expect(result.label).toBe('High')
    expect(result.color).toBe('var(--negative)')
  })

  it('returns "Severe" for drawdown > 30', () => {
    const result = getDrawdownInterpretation(50)
    expect(result.label).toBe('Severe')
    expect(result.color).toBe('var(--negative)')
  })
})
