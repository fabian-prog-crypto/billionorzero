import { HyperliquidApiClient } from './hyperliquid-api';
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

describe('HyperliquidApiClient', () => {
  let client: HyperliquidApiClient;

  beforeEach(() => {
    // Stub window.location.origin for URL construction in the client
    vi.stubGlobal('window', { location: { origin: 'https://test.local' } });
    client = new HyperliquidApiClient('/api/perps/hyperliquid');
    mockFetch.mockReset();
  });

  describe('getClearinghouseState', () => {
    it('returns clearinghouse state on success', async () => {
      const state = {
        assetPositions: [
          {
            position: {
              coin: 'ETH',
              szi: '1.5',
              entryPx: '3000',
              positionValue: '4500',
              unrealizedPnl: '150',
              marginUsed: '450',
              leverage: { type: 'cross', value: 10 },
              liquidationPx: '2700',
              maxLeverage: 50,
              returnOnEquity: '0.33',
              cumFunding: { allTime: '10', sinceChange: '5', sinceOpen: '2' },
            },
            type: 'oneWay',
          },
        ],
        crossMaintenanceMarginUsed: '100',
        crossMarginSummary: { accountValue: '10000', totalMarginUsed: '450', totalNtlPos: '4500', totalRawUsd: '5500' },
        marginSummary: { accountValue: '10000', totalMarginUsed: '450', totalNtlPos: '4500', totalRawUsd: '5500' },
        time: 1700000000000,
        withdrawable: '5000',
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(state));

      const result = await client.getClearinghouseState('0xUserAddress');

      expect(result).toEqual(state);
      expect(result.assetPositions).toHaveLength(1);
      expect(result.assetPositions[0].position.coin).toBe('ETH');

      // Verify POST request shape
      const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
      expect(calledUrl).toContain('/api/perps/hyperliquid');
      expect(calledOptions.method).toBe('POST');
      expect(calledOptions.headers['Content-Type']).toBe('application/json');
      const body = JSON.parse(calledOptions.body);
      expect(body.type).toBe('clearinghouseState');
      expect(body.user).toBe('0xUserAddress');
    });

    it('throws ApiError on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

      try {
        await client.getClearinghouseState('0xUserAddress');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(500);
        expect((error as ApiError).service).toBe('hyperliquid');
      }
    });

    it('wraps network errors in ApiError', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      try {
        await client.getClearinghouseState('0xUserAddress');
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(500);
        expect((error as ApiError).service).toBe('hyperliquid');
        expect((error as ApiError).message).toContain('Network failure');
      }
    });
  });

  describe('getSpotClearinghouseState', () => {
    it('returns spot balances on success', async () => {
      const spotState = {
        balances: [
          { coin: 'USDC', token: 0, hold: '0', total: '5000', entryNtl: '5000' },
          { coin: 'ETH', token: 1, hold: '0', total: '2.5', entryNtl: '7500' },
        ],
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(spotState));

      const result = await client.getSpotClearinghouseState('0xUserAddress');

      expect(result.balances).toHaveLength(2);
      expect(result.balances[0].coin).toBe('USDC');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.type).toBe('spotClearinghouseState');
      expect(body.user).toBe('0xUserAddress');
    });
  });

  describe('getSpotMeta', () => {
    it('returns spot metadata on success', async () => {
      const spotMeta = {
        tokens: [
          { name: 'USDC', szDecimals: 6, weiDecimals: 6, index: 0, tokenId: '0x...', isCanonical: true, evmContract: null, fullName: 'USD Coin' },
        ],
        universe: [
          { tokens: [1, 0], name: 'ETH/USDC', index: 0, isCanonical: true },
        ],
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(spotMeta));

      const result = await client.getSpotMeta();

      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].name).toBe('USDC');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.type).toBe('spotMeta');
      expect(body.user).toBeUndefined();
    });
  });

  describe('getAllMids', () => {
    it('returns all mid prices on success', async () => {
      const mids = { ETH: '3000.5', BTC: '50000.0', SOL: '150.25' };
      mockFetch.mockResolvedValueOnce(jsonResponse(mids));

      const result = await client.getAllMids();

      expect(result).toEqual(mids);
      expect(result['ETH']).toBe('3000.5');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.type).toBe('allMids');
    });
  });

  describe('getPerpMeta', () => {
    it('returns perp metadata on success', async () => {
      const perpMeta = {
        universe: [
          { name: 'ETH', szDecimals: 4, maxLeverage: 50, onlyIsolated: false },
          { name: 'BTC', szDecimals: 5, maxLeverage: 50, onlyIsolated: false },
        ],
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(perpMeta));

      const result = await client.getPerpMeta();

      expect(result.universe).toHaveLength(2);
      expect(result.universe[0].name).toBe('ETH');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.type).toBe('meta');
    });
  });
});
