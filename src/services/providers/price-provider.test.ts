import { PriceProvider } from './price-provider';
import type { PriceData, Position } from '@/types';

// Mock the crypto-price-service module
const mockCryptoService = {
  getCoinId: vi.fn(),
  hasKnownMapping: vi.fn(),
  getPrices: vi.fn(),
  getPricesForPositions: vi.fn(),
  clearCache: vi.fn(),
  updateConfig: vi.fn(),
};

vi.mock('./crypto-price-service', () => ({
  getCryptoPriceService: () => mockCryptoService,
  CryptoPriceService: vi.fn(),
  searchCoins: vi.fn(),
  getTopCoins: vi.fn(),
}));

// Mock the stock-price-service module
const mockStockService = {
  getPrices: vi.fn(),
  getPricesForPositions: vi.fn(),
  clearCache: vi.fn(),
  updateConfig: vi.fn(),
};

vi.mock('./stock-price-service', () => ({
  getStockPriceService: () => mockStockService,
  StockPriceService: vi.fn(),
  searchStocks: vi.fn(),
}));

describe('PriceProvider', () => {
  let provider: PriceProvider;

  beforeEach(() => {
    provider = new PriceProvider();
    vi.clearAllMocks();
  });

  describe('getCoinId', () => {
    it('delegates to crypto service', () => {
      mockCryptoService.getCoinId.mockReturnValue('bitcoin');

      const result = provider.getCoinId('btc');

      expect(mockCryptoService.getCoinId).toHaveBeenCalledWith('btc');
      expect(result).toBe('bitcoin');
    });
  });

  describe('hasKnownCryptoMapping', () => {
    it('delegates to crypto service hasKnownMapping', () => {
      mockCryptoService.hasKnownMapping.mockReturnValue(true);

      const result = provider.hasKnownCryptoMapping('btc');

      expect(mockCryptoService.hasKnownMapping).toHaveBeenCalledWith('btc');
      expect(result).toBe(true);
    });

    it('returns false for unknown symbols', () => {
      mockCryptoService.hasKnownMapping.mockReturnValue(false);

      const result = provider.hasKnownCryptoMapping('UNKNOWN');

      expect(result).toBe(false);
    });
  });

  describe('getCryptoPrices', () => {
    it('delegates to crypto service getPrices', async () => {
      const mockPrices: Record<string, PriceData> = {
        bitcoin: { symbol: 'bitcoin', price: 96000, change24h: 2880, changePercent24h: 3.0, lastUpdated: '' },
      };
      mockCryptoService.getPrices.mockResolvedValue(mockPrices);

      const result = await provider.getCryptoPrices(['bitcoin']);

      expect(mockCryptoService.getPrices).toHaveBeenCalledWith(['bitcoin']);
      expect(result.bitcoin.price).toBe(96000);
    });
  });

  describe('getStockPrices', () => {
    it('delegates to stock service getPrices', async () => {
      const mockPrices: Record<string, PriceData> = {
        aapl: { symbol: 'aapl', price: 180, change24h: 2.5, changePercent24h: 1.4, lastUpdated: '' },
      };
      mockStockService.getPrices.mockResolvedValue(mockPrices);

      const result = await provider.getStockPrices(['AAPL']);

      expect(mockStockService.getPrices).toHaveBeenCalledWith(['AAPL']);
      expect(result.aapl.price).toBe(180);
    });
  });

  describe('getPricesForPositions', () => {
    it('separates crypto and stock positions and fetches in parallel', async () => {
      const cryptoResult = {
        prices: { bitcoin: { symbol: 'bitcoin', price: 96000, change24h: 2880, changePercent24h: 3.0, lastUpdated: '' } },
        isDemo: false,
      };
      const stockResult = {
        prices: { aapl: { symbol: 'aapl', price: 180, change24h: 2.5, changePercent24h: 1.4, lastUpdated: '' } },
        isDemo: false,
      };

      mockCryptoService.getPricesForPositions.mockResolvedValue(cryptoResult);
      mockStockService.getPricesForPositions.mockResolvedValue(stockResult);

      const positions = [
        { id: '1', type: 'crypto', symbol: 'BTC', name: 'Bitcoin', amount: 1, addedAt: '', updatedAt: '' },
        { id: '2', type: 'stock', symbol: 'AAPL', name: 'Apple', amount: 10, addedAt: '', updatedAt: '' },
      ] as unknown as Position[];

      const result = await provider.getPricesForPositions(positions);

      // Crypto service receives only crypto positions
      expect(mockCryptoService.getPricesForPositions).toHaveBeenCalledWith(
        [expect.objectContaining({ type: 'crypto', symbol: 'BTC' })]
      );
      // Stock service receives only stock positions
      expect(mockStockService.getPricesForPositions).toHaveBeenCalledWith(
        [expect.objectContaining({ type: 'stock', symbol: 'AAPL' })]
      );

      expect(result.prices.bitcoin.price).toBe(96000);
      expect(result.prices.aapl.price).toBe(180);
      expect(result.isDemo).toBe(false);
    });

    it('sets isDemo to true if either service returns demo data', async () => {
      mockCryptoService.getPricesForPositions.mockResolvedValue({ prices: {}, isDemo: true });
      mockStockService.getPricesForPositions.mockResolvedValue({ prices: {}, isDemo: false });

      const result = await provider.getPricesForPositions([]);

      expect(result.isDemo).toBe(true);
    });

    it('merges prices from both services', async () => {
      mockCryptoService.getPricesForPositions.mockResolvedValue({
        prices: { bitcoin: { symbol: 'bitcoin', price: 96000, change24h: 0, changePercent24h: 0, lastUpdated: '' } },
        isDemo: false,
      });
      mockStockService.getPricesForPositions.mockResolvedValue({
        prices: { aapl: { symbol: 'aapl', price: 180, change24h: 0, changePercent24h: 0, lastUpdated: '' } },
        isDemo: false,
      });

      const result = await provider.getPricesForPositions([]);

      expect(Object.keys(result.prices)).toEqual(['bitcoin', 'aapl']);
    });
  });

  describe('clearCache', () => {
    it('clears both crypto and stock caches', () => {
      provider.clearCache();

      expect(mockCryptoService.clearCache).toHaveBeenCalled();
      expect(mockStockService.clearCache).toHaveBeenCalled();
    });
  });

  describe('updateConfig', () => {
    it('propagates config to both services', () => {
      provider.updateConfig({ stockApiKey: 'new-key', useDemoData: true });

      expect(mockCryptoService.updateConfig).toHaveBeenCalledWith({ useDemoData: true });
      expect(mockStockService.updateConfig).toHaveBeenCalledWith({
        apiKey: 'new-key',
        useDemoData: true,
      });
    });
  });
});
