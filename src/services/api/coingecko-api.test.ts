import { CoinGeckoApiClient } from './coingecko-api';
import { ApiError } from './types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('CoinGeckoApiClient', () => {
  let client: CoinGeckoApiClient;

  beforeEach(() => {
    client = new CoinGeckoApiClient();
    mockFetch.mockReset();
  });

  describe('getPrices', () => {
    it('returns empty object for empty coinIds', async () => {
      const result = await client.getPrices([]);
      expect(result).toEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns parsed price data on success', async () => {
      const priceData = {
        bitcoin: { usd: 50000, usd_24h_change: 2.5 },
        ethereum: { usd: 3000, usd_24h_change: -1.2 },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(priceData));

      const result = await client.getPrices(['bitcoin', 'ethereum']);

      expect(result).toEqual(priceData);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('ids=bitcoin,ethereum');
      expect(calledUrl).toContain('vs_currencies=usd');
      expect(calledUrl).toContain('include_24hr_change=true');
    });

    it('throws ApiError with status 429 on rate limit', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 429));

      try {
        await client.getPrices(['bitcoin']);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(429);
        expect((error as ApiError).service).toBe('coingecko');
      }
    });

    it('throws ApiError on HTTP 500', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

      try {
        await client.getPrices(['bitcoin']);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(500);
        expect((error as ApiError).service).toBe('coingecko');
      }
    });

    it('throws on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(client.getPrices(['bitcoin'])).rejects.toThrow('Network failure');
    });

    it('respects rate limiting between requests', async () => {
      const priceData = { bitcoin: { usd: 50000 } };
      mockFetch.mockResolvedValue(jsonResponse(priceData));

      const start = Date.now();
      await client.getPrices(['bitcoin']);
      await client.getPrices(['ethereum']);
      const elapsed = Date.now() - start;

      // The second call should have waited ~1000ms due to rate limiting
      // Allow some tolerance for timer imprecision
      expect(elapsed).toBeGreaterThanOrEqual(900);
    });
  });

  describe('searchCoin', () => {
    it('returns coin search results', async () => {
      const searchData = {
        coins: [
          { id: 'bitcoin', name: 'Bitcoin', symbol: 'btc', market_cap_rank: 1 },
        ],
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(searchData));

      const result = await client.searchCoin('bitcoin');
      expect(result).toEqual(searchData.coins);
    });

    it('returns empty array when coins field is missing', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));

      const result = await client.searchCoin('nonexistent');
      expect(result).toEqual([]);
    });
  });
});
