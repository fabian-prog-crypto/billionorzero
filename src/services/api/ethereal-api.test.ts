import { EtherealApiClient } from './ethereal-api';
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

describe('EtherealApiClient', () => {
  let client: EtherealApiClient;

  beforeEach(() => {
    mockFetch.mockReset();
    // Stub window.location.origin for URL construction in the client
    vi.stubGlobal('window', { location: { origin: 'https://test.local' } });
    client = new EtherealApiClient();
  });

  describe('getSubaccounts', () => {
    it('returns subaccounts on success', async () => {
      const subaccounts = [
        {
          id: 'sub-1',
          account: '0xWallet',
          name: 'Main',
          createdBlockNumber: '100',
          registeredBlockNumber: '100',
          createdAt: 1700000000,
        },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: subaccounts,
        hasNext: false,
      }));

      const result = await client.getSubaccounts('0xWallet');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sub-1');
      expect(result[0].account).toBe('0xWallet');

      // Verify request includes the sender param
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('sender=0xWallet');
    });

    it('returns empty array on 404', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));

      const result = await client.getSubaccounts('0xUnknown');
      expect(result).toEqual([]);
    });

    it('throws ApiError on non-404 HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

      try {
        await client.getSubaccounts('0xWallet');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(500);
        expect((error as ApiError).service).toBe('ethereal');
      }
    });
  });

  describe('getSubaccountBalances', () => {
    it('returns balances on success', async () => {
      const balances = [
        {
          subaccountId: 'sub-1',
          tokenId: 'usdc',
          tokenAddress: '0xUSDC',
          tokenName: 'USDC',
          amount: '10000',
          available: '8000',
          totalUsed: '2000',
          updatedAt: 1700000000,
        },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: balances,
        hasNext: false,
      }));

      const result = await client.getSubaccountBalances('sub-1');

      expect(result).toHaveLength(1);
      expect(result[0].tokenName).toBe('USDC');
      expect(result[0].amount).toBe('10000');
    });

    it('returns empty array on 404', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));

      const result = await client.getSubaccountBalances('nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('getPositions', () => {
    it('returns open positions on success', async () => {
      const positions = [
        {
          id: 'pos-1',
          subaccountId: 'sub-1',
          productId: 1,
          symbol: 'ETH-PERP',
          size: '2.5',
          side: 'long' as const,
          avgEntryPrice: '3000',
          unrealizedPnl: '250',
          realizedPnl: '0',
          liquidationPrice: '2700',
          isLiquidated: false,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T12:00:00Z',
        },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: positions,
        hasNext: false,
      }));

      const result = await client.getPositions('sub-1');

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('ETH-PERP');
      expect(result[0].side).toBe('long');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('subaccountId=sub-1');
      expect(calledUrl).toContain('open=true');
    });

    it('passes open=false when openOnly is false', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: [],
        hasNext: false,
      }));

      await client.getPositions('sub-1', false);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('open=false');
    });

    it('returns empty array on 404', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));

      const result = await client.getPositions('nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('getActivePosition', () => {
    it('returns active position on success', async () => {
      const position = {
        id: 'pos-1',
        subaccountId: 'sub-1',
        productId: 1,
        symbol: 'ETH-PERP',
        size: '1.0',
        side: 'short' as const,
        avgEntryPrice: '3500',
        unrealizedPnl: '-100',
        realizedPnl: '0',
        liquidationPrice: '4000',
        isLiquidated: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T12:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(position));

      const result = await client.getActivePosition('sub-1', 1);

      expect(result).toEqual(position);
      expect(result!.side).toBe('short');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('subaccountId=sub-1');
      expect(calledUrl).toContain('productId=1');
    });

    it('returns null on 404', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));

      const result = await client.getActivePosition('sub-1', 999);
      expect(result).toBeNull();
    });
  });

  describe('getProducts', () => {
    it('returns product list on success', async () => {
      const products = [
        {
          id: 1,
          symbol: 'ETH-PERP',
          baseAsset: 'ETH',
          quoteAsset: 'USD',
          markPrice: '3001',
          indexPrice: '3000',
          lastPrice: '3002',
        },
        {
          id: 2,
          symbol: 'BTC-PERP',
          baseAsset: 'BTC',
          quoteAsset: 'USD',
          markPrice: '50001',
          indexPrice: '50000',
          lastPrice: '50002',
        },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: products,
        hasNext: false,
      }));

      const result = await client.getProducts();

      expect(result).toHaveLength(2);
      expect(result[0].symbol).toBe('ETH-PERP');
      expect(result[1].symbol).toBe('BTC-PERP');
    });

    it('returns empty array on error', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

      const result = await client.getProducts();
      expect(result).toEqual([]);
    });
  });

  describe('timeout handling', () => {
    it('throws ApiError with 408 on timeout (AbortError)', async () => {
      // Simulate AbortError from AbortController timeout
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      try {
        await client.getSubaccounts('0xWallet');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(408);
        expect((error as ApiError).service).toBe('ethereal');
        expect((error as ApiError).message).toContain('timed out');
      }
    });
  });

  describe('error wrapping', () => {
    it('wraps generic errors in ApiError with status 500', async () => {
      mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

      try {
        await client.getSubaccountBalances('sub-1');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(500);
        expect((error as ApiError).service).toBe('ethereal');
        expect((error as ApiError).message).toContain('DNS resolution failed');
      }
    });
  });

  describe('server vs client URL routing', () => {
    it('uses proxy URL when window is defined (client-side)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], hasNext: false }));

      await client.getProducts();

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      // In test env with window stubbed, should use proxy path via window.location.origin
      expect(calledUrl).toContain('endpoint=product');
    });
  });
});
