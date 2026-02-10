import { formatCurrency, formatPercent, formatNumber, getChangeColor, cn } from '@/lib/utils'

describe('formatCurrency', () => {
  it('returns $0.00 for zero', () => {
    expect(formatCurrency(0)).toBe('$0.00')
  })

  it('returns $0 for NaN', () => {
    expect(formatCurrency(NaN)).toBe('$0')
  })

  it('returns $0 for undefined coerced to number', () => {
    expect(formatCurrency(undefined as unknown as number)).toBe('$0')
  })

  it('formats sub-penny values with 4 significant figures', () => {
    expect(formatCurrency(0.005)).toBe('$0.005000')
  })

  it('formats very small sub-penny values', () => {
    expect(formatCurrency(0.0001)).toBe('$0.0001000')
  })

  it('formats sub-dollar values with 4 decimals', () => {
    expect(formatCurrency(0.50)).toBe('$0.5000')
  })

  it('formats values under $10 with 2 decimals', () => {
    expect(formatCurrency(5.99)).toBe('$5.99')
  })

  it('formats $10+ with commas and no decimals', () => {
    expect(formatCurrency(12345)).toBe('$12,345')
  })

  it('formats negative values with -$ prefix', () => {
    expect(formatCurrency(-500)).toBe('-$500')
  })

  it('formats negative sub-penny values', () => {
    expect(formatCurrency(-0.005)).toBe('-$0.005000')
  })

  it('formats large values ($10B+) with commas', () => {
    expect(formatCurrency(10_000_000_000)).toBe('$10,000,000,000')
  })

  it('formats $1 boundary as sub-dollar (4 decimals)', () => {
    expect(formatCurrency(0.9999)).toBe('$0.9999')
  })
})

describe('formatPercent', () => {
  it('formats positive with + prefix', () => {
    expect(formatPercent(2.50)).toBe('+2.50%')
  })

  it('formats negative with - prefix', () => {
    expect(formatPercent(-3.14)).toBe('-3.14%')
  })

  it('formats zero as +0.00%', () => {
    expect(formatPercent(0)).toBe('+0.00%')
  })

  it('returns +0.00% for NaN', () => {
    expect(formatPercent(NaN)).toBe('+0.00%')
  })
})

describe('formatNumber', () => {
  it('formats with commas and default 2 decimals', () => {
    expect(formatNumber(1234567.89)).toBe('1,234,567.89')
  })

  it('shows 6 decimals for very small values', () => {
    expect(formatNumber(0.001)).toBe('0.001000')
  })

  it('returns 0 for NaN', () => {
    expect(formatNumber(NaN)).toBe('0')
  })

  it('formats negative values with minus prefix', () => {
    expect(formatNumber(-42.5)).toBe('-42.50')
  })
})

describe('getChangeColor', () => {
  it('returns text-positive for positive values', () => {
    expect(getChangeColor(1)).toBe('text-positive')
  })

  it('returns text-negative for negative values', () => {
    expect(getChangeColor(-1)).toBe('text-negative')
  })

  it('returns muted color for zero', () => {
    expect(getChangeColor(0)).toBe('text-[var(--foreground-muted)]')
  })
})

describe('cn', () => {
  it('joins truthy class names with space', () => {
    expect(cn('a', false, 'b', undefined, 'c')).toBe('a b c')
  })

  it('returns empty string for no arguments', () => {
    expect(cn()).toBe('')
  })
})
