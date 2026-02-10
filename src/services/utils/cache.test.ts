import { getCached, setCache, clearCache, clearAllCache, formatCacheAge, getCacheInfo } from './cache'

describe('cache', () => {
  describe('set/get round-trip', () => {
    it('stores data and retrieves it successfully', () => {
      setCache('test-key', { foo: 'bar' })
      const result = getCached<{ foo: string }>('test-key')
      expect(result).not.toBeNull()
      expect(result!.data).toEqual({ foo: 'bar' })
    })

    it('returns age in milliseconds', () => {
      const baseTime = 1000000
      vi.spyOn(Date, 'now').mockReturnValue(baseTime)
      setCache('age-key', 'hello')

      vi.spyOn(Date, 'now').mockReturnValue(baseTime + 2000)
      const result = getCached<string>('age-key')
      expect(result).not.toBeNull()
      expect(result!.age).toBe(2000)
    })
  })

  describe('TTL expiry', () => {
    it('returns null when cache has expired', () => {
      const baseTime = 1000000
      vi.spyOn(Date, 'now').mockReturnValue(baseTime)
      setCache('ttl-key', 'data', 5000)

      vi.spyOn(Date, 'now').mockReturnValue(baseTime + 6000)
      const result = getCached('ttl-key')
      expect(result).toBeNull()
    })

    it('removes expired entry from localStorage', () => {
      const baseTime = 1000000
      vi.spyOn(Date, 'now').mockReturnValue(baseTime)
      setCache('expire-key', 'data', 5000)

      vi.spyOn(Date, 'now').mockReturnValue(baseTime + 6000)
      getCached('expire-key')

      expect(localStorage.getItem('portfolio_cache_expire-key')).toBeNull()
    })
  })

  describe('custom TTL', () => {
    it('respects a custom TTL value', () => {
      const baseTime = 1000000
      vi.spyOn(Date, 'now').mockReturnValue(baseTime)
      setCache('custom-ttl', 'data', 60000)

      // Still valid at 59 seconds
      vi.spyOn(Date, 'now').mockReturnValue(baseTime + 59000)
      expect(getCached('custom-ttl')).not.toBeNull()

      // Expired at 61 seconds
      vi.spyOn(Date, 'now').mockReturnValue(baseTime + 61000)
      expect(getCached('custom-ttl')).toBeNull()
    })
  })

  describe('invalid JSON recovery', () => {
    it('returns null when localStorage contains garbage JSON', () => {
      localStorage.setItem('portfolio_cache_bad-json', 'not valid json {{{')
      const result = getCached('bad-json')
      expect(result).toBeNull()
    })
  })

  describe('SSR safety', () => {
    it('getCached returns null when window is undefined', () => {
      const origWindow = globalThis.window
      // @ts-expect-error -- simulating SSR
      delete globalThis.window
      try {
        expect(getCached('any-key')).toBeNull()
      } finally {
        globalThis.window = origWindow
      }
    })

    it('setCache does not throw when window is undefined', () => {
      const origWindow = globalThis.window
      // @ts-expect-error -- simulating SSR
      delete globalThis.window
      try {
        expect(() => setCache('any-key', 'data')).not.toThrow()
      } finally {
        globalThis.window = origWindow
      }
    })
  })

  describe('clearCache', () => {
    it('clears a specific cache key', () => {
      setCache('to-clear', 'data')
      expect(getCached('to-clear')).not.toBeNull()

      clearCache('to-clear')
      expect(getCached('to-clear')).toBeNull()
    })
  })

  describe('clearAllCache', () => {
    it('clears all cache entries with the portfolio_cache_ prefix', () => {
      // Set cache entries and also define them as enumerable properties
      // so Object.keys(localStorage) can find them
      setCache('one', 'a')
      setCache('two', 'b')
      // Also set a non-cache entry
      localStorage.setItem('other_key', 'keep')

      // The mock's Object.keys doesn't see internal store items.
      // Manually define them as enumerable properties for clearAllCache.
      Object.defineProperty(localStorage, 'portfolio_cache_one', {
        value: localStorage.getItem('portfolio_cache_one'),
        configurable: true,
        enumerable: true,
      })
      Object.defineProperty(localStorage, 'portfolio_cache_two', {
        value: localStorage.getItem('portfolio_cache_two'),
        configurable: true,
        enumerable: true,
      })
      Object.defineProperty(localStorage, 'other_key', {
        value: 'keep',
        configurable: true,
        enumerable: true,
      })

      clearAllCache()

      expect(getCached('one')).toBeNull()
      expect(getCached('two')).toBeNull()
      expect(localStorage.getItem('other_key')).toBe('keep')

      // Clean up defined properties
      delete (localStorage as Record<string, unknown>)['portfolio_cache_one']
      delete (localStorage as Record<string, unknown>)['portfolio_cache_two']
      delete (localStorage as Record<string, unknown>)['other_key']
    })
  })

  describe('formatCacheAge', () => {
    it('formats seconds', () => {
      expect(formatCacheAge(42000)).toBe('42s ago')
    })

    it('formats minutes', () => {
      expect(formatCacheAge(3 * 60 * 1000)).toBe('3m ago')
    })

    it('formats hours', () => {
      expect(formatCacheAge(60 * 60 * 1000)).toBe('1h ago')
    })
  })

  describe('quota exceeded', () => {
    it('does not crash when localStorage.setItem throws', () => {
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError')
      })
      expect(() => setCache('quota-key', 'data')).not.toThrow()
    })
  })

  describe('getCacheInfo', () => {
    it('returns metadata for cached entries', () => {
      const baseTime = 1000000
      vi.spyOn(Date, 'now').mockReturnValue(baseTime)
      setCache('info-key', { value: 42 })

      // Define enumerable property so Object.keys picks it up
      const raw = localStorage.getItem('portfolio_cache_info-key')!
      Object.defineProperty(localStorage, 'portfolio_cache_info-key', {
        value: raw,
        configurable: true,
        enumerable: true,
      })
      // Mock getItem for this key to return the raw value
      const origGetItem = localStorage.getItem.bind(localStorage)
      vi.spyOn(localStorage, 'getItem').mockImplementation((key: string) => {
        if (key === 'portfolio_cache_info-key') return raw
        return origGetItem(key)
      })

      vi.spyOn(Date, 'now').mockReturnValue(baseTime + 30000)
      const info = getCacheInfo()

      expect(info).toHaveLength(1)
      expect(info[0].key).toBe('info-key')
      expect(info[0].age).toBe('30s ago')
      expect(info[0].size).toBe(raw.length)

      delete (localStorage as Record<string, unknown>)['portfolio_cache_info-key']
    })
  })

  describe('cache key prefixing', () => {
    it('uses the portfolio_cache_ prefix for localStorage keys', () => {
      setCache('my-key', 'data')
      expect(localStorage.getItem('portfolio_cache_my-key')).not.toBeNull()
      expect(localStorage.getItem('my-key')).toBeNull()
    })
  })
})
