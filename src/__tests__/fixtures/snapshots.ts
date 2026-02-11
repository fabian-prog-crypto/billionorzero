import type { NetWorthSnapshot } from '@/types'

let snapshotCounter = 0

export function makeSnapshot(overrides: Partial<NetWorthSnapshot> = {}): NetWorthSnapshot {
  return {
    id: `snap-${++snapshotCounter}`,
    date: '2024-01-01',
    totalValue: 100000,
    cryptoValue: 60000,
    equityValue: 30000,
    cashValue: 8000,
    otherValue: 2000,
    stockValue: 30000,
    manualValue: 2000,
    ...overrides,
  }
}

export function makeSnapshotSeries(
  startValue: number,
  changes: number[],
  startDate: string = '2024-01-01',
): NetWorthSnapshot[] {
  const snapshots: NetWorthSnapshot[] = []
  let currentValue = startValue
  const start = new Date(startDate)

  snapshots.push(makeSnapshot({
    date: start.toISOString().split('T')[0],
    totalValue: currentValue,
    cryptoValue: currentValue * 0.6,
    equityValue: currentValue * 0.3,
    cashValue: currentValue * 0.08,
    otherValue: currentValue * 0.02,
    stockValue: currentValue * 0.3,
    manualValue: currentValue * 0.02,
  }))

  for (let i = 0; i < changes.length; i++) {
    currentValue += changes[i]
    const date = new Date(start)
    date.setDate(date.getDate() + i + 1)
    snapshots.push(makeSnapshot({
      date: date.toISOString().split('T')[0],
      totalValue: currentValue,
      cryptoValue: currentValue * 0.6,
      equityValue: currentValue * 0.3,
      cashValue: currentValue * 0.08,
      otherValue: currentValue * 0.02,
      stockValue: currentValue * 0.3,
      manualValue: currentValue * 0.02,
    }))
  }

  return snapshots
}

export function resetSnapshotCounter() {
  snapshotCounter = 0
}
