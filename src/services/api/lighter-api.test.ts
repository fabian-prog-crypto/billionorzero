import { LighterApiClient } from './lighter-api';
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

describe('LighterApiClient', () => {
  let client: LighterApiClient;

  beforeEach(() => {
    // Stub window.location.origin for URL construction in the client
    vi.stubGlobal('window', { location: { origin: 'https://test.local' } });
    client = new LighterApiClient('/api/perps/lighter');
    mockFetch.mockReset();
  });

  describe('getAccountByIndex', () => {
    it('returns account on success', async () => {
      const account = {
        index: 42,
        l1_address: '0xWallet',
        collateral: '10000',
        available_balance: '5000',
        total_asset_value: '15000',
        positions: [
          {
            market_id: 1,
            symbol: 'ETH-USD',
            position: '1.5',
            sign: 1,
            avg_entry_price: '3000',
            position_value: '4500',
            unrealized_pnl: '150',
            realized_pnl: '0',
            liquidation_price: '2700',
            allocated_margin: '450',
            margin_mode: 'cross',
          },
        ],
        assets: [
          { symbol: 'USDC', asset_id: 0, balance: '5000', locked_balance: '0' },
        ],
      };
      mockFetch.mockResolvedValueOnce(jsonResponse({
        code: 200,
        total: 1,
        accounts: [account],
      }));

      const result = await client.getAccountByIndex(42);

      expect(result).toEqual(account);
      expect(result!.positions).toHaveLength(1);
      expect(result!.positions[0].symbol).toBe('ETH-USD');

      // Verify GET request with correct query params
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('endpoint=account');
      expect(calledUrl).toContain('by=index');
      expect(calledUrl).toContain('value=42');
    });

    it('returns null when no accounts found', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        code: 200,
        total: 0,
        accounts: [],
      }));

      const result = await client.getAccountByIndex(999);
      expect(result).toBeNull();
    });

    it('returns null on 404 error', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        code: 404,
        message: 'Account not found',
      }));

      // The code=404 triggers ApiError, but getAccountByIndex catches 404 and returns null
      const result = await client.getAccountByIndex(999);
      expect(result).toBeNull();
    });

    it('throws ApiError on HTTP error (non-200 status)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

      try {
        await client.getAccountByIndex(42);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(500);
        expect((error as ApiError).service).toBe('lighter');
      }
    });

    it('throws ApiError on HTTP 200 with error code in body (Lighter quirk)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        code: 21100,
        message: 'Invalid account',
      }));

      try {
        await client.getAccountByIndex(42);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(21100);
        expect((error as ApiError).service).toBe('lighter');
      }
    });
  });

  describe('getAccountByAddress', () => {
    it('returns account on success', async () => {
      const account = {
        index: 1,
        l1_address: '0xWallet',
        collateral: '5000',
        available_balance: '3000',
        total_asset_value: '5000',
        positions: [],
        assets: [],
      };
      mockFetch.mockResolvedValueOnce(jsonResponse({
        code: 200,
        total: 1,
        accounts: [account],
      }));

      const result = await client.getAccountByAddress('0xWallet');

      expect(result).toEqual(account);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('by=l1_address');
      expect(calledUrl).toContain('value=0xWallet');
    });

    it('returns null on ApiError (any status)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        code: 21100,
        message: 'Account not found',
      }));

      const result = await client.getAccountByAddress('0xUnknown');
      expect(result).toBeNull();
    });
  });

  describe('getAccountsByL1Address', () => {
    it('returns full accounts for all sub-accounts', async () => {
      // First call: getAccountsByL1Address
      mockFetch.mockResolvedValueOnce(jsonResponse({
        code: 200,
        l1_address: '0xWallet',
        sub_accounts: [
          { index: 1, l1_address: '0xWallet', collateral: '5000' },
          { index: 2, l1_address: '0xWallet', collateral: '3000' },
        ],
      }));
      // Second call: getAccountByIndex(1)
      mockFetch.mockResolvedValueOnce(jsonResponse({
        code: 200,
        total: 1,
        accounts: [{
          index: 1,
          l1_address: '0xWallet',
          collateral: '5000',
          available_balance: '3000',
          total_asset_value: '5000',
          positions: [],
          assets: [],
        }],
      }));
      // Third call: getAccountByIndex(2)
      mockFetch.mockResolvedValueOnce(jsonResponse({
        code: 200,
        total: 1,
        accounts: [{
          index: 2,
          l1_address: '0xWallet',
          collateral: '3000',
          available_balance: '2000',
          total_asset_value: '3000',
          positions: [],
          assets: [],
        }],
      }));

      const result = await client.getAccountsByL1Address('0xWallet');

      expect(result).toHaveLength(2);
      expect(result[0].index).toBe(1);
      expect(result[1].index).toBe(2);
    });

    it('returns empty array when no sub-accounts', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        code: 200,
        l1_address: '0xWallet',
        sub_accounts: [],
      }));

      const result = await client.getAccountsByL1Address('0xWallet');
      expect(result).toEqual([]);
    });

    it('returns empty array on ApiError', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        code: 21100,
        message: 'Address not found',
      }));

      const result = await client.getAccountsByL1Address('0xUnknown');
      expect(result).toEqual([]);
    });
  });

  describe('getAssetDetails', () => {
    it('returns asset details on success', async () => {
      const assets = [
        { asset_id: 0, symbol: 'USDC', decimals: 6, l1_address: '0x...', index_price: '1.0', margin_mode: 'cross' },
        { asset_id: 1, symbol: 'ETH', decimals: 18, l1_address: '0x...', index_price: '3000', margin_mode: 'cross' },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse({
        code: 200,
        asset_details: assets,
      }));

      const result = await client.getAssetDetails();

      expect(result).toHaveLength(2);
      expect(result[0].symbol).toBe('USDC');
      expect(result[1].symbol).toBe('ETH');
    });
  });

  describe('getMarkets', () => {
    it('returns market list on success', async () => {
      const markets = [
        { market_id: 1, symbol: 'ETH-USD', base_asset: 'ETH', quote_asset: 'USD', last_price: '3000', mark_price: '3001', index_price: '3000' },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse({
        code: 200,
        order_books: markets,
      }));

      const result = await client.getMarkets();

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('ETH-USD');
    });
  });

  describe('error wrapping', () => {
    it('wraps non-ApiError exceptions in ApiError', async () => {
      mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

      try {
        await client.getAssetDetails();
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(500);
        expect((error as ApiError).service).toBe('lighter');
        expect((error as ApiError).message).toContain('DNS resolution failed');
      }
    });
  });
});
