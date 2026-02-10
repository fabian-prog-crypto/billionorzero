import { HeliusApiClient } from './helius-api';
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

describe('HeliusApiClient', () => {
  let client: HeliusApiClient;

  beforeEach(() => {
    client = new HeliusApiClient('test-helius-key');
    mockFetch.mockReset();
  });

  describe('getBalances', () => {
    it('returns parsed balance response on success', async () => {
      const balanceData = {
        tokens: [
          { mint: 'So11...', amount: 1000000, decimals: 9, tokenAccount: 'abc123' },
        ],
        nativeBalance: { lamports: 5000000000, price_per_sol: 150, total_price: 750 },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(balanceData));

      const result = await client.getBalances('SomeWalletAddress');

      expect(result).toEqual(balanceData);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('SomeWalletAddress');
      expect(calledUrl).toContain('api-key=test-helius-key');
    });

    it('throws ApiError when API key is missing', async () => {
      const noKeyClient = new HeliusApiClient();

      try {
        await noKeyClient.getBalances('SomeWalletAddress');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(401);
        expect((error as ApiError).service).toBe('helius');
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws ApiError on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(textResponse('Unauthorized', 401));

      try {
        await client.getBalances('SomeWalletAddress');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(401);
        expect((error as ApiError).service).toBe('helius');
        expect((error as ApiError).message).toContain('Unauthorized');
      }
    });

    it('throws on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(client.getBalances('SomeWalletAddress')).rejects.toThrow('Network failure');
    });
  });

  describe('getTokensWithPrices', () => {
    it('returns enriched token data on success', async () => {
      const tokenData = {
        tokens: [
          {
            mint: 'TokenMint1',
            amount: 500,
            decimals: 6,
            tokenAccount: 'ta1',
            name: 'USDC',
            symbol: 'USDC',
            pricePerToken: 1.0,
            valueUsd: 500,
          },
        ],
        nativeBalance: { lamports: 1000000000, price_per_sol: 150, total_price: 150 },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(tokenData));

      const result = await client.getTokensWithPrices('SomeWalletAddress');

      expect(result).toEqual(tokenData);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].symbol).toBe('USDC');
    });

    it('throws ApiError when API key is missing', async () => {
      const noKeyClient = new HeliusApiClient();

      try {
        await noKeyClient.getTokensWithPrices('SomeWalletAddress');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(401);
        expect((error as ApiError).service).toBe('helius');
      }
    });
  });

  describe('setApiKey', () => {
    it('allows setting API key after construction', async () => {
      const noKeyClient = new HeliusApiClient();
      noKeyClient.setApiKey('new-key');

      const balanceData = {
        tokens: [],
        nativeBalance: { lamports: 0, price_per_sol: 150, total_price: 0 },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(balanceData));

      const result = await noKeyClient.getBalances('SomeWalletAddress');
      expect(result).toEqual(balanceData);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('api-key=new-key');
    });
  });
});
