import { makeCashPosition, makeCryptoPosition, makeStockPosition } from '@/__tests__/fixtures'
import type { Position } from '@/types'
import {
  buildManualAccountHoldings,
  getManualAccountRole,
  isManualAccountInScope,
  isPositionInAssetClass,
  isStablecoinPosition,
} from './account-role-service'

describe('account-role-service', () => {
  it('recognizes stablecoin crypto positions', () => {
    const stable = makeCryptoPosition({ symbol: 'USDC', name: 'USD Coin' })
    const nonStable = makeCryptoPosition({ symbol: 'ETH', name: 'Ethereum' })

    expect(isStablecoinPosition(stable)).toBe(true)
    expect(isStablecoinPosition(nonStable)).toBe(false)
  })

  it('filters by effective asset class', () => {
    const stock = makeStockPosition()
    const cash = makeCashPosition()

    expect(isPositionInAssetClass(stock, 'equity')).toBe(true)
    expect(isPositionInAssetClass(cash, 'equity')).toBe(false)
  })

  it('builds manual holdings with stablecoin and equity flags', () => {
    const positions: Position[] = [
      makeStockPosition({ accountId: 'a-1' }),
      makeCashPosition({ accountId: 'a-1' }),
      makeCryptoPosition({ accountId: 'a-2', symbol: 'USDC', name: 'USD Coin' }),
    ]

    const holdings = buildManualAccountHoldings(positions)
    const mixed = holdings.get('a-1')
    const stableOnly = holdings.get('a-2')

    expect(mixed?.hasEquity).toBe(true)
    expect(mixed?.hasCash).toBe(true)
    expect(getManualAccountRole(mixed)).toBe('mixed')

    expect(stableOnly?.hasCash).toBe(false)
    expect(stableOnly?.hasStablecoin).toBe(true)
    expect(getManualAccountRole(stableOnly)).toBe('cash')
  })

  it('treats empty manual accounts as in-scope when includeEmptyAccounts=true', () => {
    expect(isManualAccountInScope(undefined, 'cash')).toBe(true)
    expect(isManualAccountInScope(undefined, 'brokerage')).toBe(true)
  })

  it('allows mixed accounts in both cash and brokerage scopes', () => {
    const flags = {
      hasAny: true,
      hasCash: true,
      hasEquity: true,
      hasStablecoin: false,
      hasOther: false,
    }
    expect(isManualAccountInScope(flags, 'cash')).toBe(true)
    expect(isManualAccountInScope(flags, 'brokerage')).toBe(true)
  })
})
