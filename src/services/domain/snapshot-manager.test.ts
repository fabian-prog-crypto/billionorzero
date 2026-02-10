import {
  shouldTakeSnapshot,
  getSnapshotsByPeriod,
  calculatePerformance,
  getSnapshotsInRange,
} from '@/services/domain/snapshot-manager'
import { makeSnapshot, makeSnapshotSeries } from '@/__tests__/fixtures'

describe('shouldTakeSnapshot', () => {
  it('returns true when snapshots array is empty', () => {
    expect(shouldTakeSnapshot([])).toBe(true)
  })

  it('returns false when last snapshot is today', () => {
    const today = new Date().toISOString().split('T')[0]
    const snap = makeSnapshot({ date: today })
    expect(shouldTakeSnapshot([snap])).toBe(false)
  })

  it('returns true when last snapshot is yesterday', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]
    const snap = makeSnapshot({ date: yesterday })
    expect(shouldTakeSnapshot([snap])).toBe(true)
  })
})

describe('getSnapshotsByPeriod', () => {
  // Create a series spanning 400 days back so we can test all period filters
  const now = new Date()
  const snapshots = Array.from({ length: 400 }, (_, i) => {
    const date = new Date(now.getTime() - (399 - i) * 86_400_000)
    return makeSnapshot({
      date: date.toISOString().split('T')[0],
      totalValue: 100000 + i * 100,
    })
  })

  it('returns all snapshots for "all" period', () => {
    expect(getSnapshotsByPeriod(snapshots, 'all')).toHaveLength(400)
  })

  it('returns roughly 8 snapshots for "7d" period', () => {
    const result = getSnapshotsByPeriod(snapshots, '7d')
    // 7 days back + today = ~8 snapshots
    expect(result.length).toBeGreaterThanOrEqual(7)
    expect(result.length).toBeLessThanOrEqual(9)
  })

  it('returns roughly 31 snapshots for "30d" period', () => {
    const result = getSnapshotsByPeriod(snapshots, '30d')
    expect(result.length).toBeGreaterThanOrEqual(30)
    expect(result.length).toBeLessThanOrEqual(32)
  })

  it('returns roughly 366 snapshots for "1y" period', () => {
    const result = getSnapshotsByPeriod(snapshots, '1y')
    expect(result.length).toBeGreaterThanOrEqual(365)
    expect(result.length).toBeLessThanOrEqual(367)
  })
})

describe('calculatePerformance', () => {
  it('calculates profit correctly', () => {
    const start = makeSnapshot({ totalValue: 100000, cryptoValue: 60000, stockValue: 30000 })
    const end = makeSnapshot({ totalValue: 120000, cryptoValue: 70000, stockValue: 35000 })
    const perf = calculatePerformance(start, end)
    expect(perf.absoluteChange).toBe(20000)
    expect(perf.percentChange).toBe(20)
    expect(perf.cryptoChange).toBe(10000)
    expect(perf.stockChange).toBe(5000)
  })

  it('calculates loss correctly', () => {
    const start = makeSnapshot({ totalValue: 100000, cryptoValue: 60000, stockValue: 30000 })
    const end = makeSnapshot({ totalValue: 80000, cryptoValue: 45000, stockValue: 25000 })
    const perf = calculatePerformance(start, end)
    expect(perf.absoluteChange).toBe(-20000)
    expect(perf.percentChange).toBe(-20)
    expect(perf.cryptoChange).toBe(-15000)
    expect(perf.stockChange).toBe(-5000)
  })

  it('returns 0 percent change when start total is zero', () => {
    const start = makeSnapshot({ totalValue: 0, cryptoValue: 0, stockValue: 0 })
    const end = makeSnapshot({ totalValue: 50000, cryptoValue: 30000, stockValue: 10000 })
    const perf = calculatePerformance(start, end)
    expect(perf.absoluteChange).toBe(50000)
    expect(perf.percentChange).toBe(0)
  })
})

describe('getSnapshotsInRange', () => {
  const series = makeSnapshotSeries(100000, [1000, 2000, -500, 3000])
  // series dates: 2024-01-01, 2024-01-02, 2024-01-03, 2024-01-04, 2024-01-05

  it('returns snapshots within the given date range', () => {
    const result = getSnapshotsInRange(series, '2024-01-02', '2024-01-04')
    expect(result).toHaveLength(3)
    expect(result[0].date).toBe('2024-01-02')
    expect(result[2].date).toBe('2024-01-04')
  })

  it('returns empty array when no snapshots match the range', () => {
    const result = getSnapshotsInRange(series, '2025-06-01', '2025-06-30')
    expect(result).toHaveLength(0)
  })
})
