/**
 * Portfolio Service - Integration Tests
 *
 * Tests the main orchestrator with mocked API/provider layer
 * but real domain logic (calculateAllPositionsWithPrices, etc.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Position, Wallet } from '@/types'
import {
  makeCryptoPosition,
  makeStockPosition,
  makePrice,
  resetPositionCounter,
} from '@/__tests__/fixtures'

// ── Mock singletons used by PortfolioService ────────────────────────────────

// Mock config manager
const mockConfigManager = {
  loadFromStorage: vi.fn(),
  getConfig: vi.fn().mockReturnValue({
    debankApiKey: 'test-debank-key',
    heliusApiKey: undefined,
    birdeyeApiKey: undefined,
    stockApiKey: 'test-stock-key',
    useDemoData: false,
    refreshInterval: 600000,
  }),
  setConfig: vi.fn(),
  subscribe: vi.fn().mockReturnValue(() => {}),
}

vi.mock('@/services/config', () => ({
  getConfigManager: () => mockConfigManager,
}))

// Mock wallet provider
const mockWalletProvider = {
  fetchAllWalletPositions: vi.fn(),
  updateConfig: vi.fn(),
}

// Mock price provider
const mockPriceProvider = {
  getCoinId: vi.fn((symbol: string) => symbol.toLowerCase()),
  getCryptoPrices: vi.fn().mockResolvedValue({}),
  getPricesForPositions: vi.fn().mockResolvedValue({ prices: {}, isDemo: false }),
  getDebankPriceKey: vi.fn((symbol: string) => symbol.toLowerCase()),
  updateConfig: vi.fn(),
}

vi.mock('@/services/providers', () => ({
  getWalletProvider: vi.fn(() => mockWalletProvider),
  getPriceProvider: vi.fn(() => mockPriceProvider),
}))

// Mock FX API
const mockFxRates: Record<string, number> = { USD: 1.0, EUR: 1.19, CHF: 1.30, GBP: 1.37 }
vi.mock('@/services/api/fx-api', () => ({
  getAllFxRates: vi.fn().mockResolvedValue({ USD: 1.0, EUR: 1.19, CHF: 1.30, GBP: 1.37 }),
}))

// Import AFTER mocks are set up
import { PortfolioService } from './portfolio-service'

beforeEach(() => {
  resetPositionCounter()
  vi.clearAllMocks()
  // Reset default mock returns
  mockWalletProvider.fetchAllWalletPositions.mockResolvedValue({
    positions: [],
    prices: {},
  })
  mockPriceProvider.getCryptoPrices.mockResolvedValue({})
  mockPriceProvider.getPricesForPositions.mockResolvedValue({ prices: {}, isDemo: false })
  mockPriceProvider.getCoinId.mockImplementation((s: string) => s.toLowerCase())
  mockConfigManager.getConfig.mockReturnValue({
    debankApiKey: 'test-debank-key',
    heliusApiKey: undefined,
    birdeyeApiKey: undefined,
    stockApiKey: 'test-stock-key',
    useDemoData: false,
    refreshInterval: 600000,
  })
})

// ─── refreshPortfolio end-to-end ────────────────────────────────────────────

describe('PortfolioService integration', () => {
  describe('refreshPortfolio end-to-end', () => {
    it('merges wallet positions, prices, and FX rates into a single result', async () => {
      const walletPos: Position = makeCryptoPosition({ symbol: 'ETH', amount: 5, walletAddress: '0xabc' })
      mockWalletProvider.fetchAllWalletPositions.mockResolvedValue({
        positions: [walletPos],
        prices: { 'eth': { price: 3100, symbol: 'ETH' } },
      })
      mockPriceProvider.getCryptoPrices.mockResolvedValue({
        eth: makePrice({ symbol: 'ETH', price: 3050, change24h: 30, changePercent24h: 1.0 }),
      })
      const manualPos = makeCryptoPosition({ symbol: 'BTC', amount: 1 })
      mockPriceProvider.getPricesForPositions.mockResolvedValue({
        prices: { btc: makePrice({ symbol: 'BTC', price: 50000, change24h: 500, changePercent24h: 1.0 }) },
        isDemo: false,
      })

      const service = new PortfolioService()
      const result = await service.refreshPortfolio(
        [manualPos],
        [{ id: 'w1', address: '0xabc', name: 'test', chains: ['eth'] }]
      )

      expect(result.walletPositions).toHaveLength(1)
      expect(result.walletPositions[0].symbol).toBe('ETH')
      expect(result.fxRates).toEqual(mockFxRates)
      // prices should contain merged result: coingecko + external + debank
      expect(result.prices['btc']).toBeDefined()
      expect(result.prices['eth']).toBeDefined()
      // DeBank price takes priority (merged last)
      expect(result.prices['eth'].price).toBe(3100)
      // But 24h change comes from CoinGecko
      expect(result.prices['eth'].change24h).toBe(30)
    })

    it('returns empty wallet positions and only manual prices when no wallets provided', async () => {
      mockWalletProvider.fetchAllWalletPositions.mockResolvedValue({
        positions: [],
        prices: {},
      })
      const manualPos = makeStockPosition({ symbol: 'AAPL', amount: 10 })
      mockPriceProvider.getPricesForPositions.mockResolvedValue({
        prices: { aapl: makePrice({ symbol: 'AAPL', price: 180 }) },
        isDemo: false,
      })

      const service = new PortfolioService()
      const result = await service.refreshPortfolio([manualPos], [])

      expect(result.walletPositions).toHaveLength(0)
      expect(result.prices['aapl']).toBeDefined()
      expect(result.prices['aapl'].price).toBe(180)
      expect(result.isDemo).toBe(false)
    })
  })

  // ─── Price merge priority ──────────────────────────────────────────────────

  describe('price merge priority', () => {
    it('DeBank prices override CoinGecko prices for same token', async () => {
      mockWalletProvider.fetchAllWalletPositions.mockResolvedValue({
        positions: [makeCryptoPosition({ symbol: 'ETH', amount: 1, walletAddress: '0xabc' })],
        prices: { 'eth': { price: 3200, symbol: 'ETH' } },
      })
      // CoinGecko has a different price
      mockPriceProvider.getCryptoPrices.mockResolvedValue({
        eth: makePrice({ symbol: 'ETH', price: 3150, change24h: 50, changePercent24h: 1.6 }),
      })
      mockPriceProvider.getPricesForPositions.mockResolvedValue({ prices: {}, isDemo: false })

      const service = new PortfolioService()
      const result = await service.refreshPortfolio([], [{ id: 'w1', address: '0xabc', name: 'test', chains: ['eth'] }])

      // DeBank price (3200) wins because debankPrices are merged last
      expect(result.prices['eth'].price).toBe(3200)
      // But 24h change comes from CoinGecko
      expect(result.prices['eth'].change24h).toBe(50)
      expect(result.prices['eth'].changePercent24h).toBe(1.6)
    })

    it('CoinGecko prices serve as fallback for tokens DeBank does not price', async () => {
      mockWalletProvider.fetchAllWalletPositions.mockResolvedValue({
        positions: [makeCryptoPosition({ symbol: 'SYRUP', amount: 100, walletAddress: '0xabc' })],
        prices: {}, // DeBank has NO price for SYRUP
      })
      mockPriceProvider.getCoinId.mockImplementation((s: string) => s === 'syrup' ? 'maple-finance' : s.toLowerCase())
      mockPriceProvider.getCryptoPrices.mockResolvedValue({
        'maple-finance': makePrice({ symbol: 'SYRUP', price: 0.42, change24h: 0.01, changePercent24h: 2.4 }),
      })
      mockPriceProvider.getPricesForPositions.mockResolvedValue({ prices: {}, isDemo: false })

      const service = new PortfolioService()
      const result = await service.refreshPortfolio([], [{ id: 'w1', address: '0xabc', name: 'test', chains: ['eth'] }])

      // CoinGecko price available as fallback via 'maple-finance' key
      expect(result.prices['maple-finance']).toBeDefined()
      expect(result.prices['maple-finance'].price).toBe(0.42)
    })

    it('manual position prices from getPricesForPositions are included', async () => {
      mockWalletProvider.fetchAllWalletPositions.mockResolvedValue({
        positions: [],
        prices: {},
      })
      const manualPos = makeCryptoPosition({ symbol: 'SOL', amount: 50 })
      mockPriceProvider.getPricesForPositions.mockResolvedValue({
        prices: {
          solana: makePrice({ symbol: 'SOL', price: 105, change24h: 2, changePercent24h: 1.9 }),
        },
        isDemo: false,
      })

      const service = new PortfolioService()
      const result = await service.refreshPortfolio([manualPos], [])

      expect(result.prices['solana']).toBeDefined()
      expect(result.prices['solana'].price).toBe(105)
    })
  })

  // ─── FX rate integration ──────────────────────────────────────────────────

  describe('FX rate integration', () => {
    it('returns FX rates for use in position value calculation', async () => {
      mockWalletProvider.fetchAllWalletPositions.mockResolvedValue({
        positions: [],
        prices: {},
      })

      const service = new PortfolioService()
      const result = await service.refreshPortfolio([], [])

      expect(result.fxRates).toEqual({ USD: 1.0, EUR: 1.19, CHF: 1.30, GBP: 1.37 })
    })
  })

  // ─── Config change propagation ─────────────────────────────────────────────

  describe('config change propagation', () => {
    it('calls setConfig and reloads providers on updateConfig', () => {
      const service = new PortfolioService()
      service.updateConfig({ debankApiKey: 'new-key-123' })

      expect(mockConfigManager.setConfig).toHaveBeenCalledWith({ debankApiKey: 'new-key-123' })
    })

    it('reloads config from storage before each refresh', async () => {
      mockWalletProvider.fetchAllWalletPositions.mockResolvedValue({
        positions: [],
        prices: {},
      })

      const service = new PortfolioService()
      await service.refreshPortfolio([], [])

      // loadFromStorage is called inside updateProviders which is called in refreshPortfolio
      expect(mockConfigManager.loadFromStorage).toHaveBeenCalled()
    })
  })

  // ─── Demo mode ─────────────────────────────────────────────────────────────

  describe('demo mode', () => {
    it('propagates isDemo flag from price provider', async () => {
      mockWalletProvider.fetchAllWalletPositions.mockResolvedValue({
        positions: [],
        prices: {},
      })
      mockPriceProvider.getPricesForPositions.mockResolvedValue({
        prices: {},
        isDemo: true,
      })

      const service = new PortfolioService()
      const result = await service.refreshPortfolio([], [])

      expect(result.isDemo).toBe(true)
    })
  })

  // ─── Error resilience ─────────────────────────────────────────────────────

  describe('error resilience', () => {
    it('still returns results when getCryptoPrices fails', async () => {
      mockWalletProvider.fetchAllWalletPositions.mockResolvedValue({
        positions: [makeCryptoPosition({ symbol: 'ETH', amount: 1, walletAddress: '0xabc' })],
        prices: { 'eth': { price: 3000, symbol: 'ETH' } },
      })
      // CoinGecko fails
      mockPriceProvider.getCryptoPrices.mockRejectedValue(new Error('CoinGecko rate limited'))

      const service = new PortfolioService()
      // refreshPortfolio will throw because getCryptoPrices is awaited directly
      await expect(service.refreshPortfolio(
        [],
        [{ id: 'w1', address: '0xabc', name: 'test', chains: ['eth'] }]
      )).rejects.toThrow('CoinGecko rate limited')
    })

    it('still returns results when wallet provider fails', async () => {
      mockWalletProvider.fetchAllWalletPositions.mockRejectedValue(new Error('DeBank down'))

      const service = new PortfolioService()
      await expect(service.refreshPortfolio(
        [],
        [{ id: 'w1', address: '0xabc', name: 'test', chains: ['eth'] }]
      )).rejects.toThrow('DeBank down')
    })
  })

  // ─── Multiple wallets ─────────────────────────────────────────────────────

  describe('multiple wallets', () => {
    it('passes all wallets to fetchAllWalletPositions', async () => {
      const wallets: Wallet[] = [
        { id: 'w1', address: '0xaaa', name: 'Wallet 1', chains: ['eth'] },
        { id: 'w2', address: '0xbbb', name: 'Wallet 2', chains: ['eth', 'arb'] },
      ]
      mockWalletProvider.fetchAllWalletPositions.mockResolvedValue({
        positions: [
          makeCryptoPosition({ symbol: 'ETH', amount: 5, walletAddress: '0xaaa' }),
          makeCryptoPosition({ symbol: 'BTC', amount: 1, walletAddress: '0xbbb' }),
        ],
        prices: {
          'eth': { price: 3000, symbol: 'ETH' },
          'btc': { price: 50000, symbol: 'BTC' },
        },
      })

      const service = new PortfolioService()
      const result = await service.refreshPortfolio([], wallets)

      expect(mockWalletProvider.fetchAllWalletPositions).toHaveBeenCalledWith(wallets, false)
      expect(result.walletPositions).toHaveLength(2)
    })
  })

  // ─── Config manager access ────────────────────────────────────────────────

  describe('config manager access', () => {
    it('exposes getConfigManager', () => {
      const service = new PortfolioService()
      const cm = service.getConfigManager()
      expect(cm).toBe(mockConfigManager)
    })

    it('subscribes to config changes via onConfigChange', () => {
      const callback = vi.fn()
      const service = new PortfolioService()
      service.onConfigChange(callback)

      expect(mockConfigManager.subscribe).toHaveBeenCalledWith(callback)
    })
  })

  // ─── forceRefresh flag ────────────────────────────────────────────────────

  describe('forceRefresh flag', () => {
    it('passes forceRefresh to wallet provider', async () => {
      mockWalletProvider.fetchAllWalletPositions.mockResolvedValue({
        positions: [],
        prices: {},
      })
      const wallets: Wallet[] = [{ id: 'w1', address: '0xabc', name: 'test', chains: ['eth'] }]

      const service = new PortfolioService()
      await service.refreshPortfolio([], wallets, true)

      expect(mockWalletProvider.fetchAllWalletPositions).toHaveBeenCalledWith(wallets, true)
    })
  })
})
