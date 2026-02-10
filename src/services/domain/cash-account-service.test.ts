import {
  toSlug,
  extractCashAccountName,
  isCashAccountSlugTaken,
  linkOrphanedCashPositions,
  aggregateCashByCurrency,
} from '@/services/domain/cash-account-service'
import { makeCashPosition, makeAssetWithPrice } from '@/__tests__/fixtures'
import type { CashAccount } from '@/types'

function makeCashAccount(overrides: Partial<CashAccount> = {}): CashAccount {
  return {
    id: 'ca-1',
    slug: 'revolut',
    name: 'Revolut',
    isActive: true,
    addedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('toSlug', () => {
  it('converts "My Bank Account" to "my-bank-account"', () => {
    expect(toSlug('My Bank Account')).toBe('my-bank-account')
  })

  it('trims leading and trailing whitespace', () => {
    expect(toSlug('  hello  ')).toBe('hello')
  })

  it('collapses multiple spaces into a single dash', () => {
    expect(toSlug('a   b   c')).toBe('a-b-c')
  })

  it('returns empty string for empty input', () => {
    expect(toSlug('')).toBe('')
  })
})

describe('extractCashAccountName', () => {
  it('extracts name before parentheses', () => {
    expect(extractCashAccountName('Revolut (EUR)')).toBe('Revolut')
  })

  it('returns full name when no parentheses', () => {
    expect(extractCashAccountName('My Savings')).toBe('My Savings')
  })

  it('returns "Manual" for empty string', () => {
    expect(extractCashAccountName('')).toBe('Manual')
  })

  it('trims whitespace before parentheses', () => {
    expect(extractCashAccountName('N26   (CHF)')).toBe('N26')
  })
})

describe('isCashAccountSlugTaken', () => {
  const accounts = [
    makeCashAccount({ slug: 'revolut' }),
    makeCashAccount({ id: 'ca-2', slug: 'n26' }),
  ]

  it('returns true when slug already exists', () => {
    expect(isCashAccountSlugTaken('Revolut', accounts)).toBe(true)
  })

  it('returns false when slug does not exist', () => {
    expect(isCashAccountSlugTaken('Wise', accounts)).toBe(false)
  })
})

describe('linkOrphanedCashPositions', () => {
  it('returns null when all positions are already linked', () => {
    const account = makeCashAccount({ id: 'ca-1', slug: 'revolut' })
    const pos = makeCashPosition({
      name: 'Revolut (USD)',
      protocol: 'cash-account:ca-1',
    })
    const result = linkOrphanedCashPositions([pos], [account])
    expect(result).toBeNull()
  })

  it('creates account and links orphaned position without protocol', () => {
    const pos = makeCashPosition({
      name: 'Wise (GBP)',
      protocol: undefined,
    })
    const result = linkOrphanedCashPositions([pos], [])
    expect(result).not.toBeNull()
    expect(result!.cashAccounts).toHaveLength(1)
    expect(result!.cashAccounts[0].slug).toBe('wise')
    expect(result!.cashAccounts[0].name).toBe('Wise')
    expect(result!.positions[0].protocol).toMatch(/^cash-account:.+/)
  })

  it('re-creates account when protocol points to missing account', () => {
    const pos = makeCashPosition({
      name: 'N26 (EUR)',
      protocol: 'cash-account:missing-id',
    })
    const result = linkOrphanedCashPositions([pos], [])
    expect(result).not.toBeNull()
    expect(result!.cashAccounts).toHaveLength(1)
    // Reuses the UUID from the protocol
    expect(result!.cashAccounts[0].id).toBe('missing-id')
    expect(result!.cashAccounts[0].slug).toBe('n26')
  })
})

describe('aggregateCashByCurrency', () => {
  it('groups positions by currency and sums values', () => {
    const positions = [
      makeAssetWithPrice({
        type: 'cash',
        symbol: 'CASH_USD_revolut',
        name: 'Revolut (USD)',
        amount: 5000,
        value: 5000,
      }),
      makeAssetWithPrice({
        type: 'cash',
        symbol: 'CASH_USD_wise',
        name: 'Wise (USD)',
        amount: 3000,
        value: 3000,
      }),
      makeAssetWithPrice({
        type: 'cash',
        symbol: 'CASH_EUR_revolut',
        name: 'Revolut (EUR)',
        amount: 2000,
        value: 2200,
      }),
    ]
    const result = aggregateCashByCurrency(positions)
    expect(result).toHaveLength(2)
    // Sorted by value descending: USD (8000) then EUR (2200)
    expect(result[0].name).toBe('USD')
    expect(result[0].value).toBe(8000)
    expect(result[0].amount).toBe(8000)
    expect(result[1].name).toBe('EUR')
    expect(result[1].value).toBe(2200)
  })

  it('returns sorted by value descending', () => {
    const positions = [
      makeAssetWithPrice({
        type: 'cash',
        symbol: 'CASH_CHF_ubs',
        name: 'UBS (CHF)',
        amount: 100,
        value: 110,
      }),
      makeAssetWithPrice({
        type: 'cash',
        symbol: 'CASH_EUR_n26',
        name: 'N26 (EUR)',
        amount: 9000,
        value: 9900,
      }),
    ]
    const result = aggregateCashByCurrency(positions)
    expect(result[0].name).toBe('EUR')
    expect(result[1].name).toBe('CHF')
  })
})
