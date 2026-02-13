import { describe, expect, it } from 'vitest'
import { makePosition } from '@/__tests__/fixtures'
import { executePartialSell } from './position-operations'

describe('executePartialSell', () => {
  it('reduces amount and cost basis proportionally for partial sells', () => {
    const position = makePosition({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      type: 'stock',
      assetClass: 'equity',
      amount: 10,
      costBasis: 1000,
    })

    const result = executePartialSell(position, 2, 150, '2026-02-13')

    expect(result.removedPositionId).toBeUndefined()
    expect(result.updatedPosition).toEqual({
      amount: 8,
      costBasis: 800,
    })
    expect(result.transaction.costBasisAtExecution).toBe(200)
    expect(result.transaction.realizedPnL).toBe(100)
    expect(result.transaction.totalValue).toBe(300)
  })

  it('removes position when selling the full amount', () => {
    const position = makePosition({
      symbol: 'ETH',
      amount: 5,
      costBasis: 500,
    })

    const result = executePartialSell(position, 5, 120, '2026-02-13')

    expect(result.removedPositionId).toBe(position.id)
    expect(result.updatedPosition).toBeUndefined()
    expect(result.transaction.costBasisAtExecution).toBe(500)
    expect(result.transaction.realizedPnL).toBe(100)
  })

  it('keeps cost-basis fields undefined when source position has no cost basis', () => {
    const position = makePosition({
      symbol: 'BTC',
      amount: 1,
      costBasis: undefined,
    })

    const result = executePartialSell(position, 0.25, 40000, '2026-02-13')

    expect(result.updatedPosition).toEqual({
      amount: 0.75,
      costBasis: undefined,
    })
    expect(result.transaction.costBasisAtExecution).toBeUndefined()
    expect(result.transaction.realizedPnL).toBeUndefined()
  })
})
