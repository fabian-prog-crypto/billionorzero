import { CryptoPriceService } from './crypto-price-service';
import type { CoinGeckoPriceResponse } from '../api/types';
import type { Position } from '@/types';

// Mock the CoinGecko API module
vi.mock('../api/coingecko-api', () => {
  const mockClient = {
    getPrices: vi.fn(),
    searchCoin: vi.fn(),
    getCoinList: vi.fn(),
  };
  return {
    getCoinGeckoApiClient: () => mockClient,
    CoinGeckoApiClient: vi.fn(),
    __mockClient: mockClient,
  };
});

// Mock demo data
vi.mock('./demo-data', () => ({
  DEMO_CRYPTO_PRICES: {
    bitcoin: { price: 95000, change24h: 2.5 },
    ethereum: { price: 3200, change24h: 1.8 },
    solana: { price: 180, change24h: 4.2 },
  },
}));

async function getMockClient() {
  const mod = await import('../api/coingecko-api');
  return (mod as unknown as {
    __mockClient: {
      getPrices: ReturnType<typeof vi.fn>;
      searchCoin: ReturnType<typeof vi.fn>;
    };
  }).__mockClient;
}

describe('CryptoPriceService', () => {
  let service: CryptoPriceService;
  let mockClient: Awaited<ReturnType<typeof getMockClient>>;

  beforeEach(async () => {
    service = new CryptoPriceService();
    mockClient = await getMockClient();
    mockClient.getPrices.mockReset();
    mockClient.searchCoin.mockReset();
  });

  describe('getCoinId', () => {
    it('maps known symbols to CoinGecko IDs', () => {
      expect(service.getCoinId('btc')).toBe('bitcoin');
      expect(service.getCoinId('eth')).toBe('ethereum');
      expect(service.getCoinId('sol')).toBe('solana');
    });

    it('normalizes symbol to lowercase', () => {
      expect(service.getCoinId('BTC')).toBe('bitcoin');
      expect(service.getCoinId('ETH')).toBe('ethereum');
    });

    it('returns lowercased symbol as-is for unknown tokens', () => {
      expect(service.getCoinId('UNKNOWNTOKEN')).toBe('unknowntoken');
    });

    it('trims whitespace from symbol', () => {
      expect(service.getCoinId(' btc ')).toBe('bitcoin');
    });
  });

  describe('hasKnownMapping', () => {
    it('returns true for known symbols', () => {
      expect(service.hasKnownMapping('btc')).toBe(true);
      expect(service.hasKnownMapping('ETH')).toBe(true);
      expect(service.hasKnownMapping('sol')).toBe(true);
    });

    it('returns false for unknown symbols', () => {
      expect(service.hasKnownMapping('UNKNOWN')).toBe(false);
      expect(service.hasKnownMapping('xyz123')).toBe(false);
    });
  });

  describe('getPrices', () => {
    it('returns empty object for empty coinIds array', async () => {
      const result = await service.getPrices([]);
      expect(result).toEqual({});
      expect(mockClient.getPrices).not.toHaveBeenCalled();
    });

    it('fetches prices from CoinGecko and parses response', async () => {
      const apiResponse: CoinGeckoPriceResponse = {
        bitcoin: { usd: 96000, usd_24h_change: 3.0 },
        ethereum: { usd: 3300, usd_24h_change: -1.5 },
      };
      mockClient.getPrices.mockResolvedValue(apiResponse);

      const result = await service.getPrices(['bitcoin', 'ethereum']);

      expect(mockClient.getPrices).toHaveBeenCalledWith(['bitcoin', 'ethereum']);
      expect(result.bitcoin.price).toBe(96000);
      expect(result.bitcoin.changePercent24h).toBe(3.0);
      expect(result.bitcoin.change24h).toBeCloseTo(96000 * 3.0 / 100);
      expect(result.ethereum.price).toBe(3300);
      expect(result.ethereum.changePercent24h).toBe(-1.5);
    });

    it('handles missing usd_24h_change by defaulting to 0', async () => {
      const apiResponse: CoinGeckoPriceResponse = {
        bitcoin: { usd: 96000 },
      };
      mockClient.getPrices.mockResolvedValue(apiResponse);

      const result = await service.getPrices(['bitcoin']);

      expect(result.bitcoin.changePercent24h).toBe(0);
      expect(result.bitcoin.change24h).toBe(0);
    });

    it('returns cached prices on subsequent calls within TTL', async () => {
      const apiResponse: CoinGeckoPriceResponse = {
        bitcoin: { usd: 96000, usd_24h_change: 3.0 },
      };
      mockClient.getPrices.mockResolvedValue(apiResponse);

      await service.getPrices(['bitcoin']);
      const result2 = await service.getPrices(['bitcoin']);

      // Should only call API once, second call uses cache
      expect(mockClient.getPrices).toHaveBeenCalledTimes(1);
      expect(result2.bitcoin.price).toBe(96000);
    });

    it('re-fetches after cache expires', async () => {
      const apiResponse1: CoinGeckoPriceResponse = {
        bitcoin: { usd: 96000, usd_24h_change: 3.0 },
      };
      const apiResponse2: CoinGeckoPriceResponse = {
        bitcoin: { usd: 97000, usd_24h_change: 4.0 },
      };
      mockClient.getPrices.mockResolvedValueOnce(apiResponse1).mockResolvedValueOnce(apiResponse2);

      await service.getPrices(['bitcoin']);

      // Advance time beyond 1-minute TTL
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000);

      const result = await service.getPrices(['bitcoin']);

      expect(mockClient.getPrices).toHaveBeenCalledTimes(2);
      expect(result.bitcoin.price).toBe(97000);
    });

    it('falls back to demo prices on API error', async () => {
      mockClient.getPrices.mockRejectedValue(new Error('Network error'));

      const result = await service.getPrices(['bitcoin', 'ethereum']);

      expect(result.bitcoin.price).toBe(95000);
      expect(result.ethereum.price).toBe(3200);
    });

    it('returns demo prices when useDemoData is configured', async () => {
      const demoService = new CryptoPriceService({ useDemoData: true });

      const result = await demoService.getPrices(['bitcoin', 'solana']);

      expect(mockClient.getPrices).not.toHaveBeenCalled();
      expect(result.bitcoin.price).toBe(95000);
      expect(result.solana.price).toBe(180);
    });

    it('only fetches uncached IDs when some are cached', async () => {
      const apiResponse1: CoinGeckoPriceResponse = {
        bitcoin: { usd: 96000, usd_24h_change: 3.0 },
      };
      const apiResponse2: CoinGeckoPriceResponse = {
        ethereum: { usd: 3300, usd_24h_change: -1.0 },
      };
      mockClient.getPrices.mockResolvedValueOnce(apiResponse1).mockResolvedValueOnce(apiResponse2);

      // First call caches bitcoin
      await service.getPrices(['bitcoin']);
      // Second call should only fetch ethereum
      const result = await service.getPrices(['bitcoin', 'ethereum']);

      expect(mockClient.getPrices).toHaveBeenCalledTimes(2);
      expect(mockClient.getPrices).toHaveBeenLastCalledWith(['ethereum']);
      expect(result.bitcoin.price).toBe(96000);
      expect(result.ethereum.price).toBe(3300);
    });
  });

  describe('getPricesForPositions', () => {
    it('returns empty prices for empty positions array', async () => {
      const result = await service.getPricesForPositions([]);
      expect(result).toEqual({ prices: {}, isDemo: false });
    });

    it('filters to only crypto positions', async () => {
      const apiResponse: CoinGeckoPriceResponse = {
        bitcoin: { usd: 96000, usd_24h_change: 3.0 },
      };
      mockClient.getPrices.mockResolvedValue(apiResponse);

      const positions = [
        { id: '1', type: 'crypto', symbol: 'BTC', name: 'Bitcoin', amount: 1, addedAt: '', updatedAt: '' },
        { id: '2', type: 'stock', symbol: 'AAPL', name: 'Apple', amount: 10, addedAt: '', updatedAt: '' },
      ] as unknown as Position[];

      const result = await service.getPricesForPositions(positions);

      expect(mockClient.getPrices).toHaveBeenCalledWith(['bitcoin']);
      expect(result.prices.bitcoin).toBeDefined();
    });

    it('deduplicates coin IDs from multiple positions with same symbol', async () => {
      const apiResponse: CoinGeckoPriceResponse = {
        bitcoin: { usd: 96000, usd_24h_change: 3.0 },
      };
      mockClient.getPrices.mockResolvedValue(apiResponse);

      const positions = [
        { id: '1', type: 'crypto', symbol: 'BTC', name: 'Bitcoin', amount: 1, addedAt: '', updatedAt: '' },
        { id: '2', type: 'crypto', symbol: 'BTC', name: 'Bitcoin (wallet 2)', amount: 0.5, addedAt: '', updatedAt: '' },
      ] as unknown as Position[];

      const result = await service.getPricesForPositions(positions);

      expect(mockClient.getPrices).toHaveBeenCalledWith(['bitcoin']);
      expect(Object.keys(result.prices)).toHaveLength(1);
    });

    it('sets isDemo flag when useDemoData is configured', async () => {
      const demoService = new CryptoPriceService({ useDemoData: true });

      const positions = [
        { id: '1', type: 'crypto', symbol: 'BTC', name: 'Bitcoin', amount: 1, addedAt: '', updatedAt: '' },
      ] as unknown as Position[];

      const result = await demoService.getPricesForPositions(positions);

      expect(result.isDemo).toBe(true);
    });
  });

  describe('clearCache', () => {
    it('clears cached prices so next call re-fetches', async () => {
      const apiResponse: CoinGeckoPriceResponse = {
        bitcoin: { usd: 96000, usd_24h_change: 3.0 },
      };
      mockClient.getPrices.mockResolvedValue(apiResponse);

      await service.getPrices(['bitcoin']);
      service.clearCache();
      await service.getPrices(['bitcoin']);

      expect(mockClient.getPrices).toHaveBeenCalledTimes(2);
    });
  });
});
