import { BirdeyeApiClient } from './birdeye-api';
import { ApiError } from './types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function textResponse(text: string, status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

describe('BirdeyeApiClient', () => {
  let client: BirdeyeApiClient;

  beforeEach(() => {
    client = new BirdeyeApiClient('test-birdeye-key');
    mockFetch.mockReset();
  });

  describe('getWalletTokens', () => {
    it('returns parsed token list on success', async () => {
      const walletResponse = {
        success: true,
        data: {
          wallet: 'SomeWalletAddress',
          totalUsd: 1500,
          items: [
            {
              address: 'So11...',
              decimals: 9,
              balance: 5000000000,
              uiAmount: 5,
              chainId: 'solana',
              name: 'Solana',
              symbol: 'SOL',
              logoURI: 'https://example.com/sol.png',
              priceUsd: 150,
              valueUsd: 750,
            },
          ],
        },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(walletResponse));

      const result = await client.getWalletTokens('SomeWalletAddress');

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('SOL');
      expect(result[0].valueUsd).toBe(750);

      // Verify correct headers
      const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
      expect(calledUrl).toContain('wallet=SomeWalletAddress');
      expect(calledOptions.headers['X-API-KEY']).toBe('test-birdeye-key');
      expect(calledOptions.headers['x-chain']).toBe('solana');
    });

    it('throws ApiError when API key is missing', async () => {
      const noKeyClient = new BirdeyeApiClient();

      try {
        await noKeyClient.getWalletTokens('SomeWalletAddress');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(401);
        expect((error as ApiError).service).toBe('birdeye');
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws ApiError on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(textResponse('Rate limited', 429));

      try {
        await client.getWalletTokens('SomeWalletAddress');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(429);
        expect((error as ApiError).service).toBe('birdeye');
      }
    });

    it('throws ApiError when response success is false', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        success: false,
        data: { wallet: '', totalUsd: 0, items: [] },
      }));

      try {
        await client.getWalletTokens('SomeWalletAddress');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(500);
        expect((error as ApiError).service).toBe('birdeye');
      }
    });

    it('returns empty array when items is missing', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        success: true,
        data: { wallet: 'SomeWalletAddress', totalUsd: 0 },
      }));

      const result = await client.getWalletTokens('SomeWalletAddress');
      expect(result).toEqual([]);
    });
  });

  describe('getTokenPrice', () => {
    it('returns token price on success', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { value: 150.5 },
      }));

      const result = await client.getTokenPrice('So11...');

      expect(result).toBe(150.5);
      const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
      expect(calledUrl).toContain('address=So11...');
      expect(calledOptions.headers['X-API-KEY']).toBe('test-birdeye-key');
    });

    it('returns null on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(textResponse('Not found', 404));

      const result = await client.getTokenPrice('unknown-token');
      expect(result).toBeNull();
    });

    it('returns null when data.value is missing', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }));

      const result = await client.getTokenPrice('some-token');
      expect(result).toBeNull();
    });

    it('throws ApiError when API key is missing', async () => {
      const noKeyClient = new BirdeyeApiClient();

      try {
        await noKeyClient.getTokenPrice('some-token');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(401);
        expect((error as ApiError).service).toBe('birdeye');
      }
    });
  });
});
