import { HyperliquidProvider } from './hyperliquid-provider';
import type { HyperliquidClearinghouseState, HyperliquidSpotState } from '../api/hyperliquid-api';

// Mock the hyperliquid-api module
vi.mock('../api/hyperliquid-api', () => {
  const mockClient = {
    getClearinghouseState: vi.fn(),
    getSpotClearinghouseState: vi.fn(),
    getAllMids: vi.fn(),
  };
  return {
    getHyperliquidApiClient: () => mockClient,
    __mockClient: mockClient,
  };
});

// Access the mock client
async function getMockClient() {
  const mod = await import('../api/hyperliquid-api');
  return (mod as unknown as { __mockClient: {
    getClearinghouseState: ReturnType<typeof vi.fn>;
    getSpotClearinghouseState: ReturnType<typeof vi.fn>;
    getAllMids: ReturnType<typeof vi.fn>;
  } }).__mockClient;
}

function makePerpState(overrides?: Partial<HyperliquidClearinghouseState>): HyperliquidClearinghouseState {
  return {
    assetPositions: [],
    crossMaintenanceMarginUsed: '0',
    crossMarginSummary: { accountValue: '0', totalMarginUsed: '0', totalNtlPos: '0', totalRawUsd: '0' },
    marginSummary: { accountValue: '10000', totalMarginUsed: '500', totalNtlPos: '5000', totalRawUsd: '10000' },
    time: Date.now(),
    withdrawable: '9500',
    ...overrides,
  };
}

function makeAssetPosition(coin: string, szi: string) {
  return {
    position: {
      coin,
      entryPx: '50000',
      leverage: { type: 'cross', value: 5 },
      liquidationPx: '40000',
      marginUsed: '1000',
      maxLeverage: 50,
      positionValue: '5000',
      returnOnEquity: '0.1',
      szi,
      unrealizedPnl: '500',
      cumFunding: { allTime: '10', sinceChange: '5', sinceOpen: '3' },
    },
    type: 'oneWay',
  };
}

describe('HyperliquidProvider', () => {
  let provider: HyperliquidProvider;
  let mockClient: Awaited<ReturnType<typeof getMockClient>>;

  beforeEach(async () => {
    provider = new HyperliquidProvider();
    mockClient = await getMockClient();
    mockClient.getClearinghouseState.mockReset();
    mockClient.getSpotClearinghouseState.mockReset();
    mockClient.getAllMids.mockReset();
  });

  describe('fetchPositions - perp positions', () => {
    it('returns positions with correct shape', async () => {
      mockClient.getClearinghouseState.mockResolvedValue(
        makePerpState({
          assetPositions: [makeAssetPosition('BTC', '0.1')],
        })
      );
      mockClient.getSpotClearinghouseState.mockResolvedValue({ balances: [] });
      mockClient.getAllMids.mockResolvedValue({ BTC: '65000' });

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const btcPos = result.positions.find(p => p.symbol === 'BTC');
      expect(btcPos).toBeDefined();
      expect(btcPos!.type).toBe('crypto');
      expect(btcPos!.amount).toBe(0.1);
      expect(btcPos!.chain).toBe('hyperliquid');
      expect(btcPos!.walletAddress).toBe('0xabc');
      expect(btcPos!.id).toContain('hyperliquid-perp-BTC-long');
    });

    it('marks short positions with isDebt=true', async () => {
      mockClient.getClearinghouseState.mockResolvedValue(
        makePerpState({
          assetPositions: [makeAssetPosition('ETH', '-5')],
        })
      );
      mockClient.getSpotClearinghouseState.mockResolvedValue({ balances: [] });
      mockClient.getAllMids.mockResolvedValue({ ETH: '3000' });

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const ethPos = result.positions.find(p => p.symbol === 'ETH');
      expect(ethPos).toBeDefined();
      expect(ethPos!.isDebt).toBe(true);
      expect(ethPos!.amount).toBe(5); // absolute value
      expect(ethPos!.id).toContain('short');
    });

    it('creates USDC margin position from account value', async () => {
      mockClient.getClearinghouseState.mockResolvedValue(
        makePerpState({ marginSummary: { accountValue: '25000', totalMarginUsed: '0', totalNtlPos: '0', totalRawUsd: '0' } })
      );
      mockClient.getSpotClearinghouseState.mockResolvedValue({ balances: [] });
      mockClient.getAllMids.mockResolvedValue({});

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const usdcPos = result.positions.find(p => p.symbol === 'USDC' && p.name.includes('Margin'));
      expect(usdcPos).toBeDefined();
      expect(usdcPos!.amount).toBe(25000);
      expect(usdcPos!.protocol).toBe('Hyperliquid');
    });

    it('skips zero-size positions', async () => {
      mockClient.getClearinghouseState.mockResolvedValue(
        makePerpState({
          assetPositions: [
            makeAssetPosition('BTC', '0'),
            makeAssetPosition('ETH', '2'),
          ],
        })
      );
      mockClient.getSpotClearinghouseState.mockResolvedValue({ balances: [] });
      mockClient.getAllMids.mockResolvedValue({ BTC: '65000', ETH: '3000' });

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const btcPerp = result.positions.filter(p => p.symbol === 'BTC');
      expect(btcPerp).toHaveLength(0);

      const ethPerp = result.positions.filter(p => p.symbol === 'ETH');
      expect(ethPerp).toHaveLength(1);
    });

    it('sets protocol to Hyperliquid', async () => {
      mockClient.getClearinghouseState.mockResolvedValue(
        makePerpState({ assetPositions: [makeAssetPosition('SOL', '10')] })
      );
      mockClient.getSpotClearinghouseState.mockResolvedValue({ balances: [] });
      mockClient.getAllMids.mockResolvedValue({ SOL: '150' });

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      expect(result.positions.every(p => p.protocol === 'Hyperliquid')).toBe(true);
    });

    it('sets debankPriceKey in correct format', async () => {
      mockClient.getClearinghouseState.mockResolvedValue(
        makePerpState({ assetPositions: [makeAssetPosition('BTC', '1')] })
      );
      mockClient.getSpotClearinghouseState.mockResolvedValue({ balances: [] });
      mockClient.getAllMids.mockResolvedValue({ BTC: '65000' });

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const btcPos = result.positions.find(p => p.symbol === 'BTC');
      expect(btcPos!.debankPriceKey).toBe('hyperliquid-perp-btc');
    });

    it('attaches price data from allMids', async () => {
      mockClient.getClearinghouseState.mockResolvedValue(
        makePerpState({ assetPositions: [makeAssetPosition('BTC', '0.5')] })
      );
      mockClient.getSpotClearinghouseState.mockResolvedValue({ balances: [] });
      mockClient.getAllMids.mockResolvedValue({ BTC: '65432.10' });

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      expect(result.prices['hyperliquid-perp-btc']).toEqual({
        price: 65432.10,
        symbol: 'BTC',
      });
    });
  });

  describe('fetchPositions - spot balances', () => {
    it('returns spot balance positions', async () => {
      mockClient.getClearinghouseState.mockResolvedValue(makePerpState());
      mockClient.getSpotClearinghouseState.mockResolvedValue({
        balances: [
          { coin: 'PURR', token: 1, hold: '0', total: '1000', entryNtl: '100' },
        ],
      } as HyperliquidSpotState);
      mockClient.getAllMids.mockResolvedValue({ 'PURR/USDC': '0.15' });

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const purrPos = result.positions.find(p => p.symbol === 'PURR');
      expect(purrPos).toBeDefined();
      expect(purrPos!.amount).toBe(1000);
      expect(purrPos!.name).toContain('Spot');
      expect(result.prices['hyperliquid-spot-purr']).toEqual({ price: 0.15, symbol: 'PURR' });
    });

    it('detects stablecoins (USDC, USDT, USDe variants)', async () => {
      mockClient.getClearinghouseState.mockResolvedValue(
        makePerpState({ marginSummary: { accountValue: '0', totalMarginUsed: '0', totalNtlPos: '0', totalRawUsd: '0' } })
      );
      mockClient.getSpotClearinghouseState.mockResolvedValue({
        balances: [
          { coin: 'USDC', token: 0, hold: '0', total: '5000', entryNtl: '5000' },
          { coin: 'USDT', token: 1, hold: '0', total: '3000', entryNtl: '3000' },
          { coin: 'sUSDe', token: 2, hold: '0', total: '2000', entryNtl: '2000' },
        ],
      } as HyperliquidSpotState);
      mockClient.getAllMids.mockResolvedValue({});

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      // Stablecoins should have price = 1
      expect(result.prices['hyperliquid-spot-usdc'].price).toBe(1);
      expect(result.prices['hyperliquid-spot-usdt'].price).toBe(1);
      expect(result.prices['hyperliquid-spot-susde'].price).toBe(1);

      // They should be labeled as "Spot Margin"
      const usdcPos = result.positions.find(p => p.symbol === 'USDC' && p.id.includes('spot'));
      expect(usdcPos!.name).toContain('Spot Margin');
    });
  });

  describe('fetchPositions - error handling', () => {
    it('returns empty result on API failure (individual catches swallow errors)', async () => {
      // Each API call has its own .catch(() => null) in the provider,
      // so individual failures result in null states, not a thrown error
      mockClient.getClearinghouseState.mockRejectedValue(new Error('API down'));
      mockClient.getSpotClearinghouseState.mockRejectedValue(new Error('API down'));
      mockClient.getAllMids.mockRejectedValue(new Error('API down'));

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      expect(result.positions).toEqual([]);
      expect(result.prices).toEqual({});
      expect(result.accountValue).toBe(0);
      // No error property since individual catches return null, not throw
      expect(result.error).toBeUndefined();
    });
  });

  describe('hasActivity', () => {
    it('returns true when positions exist', async () => {
      mockClient.getClearinghouseState.mockResolvedValue(
        makePerpState({
          assetPositions: [makeAssetPosition('BTC', '0.1')],
        })
      );

      const result = await provider.hasActivity('0xabc');
      expect(result).toBe(true);
    });

    it('returns false for empty wallet with no value', async () => {
      mockClient.getClearinghouseState.mockResolvedValue(
        makePerpState({
          marginSummary: { accountValue: '0', totalMarginUsed: '0', totalNtlPos: '0', totalRawUsd: '0' },
          assetPositions: [],
        })
      );

      const result = await provider.hasActivity('0xabc');
      expect(result).toBe(false);
    });
  });
});
