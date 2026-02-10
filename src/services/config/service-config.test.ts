import { ConfigManager, getConfigManager } from './service-config'

describe('service-config', () => {
  // Use fresh instances for isolation, but also clean up singleton
  let manager: ConfigManager

  beforeEach(() => {
    manager = new ConfigManager()
  })

  afterEach(() => {
    // Reset singleton state
    getConfigManager().clearAll()
  })

  describe('default config values', () => {
    it('has correct defaults', () => {
      const config = manager.getConfig()
      expect(config.useDemoData).toBe(false)
      expect(config.refreshInterval).toBe(600000)
      expect(config.debankApiKey).toBeUndefined()
      expect(config.heliusApiKey).toBeUndefined()
      expect(config.birdeyeApiKey).toBeUndefined()
      expect(config.stockApiKey).toBeUndefined()
      expect(config.ollamaUrl).toBeUndefined()
      expect(config.ollamaModel).toBeUndefined()
    })
  })

  describe('getConfig returns a copy', () => {
    it('mutations do not affect internal state', () => {
      const config = manager.getConfig()
      config.debankApiKey = 'mutated'
      config.useDemoData = true

      const fresh = manager.getConfig()
      expect(fresh.debankApiKey).toBeUndefined()
      expect(fresh.useDemoData).toBe(false)
    })
  })

  describe('loadFromStorage', () => {
    it('reads config values from localStorage keys', () => {
      localStorage.setItem('debank_api_key', 'dk_123')
      localStorage.setItem('helius_api_key', 'hk_456')
      localStorage.setItem('birdeye_api_key', 'bk_789')
      localStorage.setItem('stock_api_key', 'sk_abc')
      localStorage.setItem('ollama_url', 'http://custom:1234')
      localStorage.setItem('ollama_model', 'mistral')

      manager.loadFromStorage()
      const config = manager.getConfig()

      expect(config.debankApiKey).toBe('dk_123')
      expect(config.heliusApiKey).toBe('hk_456')
      expect(config.birdeyeApiKey).toBe('bk_789')
      expect(config.stockApiKey).toBe('sk_abc')
      expect(config.ollamaUrl).toBe('http://custom:1234')
      expect(config.ollamaModel).toBe('mistral')
    })
  })

  describe('useDemoData string to boolean conversion', () => {
    it('converts string "true" to boolean true', () => {
      localStorage.setItem('use_demo_data', 'true')
      manager.loadFromStorage()
      expect(manager.getConfig().useDemoData).toBe(true)
    })

    it('converts other strings to false', () => {
      localStorage.setItem('use_demo_data', 'false')
      manager.loadFromStorage()
      expect(manager.getConfig().useDemoData).toBe(false)
    })
  })

  describe('setConfig persists to localStorage', () => {
    it('persists string values to localStorage', () => {
      manager.setConfig({ debankApiKey: 'new-key' })
      expect(localStorage.getItem('debank_api_key')).toBe('new-key')
    })

    it('persists useDemoData as string', () => {
      manager.setConfig({ useDemoData: true })
      expect(localStorage.getItem('use_demo_data')).toBe('true')
    })
  })

  describe('setConfig with undefined/empty removes key', () => {
    it('removes key from localStorage when set to empty string', () => {
      localStorage.setItem('debank_api_key', 'existing')
      manager.setConfig({ debankApiKey: '' })
      expect(localStorage.getItem('debank_api_key')).toBeNull()
    })

    it('does not touch localStorage when value is undefined (no-op)', () => {
      localStorage.setItem('stock_api_key', 'existing')
      manager.setConfig({ stockApiKey: undefined })
      // undefined means "not included in update" -- localStorage is untouched
      expect(localStorage.getItem('stock_api_key')).toBe('existing')
    })
  })

  describe('subscribe', () => {
    it('receives updates on config change', () => {
      const listener = vi.fn()
      manager.subscribe(listener)

      manager.setConfig({ debankApiKey: 'abc' })

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ debankApiKey: 'abc' })
      )
    })
  })

  describe('unsubscribe', () => {
    it('stops receiving updates after unsubscribe', () => {
      const listener = vi.fn()
      const unsubscribe = manager.subscribe(listener)

      manager.setConfig({ debankApiKey: 'first' })
      expect(listener).toHaveBeenCalledTimes(1)

      unsubscribe()
      manager.setConfig({ debankApiKey: 'second' })
      expect(listener).toHaveBeenCalledTimes(1)
    })
  })

  describe('hasApiKeys', () => {
    it('returns false when no API keys are set', () => {
      expect(manager.hasApiKeys()).toBe(false)
    })

    it('returns true when debankApiKey is set', () => {
      manager.setConfig({ debankApiKey: 'dk_123' })
      expect(manager.hasApiKeys()).toBe(true)
    })

    it('returns true when stockApiKey is set', () => {
      manager.setConfig({ stockApiKey: 'sk_456' })
      expect(manager.hasApiKeys()).toBe(true)
    })
  })

  describe('hasSolanaProvider', () => {
    it('returns false when neither helius nor birdeye is configured', () => {
      expect(manager.hasSolanaProvider()).toBe(false)
    })

    it('returns true when helius is configured', () => {
      manager.setConfig({ heliusApiKey: 'hk_123' })
      expect(manager.hasSolanaProvider()).toBe(true)
    })

    it('returns true when birdeye is configured', () => {
      manager.setConfig({ birdeyeApiKey: 'bk_456' })
      expect(manager.hasSolanaProvider()).toBe(true)
    })
  })

  describe('clearAll', () => {
    it('resets config to defaults and clears localStorage', () => {
      manager.setConfig({ debankApiKey: 'dk_123', stockApiKey: 'sk_456', useDemoData: true })
      manager.clearAll()

      const config = manager.getConfig()
      expect(config.debankApiKey).toBeUndefined()
      expect(config.stockApiKey).toBeUndefined()
      expect(config.useDemoData).toBe(false)
      expect(localStorage.getItem('debank_api_key')).toBeNull()
      expect(localStorage.getItem('stock_api_key')).toBeNull()
      expect(localStorage.getItem('use_demo_data')).toBeNull()
    })
  })

  describe('convenience setters', () => {
    it('setDebankApiKey sets the key', () => {
      manager.setDebankApiKey('dk_abc')
      expect(manager.getConfig().debankApiKey).toBe('dk_abc')
      expect(localStorage.getItem('debank_api_key')).toBe('dk_abc')
    })

    it('setHeliusApiKey sets the key', () => {
      manager.setHeliusApiKey('hk_def')
      expect(manager.getConfig().heliusApiKey).toBe('hk_def')
    })

    it('setBirdeyeApiKey sets the key', () => {
      manager.setBirdeyeApiKey('bk_ghi')
      expect(manager.getConfig().birdeyeApiKey).toBe('bk_ghi')
    })

    it('setStockApiKey sets the key', () => {
      manager.setStockApiKey('sk_jkl')
      expect(manager.getConfig().stockApiKey).toBe('sk_jkl')
    })

    it('setUseDemoData sets the flag', () => {
      manager.setUseDemoData(true)
      expect(manager.getConfig().useDemoData).toBe(true)
    })
  })

  describe('getOllamaUrl and getOllamaModel', () => {
    it('returns default URL when not configured', () => {
      expect(manager.getOllamaUrl()).toBe('http://localhost:11434')
    })

    it('returns default model when not configured', () => {
      expect(manager.getOllamaModel()).toBe('llama3.2')
    })

    it('returns custom URL when configured', () => {
      manager.setConfig({ ollamaUrl: 'http://remote:5000' })
      expect(manager.getOllamaUrl()).toBe('http://remote:5000')
    })

    it('returns custom model when configured', () => {
      manager.setConfig({ ollamaModel: 'codellama' })
      expect(manager.getOllamaModel()).toBe('codellama')
    })
  })

  describe('get() method', () => {
    it('returns individual config values', () => {
      manager.setConfig({ debankApiKey: 'dk_test', useDemoData: true })
      expect(manager.get('debankApiKey')).toBe('dk_test')
      expect(manager.get('useDemoData')).toBe(true)
      expect(manager.get('refreshInterval')).toBe(600000)
    })
  })
})
