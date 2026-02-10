import {
  getStockLogoUrls,
  getStockLogoUrl,
  hasKnownDomain,
  getStockDomain,
  getStockLogoService,
} from './stock-logo-service'

describe('getStockLogoUrl', () => {
  it('returns Elbstream URL with uppercased symbol', () => {
    expect(getStockLogoUrl('aapl')).toBe(
      'https://api.elbstream.com/logos/symbol/AAPL'
    )
  })

  it('handles already-uppercased symbols', () => {
    expect(getStockLogoUrl('MSFT')).toBe(
      'https://api.elbstream.com/logos/symbol/MSFT'
    )
  })
})

describe('getStockLogoUrls', () => {
  it('returns fallback chain for known ticker', () => {
    const urls = getStockLogoUrls('aapl')

    expect(urls.length).toBeGreaterThanOrEqual(4)
    expect(urls[0]).toBe('https://api.elbstream.com/logos/symbol/AAPL')
    expect(urls[1]).toBe('https://img.logo.dev/ticker/AAPL')
    expect(urls[2]).toBe('https://logo.clearbit.com/apple.com')
    expect(urls[3]).toBe('https://img.logo.dev/apple.com')
  })

  it('returns only 2 URLs for unknown ticker (no domain fallback)', () => {
    const urls = getStockLogoUrls('XYZZZ')

    expect(urls).toHaveLength(2)
    expect(urls[0]).toBe('https://api.elbstream.com/logos/symbol/XYZZZ')
    expect(urls[1]).toBe('https://img.logo.dev/ticker/XYZZZ')
  })
})

describe('hasKnownDomain', () => {
  it('returns true for known tickers', () => {
    expect(hasKnownDomain('AAPL')).toBe(true)
    expect(hasKnownDomain('msft')).toBe(true)
    expect(hasKnownDomain('SPY')).toBe(true)
  })

  it('returns false for unknown tickers', () => {
    expect(hasKnownDomain('XYZZZ')).toBe(false)
  })
})

describe('getStockDomain', () => {
  it('returns domain for known ticker', () => {
    expect(getStockDomain('aapl')).toBe('apple.com')
    expect(getStockDomain('GOOGL')).toBe('google.com')
  })

  it('returns null for unknown ticker', () => {
    expect(getStockDomain('XYZZZ')).toBeNull()
  })
})

describe('StockLogoService singleton', () => {
  it('returns same instance on repeated calls', () => {
    const a = getStockLogoService()
    const b = getStockLogoService()
    expect(a).toBe(b)
  })

  it('getLogoUrl returns Elbstream URL', () => {
    const service = getStockLogoService()
    expect(service.getLogoUrl('TSLA')).toBe(
      'https://api.elbstream.com/logos/symbol/TSLA'
    )
  })

  it('getFallbackUrls returns same as getStockLogoUrls', () => {
    const service = getStockLogoService()
    expect(service.getFallbackUrls('nvda')).toEqual(getStockLogoUrls('nvda'))
  })
})
