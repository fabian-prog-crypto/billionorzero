import { DebankApiClient } from './debank-api';
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

describe('DebankApiClient', () => {
  let client: DebankApiClient;

  beforeEach(() => {
    client = new DebankApiClient('test-debank-key');
    mockFetch.mockReset();
  });

  describe('getWalletTokens', () => {
    it('fetches token list successfully', async () => {
      const tokens = [
        { id: 'eth', chain: 'eth', name: 'Ethereum', symbol: 'ETH', decimals: 18, price: 3000, amount: 1.5, raw_amount: 1500000000000000000 },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(tokens));

      const result = await client.getWalletTokens('0x123');
      expect(result).toEqual(tokens);
      expect(result).toHaveLength(1);
    });

    it('throws ApiError on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: 'Forbidden' }),
      } as unknown as Response);

      try {
        await client.getWalletTokens('0x123');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(403);
        expect((error as ApiError).service).toBe('debank');
      }
    });

    it('throws ApiError when API key is missing', async () => {
      const noKeyClient = new DebankApiClient();

      try {
        await noKeyClient.getWalletTokens('0x123');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(401);
        expect((error as ApiError).service).toBe('debank');
      }
    });

    it('throws ApiError on non-array response', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'unexpected' }));

      try {
        await client.getWalletTokens('0x123');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(500);
      }
    });
  });

  describe('getWalletProtocols', () => {
    it('fetches protocol list successfully', async () => {
      const protocols = [
        {
          id: 'aave', chain: 'eth', name: 'Aave',
          portfolio_item_list: [{
            name: 'Lending',
            stats: { asset_usd_value: 1000, net_usd_value: 1000 },
            detail: {},
          }],
        },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(protocols));

      const result = await client.getWalletProtocols('0x123');
      expect(result).toEqual(protocols);
      expect(result).toHaveLength(1);
    });
  });
});
