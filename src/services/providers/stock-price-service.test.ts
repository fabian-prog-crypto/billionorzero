import { StockPriceService, searchStocks } from './stock-price-service';
import type { StockQuoteResponse } from '../api/types';
import type { Position } from '@/types';

// Mock the stock API module
vi.mock('../api/stock-api', () => {
  const mockClient = {
    getQuote: vi.fn(),
    getMultipleQuotes: vi.fn(),
    setApiKey: vi.fn(),
  };
  return {
    getStockApiClient: () => mockClient,
    StockApiClient: vi.fn(),
    __mockClient: mockClient,
  };
});

// Mock demo data
vi.mock('./demo-data', () => ({
  DEMO_STOCK_PRICES: {
    aapl: { price: 178.50, change: 2.35, changePercent: 1.33 },
    googl: { price: 141.80, change: -0.92, changePercent: -0.64 },
    msft: { price: 378.90, change: 4.20, changePercent: 1.12 },
  },
}));

async function getMockClient() {
  const mod = await import('../api/stock-api');
  return (mod as unknown as {
    __mockClient: {
      getQuote: ReturnType<typeof vi.fn>;
      getMultipleQuotes: ReturnType<typeof vi.fn>;
      setApiKey: ReturnType<typeof vi.fn>;
    };
  }).__mockClient;
}

describe('StockPriceService', () => {
  let service: StockPriceService;
  let mockClient: Awaited<ReturnType<typeof getMockClient>>;

  beforeEach(async () => {
    service = new StockPriceService({ apiKey: 'test-key' });
    mockClient = await getMockClient();
    mockClient.getQuote.mockReset();
    mockClient.getMultipleQuotes.mockReset();
  });

  describe('getPrices', () => {
    it('returns empty object for empty symbols array', async () => {
      const result = await service.getPrices([]);
      expect(result).toEqual({});
      expect(mockClient.getMultipleQuotes).not.toHaveBeenCalled();
    });

    it('fetches prices from Finnhub and parses response', async () => {
      const quotesMap = new Map<string, StockQuoteResponse>();
      quotesMap.set('aapl', { c: 180, d: 2.5, dp: 1.4, h: 182, l: 177, o: 178, pc: 177.5, t: 0 });
      quotesMap.set('googl', { c: 145, d: -1.0, dp: -0.68, h: 146, l: 143, o: 144, pc: 146, t: 0 });
      mockClient.getMultipleQuotes.mockResolvedValue(quotesMap);

      const result = await service.getPrices(['AAPL', 'GOOGL']);

      expect(mockClient.getMultipleQuotes).toHaveBeenCalledWith(['AAPL', 'GOOGL']);
      expect(result.aapl.price).toBe(180);
      expect(result.aapl.change24h).toBe(2.5);
      expect(result.aapl.changePercent24h).toBe(1.4);
      expect(result.googl.price).toBe(145);
    });

    it('returns cached prices on subsequent calls within TTL', async () => {
      const quotesMap = new Map<string, StockQuoteResponse>();
      quotesMap.set('aapl', { c: 180, d: 2.5, dp: 1.4, h: 182, l: 177, o: 178, pc: 177.5, t: 0 });
      mockClient.getMultipleQuotes.mockResolvedValue(quotesMap);

      await service.getPrices(['AAPL']);
      const result2 = await service.getPrices(['AAPL']);

      expect(mockClient.getMultipleQuotes).toHaveBeenCalledTimes(1);
      expect(result2.aapl.price).toBe(180);
    });

    it('re-fetches after cache expires', async () => {
      const quotesMap1 = new Map<string, StockQuoteResponse>();
      quotesMap1.set('aapl', { c: 180, d: 2.5, dp: 1.4, h: 182, l: 177, o: 178, pc: 177.5, t: 0 });
      const quotesMap2 = new Map<string, StockQuoteResponse>();
      quotesMap2.set('aapl', { c: 185, d: 5.0, dp: 2.8, h: 186, l: 180, o: 181, pc: 180, t: 0 });
      mockClient.getMultipleQuotes.mockResolvedValueOnce(quotesMap1).mockResolvedValueOnce(quotesMap2);

      await service.getPrices(['AAPL']);

      // Advance time beyond 1-minute TTL
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000);

      const result = await service.getPrices(['AAPL']);

      expect(mockClient.getMultipleQuotes).toHaveBeenCalledTimes(2);
      expect(result.aapl.price).toBe(185);
    });

    it('returns demo prices when no API key is configured', async () => {
      const noKeyService = new StockPriceService();

      const result = await noKeyService.getPrices(['AAPL', 'GOOGL']);

      expect(mockClient.getMultipleQuotes).not.toHaveBeenCalled();
      expect(result.aapl.price).toBe(178.50);
      expect(result.googl.price).toBe(141.80);
    });

    it('returns demo prices when useDemoData is configured', async () => {
      const demoService = new StockPriceService({ useDemoData: true, apiKey: 'test-key' });

      const result = await demoService.getPrices(['AAPL']);

      expect(mockClient.getMultipleQuotes).not.toHaveBeenCalled();
      expect(result.aapl.price).toBe(178.50);
    });

    it('falls back to demo prices on API error', async () => {
      mockClient.getMultipleQuotes.mockRejectedValue(new Error('Network error'));

      const result = await service.getPrices(['AAPL', 'MSFT']);

      expect(result.aapl.price).toBe(178.50);
      expect(result.msft.price).toBe(378.90);
    });

    it('only fetches uncached symbols when some are cached', async () => {
      const quotesMap1 = new Map<string, StockQuoteResponse>();
      quotesMap1.set('aapl', { c: 180, d: 2.5, dp: 1.4, h: 182, l: 177, o: 178, pc: 177.5, t: 0 });
      const quotesMap2 = new Map<string, StockQuoteResponse>();
      quotesMap2.set('googl', { c: 145, d: -1.0, dp: -0.68, h: 146, l: 143, o: 144, pc: 146, t: 0 });
      mockClient.getMultipleQuotes.mockResolvedValueOnce(quotesMap1).mockResolvedValueOnce(quotesMap2);

      // First call caches AAPL
      await service.getPrices(['AAPL']);
      // Second call should only fetch GOOGL
      const result = await service.getPrices(['AAPL', 'GOOGL']);

      expect(mockClient.getMultipleQuotes).toHaveBeenCalledTimes(2);
      expect(mockClient.getMultipleQuotes).toHaveBeenLastCalledWith(['GOOGL']);
      expect(result.aapl.price).toBe(180);
      expect(result.googl.price).toBe(145);
    });
  });

  describe('getPricesForPositions', () => {
    it('returns empty prices for empty positions array', async () => {
      const result = await service.getPricesForPositions([]);
      expect(result).toEqual({ prices: {}, isDemo: false });
    });

    it('filters to only stock positions and uppercases symbols', async () => {
      const quotesMap = new Map<string, StockQuoteResponse>();
      quotesMap.set('aapl', { c: 180, d: 2.5, dp: 1.4, h: 182, l: 177, o: 178, pc: 177.5, t: 0 });
      mockClient.getMultipleQuotes.mockResolvedValue(quotesMap);

      const positions = [
        { id: '1', type: 'stock', symbol: 'aapl', name: 'Apple', amount: 10, addedAt: '', updatedAt: '' },
        { id: '2', type: 'crypto', symbol: 'BTC', name: 'Bitcoin', amount: 1, addedAt: '', updatedAt: '' },
      ] as unknown as Position[];

      const result = await service.getPricesForPositions(positions);

      expect(mockClient.getMultipleQuotes).toHaveBeenCalledWith(['AAPL']);
      expect(result.prices.aapl).toBeDefined();
    });

    it('sets isDemo when no API key is configured', async () => {
      const noKeyService = new StockPriceService();

      const positions = [
        { id: '1', type: 'stock', symbol: 'AAPL', name: 'Apple', amount: 10, addedAt: '', updatedAt: '' },
      ] as unknown as Position[];

      const result = await noKeyService.getPricesForPositions(positions);

      expect(result.isDemo).toBe(true);
    });

    it('deduplicates symbols from multiple positions', async () => {
      const quotesMap = new Map<string, StockQuoteResponse>();
      quotesMap.set('aapl', { c: 180, d: 2.5, dp: 1.4, h: 182, l: 177, o: 178, pc: 177.5, t: 0 });
      mockClient.getMultipleQuotes.mockResolvedValue(quotesMap);

      const positions = [
        { id: '1', type: 'stock', symbol: 'AAPL', name: 'Apple', amount: 10, addedAt: '', updatedAt: '' },
        { id: '2', type: 'stock', symbol: 'AAPL', name: 'Apple (second)', amount: 5, addedAt: '', updatedAt: '' },
      ] as unknown as Position[];

      const result = await service.getPricesForPositions(positions);

      expect(mockClient.getMultipleQuotes).toHaveBeenCalledWith(['AAPL']);
      expect(Object.keys(result.prices)).toHaveLength(1);
    });
  });

  describe('clearCache', () => {
    it('clears cached prices so next call re-fetches', async () => {
      const quotesMap = new Map<string, StockQuoteResponse>();
      quotesMap.set('aapl', { c: 180, d: 2.5, dp: 1.4, h: 182, l: 177, o: 178, pc: 177.5, t: 0 });
      mockClient.getMultipleQuotes.mockResolvedValue(quotesMap);

      await service.getPrices(['AAPL']);
      service.clearCache();
      await service.getPrices(['AAPL']);

      expect(mockClient.getMultipleQuotes).toHaveBeenCalledTimes(2);
    });
  });
});

describe('searchStocks', () => {
  it('returns matching stocks by symbol', () => {
    const results = searchStocks('AAPL');
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe('AAPL');
  });

  it('returns matching stocks by description', () => {
    const results = searchStocks('nvidia');
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe('NVDA');
  });

  it('returns empty array for no match', () => {
    const results = searchStocks('xyz123nonexistent');
    expect(results).toHaveLength(0);
  });

  it('is case-insensitive', () => {
    const results = searchStocks('apple');
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe('AAPL');
  });
});
