import { LighterProvider } from './lighter-provider';
import type { LighterAccount, LighterAssetDetails } from '../api/lighter-api';
import { toChecksumAddress } from '@/lib/eip55';

// Mock the lighter-api module
vi.mock('../api/lighter-api', () => {
  const mockClient = {
    getAssetDetails: vi.fn(),
    getAccountsByL1Address: vi.fn(),
    getAccountByAddress: vi.fn(),
  };
  return {
    getLighterApiClient: () => mockClient,
    __mockClient: mockClient,
  };
});

// Access the mock client
async function getMockClient() {
  const mod = await import('../api/lighter-api');
  return (mod as unknown as { __mockClient: {
    getAssetDetails: ReturnType<typeof vi.fn>;
    getAccountsByL1Address: ReturnType<typeof vi.fn>;
    getAccountByAddress: ReturnType<typeof vi.fn>;
  } }).__mockClient;
}

function makeAccount(overrides?: Partial<LighterAccount>): LighterAccount {
  return {
    index: 0,
    l1_address: '0xabc',
    collateral: '5000',
    available_balance: '4000',
    total_asset_value: '10000',
    positions: [],
    assets: [],
    ...overrides,
  };
}

function makePosition(symbol: string, position: string, sign: number) {
  return {
    market_id: 1,
    symbol,
    position,
    sign,
    avg_entry_price: '50000',
    position_value: '5000',
    unrealized_pnl: '500',
    realized_pnl: '100',
    liquidation_price: '40000',
    allocated_margin: '1000',
    margin_mode: 'cross',
  };
}

function makeAssetDetail(symbol: string, indexPrice: string): LighterAssetDetails {
  return {
    asset_id: 1,
    symbol,
    decimals: 8,
    l1_address: '0x0',
    index_price: indexPrice,
    margin_mode: 'cross',
  };
}

describe('LighterProvider', () => {
  let provider: LighterProvider;
  let mockClient: Awaited<ReturnType<typeof getMockClient>>;

  beforeEach(async () => {
    provider = new LighterProvider();
    mockClient = await getMockClient();
    mockClient.getAssetDetails.mockReset();
    mockClient.getAccountsByL1Address.mockReset();
    mockClient.getAccountByAddress.mockReset();
  });

  describe('fetchPositions - perp positions', () => {
    it('returns long perp position with correct shape', async () => {
      mockClient.getAssetDetails.mockResolvedValue([makeAssetDetail('BTC', '65000')]);
      mockClient.getAccountsByL1Address.mockResolvedValue([
        makeAccount({
          positions: [makePosition('BTC-PERP', '0.1', 1)],
        }),
      ]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const btcPos = result.positions.find(p => p.symbol === 'BTC' && !p.name.includes('Margin'));
      expect(btcPos).toBeDefined();
      expect(btcPos!.type).toBe('crypto');
      expect(btcPos!.amount).toBe(0.1);
      expect(btcPos!.chain).toBe('lighter');
      expect(btcPos!.protocol).toBe('Lighter');
      expect(btcPos!.accountId).toBe('wallet-1');
      expect(btcPos!.isDebt).toBe(false);
      expect(btcPos!.id).toContain('long');
    });

    it('marks short positions with isDebt=true (sign=-1)', async () => {
      mockClient.getAssetDetails.mockResolvedValue([makeAssetDetail('ETH', '3000')]);
      mockClient.getAccountsByL1Address.mockResolvedValue([
        makeAccount({
          positions: [makePosition('ETH-PERP', '5', -1)],
        }),
      ]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const ethPos = result.positions.find(p => p.symbol === 'ETH' && !p.name.includes('Margin'));
      expect(ethPos).toBeDefined();
      expect(ethPos!.isDebt).toBe(true);
      expect(ethPos!.amount).toBe(5);
      expect(ethPos!.id).toContain('short');
    });

    it('skips zero-size positions', async () => {
      mockClient.getAssetDetails.mockResolvedValue([
        makeAssetDetail('BTC', '65000'),
        makeAssetDetail('ETH', '3000'),
      ]);
      mockClient.getAccountsByL1Address.mockResolvedValue([
        makeAccount({
          positions: [
            makePosition('BTC-PERP', '0', 1),
            makePosition('ETH-PERP', '2', 1),
          ],
        }),
      ]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const btcPerps = result.positions.filter(p => p.symbol === 'BTC' && !p.name.includes('Margin'));
      expect(btcPerps).toHaveLength(0);

      const ethPerps = result.positions.filter(p => p.symbol === 'ETH');
      expect(ethPerps).toHaveLength(1);
    });

    it('uses index price from asset details over entry price', async () => {
      mockClient.getAssetDetails.mockResolvedValue([makeAssetDetail('BTC', '65000')]);
      mockClient.getAccountsByL1Address.mockResolvedValue([
        makeAccount({
          positions: [makePosition('BTC-PERP', '1', 1)],
        }),
      ]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      expect(result.prices['lighter-perp-btc']).toEqual({
        price: 65000,
        symbol: 'BTC',
      });
    });

    it('sets debankPriceKey in correct format', async () => {
      mockClient.getAssetDetails.mockResolvedValue([makeAssetDetail('SOL', '150')]);
      mockClient.getAccountsByL1Address.mockResolvedValue([
        makeAccount({
          positions: [makePosition('SOL-PERP', '10', 1)],
        }),
      ]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const solPos = result.positions.find(p => p.symbol === 'SOL' && !p.name.includes('Margin'));
      expect(solPos!.debankPriceKey).toBe('lighter-perp-sol');
    });
  });

  describe('fetchPositions - margin USDC', () => {
    it('creates USDC margin position from total_asset_value', async () => {
      mockClient.getAssetDetails.mockResolvedValue([]);
      mockClient.getAccountsByL1Address.mockResolvedValue([
        makeAccount({ total_asset_value: '25000' }),
      ]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const usdcPos = result.positions.find(p => p.symbol === 'USDC' && p.name.includes('Margin'));
      expect(usdcPos).toBeDefined();
      expect(usdcPos!.amount).toBe(25000);
      expect(usdcPos!.protocol).toBe('Lighter');
      expect(result.accountValue).toBe(25000);
    });

    it('does not create margin position when total_asset_value is 0', async () => {
      mockClient.getAssetDetails.mockResolvedValue([]);
      mockClient.getAccountsByL1Address.mockResolvedValue([
        makeAccount({ total_asset_value: '0', positions: [] }),
      ]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const marginPositions = result.positions.filter(p => p.name.includes('Margin'));
      expect(marginPositions).toHaveLength(0);
    });
  });

  describe('fetchPositions - spot balances', () => {
    it('processes non-stablecoin spot assets', async () => {
      mockClient.getAssetDetails.mockResolvedValue([makeAssetDetail('ETH', '3000')]);
      mockClient.getAccountsByL1Address.mockResolvedValue([
        makeAccount({
          assets: [{ symbol: 'ETH', asset_id: 1, balance: '2.5', locked_balance: '0' }],
        }),
      ]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const ethSpot = result.positions.find(p => p.name.includes('Lighter Spot'));
      expect(ethSpot).toBeDefined();
      expect(ethSpot!.symbol).toBe('ETH');
      expect(ethSpot!.amount).toBe(2.5);
      expect(ethSpot!.debankPriceKey).toBe('lighter-spot-eth');
    });

    it('skips stablecoin assets (USDC, USDT, DAI, USDe)', async () => {
      mockClient.getAssetDetails.mockResolvedValue([]);
      mockClient.getAccountsByL1Address.mockResolvedValue([
        makeAccount({
          assets: [
            { symbol: 'USDC', asset_id: 0, balance: '5000', locked_balance: '0' },
            { symbol: 'USDT', asset_id: 1, balance: '3000', locked_balance: '0' },
            { symbol: 'DAI', asset_id: 2, balance: '2000', locked_balance: '0' },
            { symbol: 'USDe', asset_id: 3, balance: '1000', locked_balance: '0' },
          ],
        }),
      ]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const spotPositions = result.positions.filter(p => p.name.includes('Lighter Spot'));
      expect(spotPositions).toHaveLength(0);
    });
  });

  describe('fetchPositions - multiple sub-accounts', () => {
    it('aggregates positions from multiple accounts', async () => {
      mockClient.getAssetDetails.mockResolvedValue([makeAssetDetail('BTC', '65000')]);
      mockClient.getAccountsByL1Address.mockResolvedValue([
        makeAccount({
          index: 0,
          total_asset_value: '10000',
          positions: [makePosition('BTC-PERP', '0.1', 1)],
        }),
        makeAccount({
          index: 1,
          total_asset_value: '5000',
          positions: [makePosition('BTC-PERP', '0.2', -1)],
        }),
      ]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      // Should have 2 BTC positions + 2 USDC margins = 4 total
      expect(result.positions.length).toBe(4);
      expect(result.accountValue).toBe(15000);
    });
  });

  describe('fetchPositions - fallback to single account', () => {
    it('falls back to getAccountByAddress when no L1 accounts', async () => {
      mockClient.getAssetDetails.mockResolvedValue([]);
      mockClient.getAccountsByL1Address.mockResolvedValue([]);
      mockClient.getAccountByAddress.mockResolvedValue(
        makeAccount({ total_asset_value: '8000' })
      );

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      expect(mockClient.getAccountByAddress).toHaveBeenCalledWith(toChecksumAddress('0xabc'));
      const usdcPos = result.positions.find(p => p.name.includes('Margin'));
      expect(usdcPos).toBeDefined();
      expect(usdcPos!.amount).toBe(8000);
    });

    it('returns empty when no accounts found at all', async () => {
      mockClient.getAssetDetails.mockResolvedValue([]);
      mockClient.getAccountsByL1Address.mockResolvedValue([]);
      mockClient.getAccountByAddress.mockResolvedValue(null);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      expect(result.positions).toEqual([]);
      expect(result.accountValue).toBe(0);
    });
  });

  describe('fetchPositions - error handling', () => {
    it('returns empty result with error message on failure', async () => {
      mockClient.getAssetDetails.mockResolvedValue([]);
      mockClient.getAccountsByL1Address.mockRejectedValue(new Error('Network error'));

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      expect(result.positions).toEqual([]);
      expect(result.prices).toEqual({});
      expect(result.accountValue).toBe(0);
      expect(result.error).toBe('Network error');
    });
  });

  describe('fetchPositions - EIP-55 checksumming', () => {
    it('checksums lowercase address before calling Lighter API', async () => {
      const lowercase = '0x7fda5a2fe9bf63d2f073bbbad04adafefa50a927';
      const expected = '0x7fda5a2fe9Bf63d2F073BbBaD04adaFEfA50A927';

      mockClient.getAssetDetails.mockResolvedValue([]);
      mockClient.getAccountsByL1Address.mockResolvedValue([
        makeAccount({ total_asset_value: '100000' }),
      ]);

      await provider.fetchPositions(lowercase, 'wallet-1');

      expect(mockClient.getAccountsByL1Address).toHaveBeenCalledWith(expected);
    });

    it('checksums address for fallback single-account lookup too', async () => {
      const lowercase = '0x7fda5a2fe9bf63d2f073bbbad04adafefa50a927';
      const expected = '0x7fda5a2fe9Bf63d2F073BbBaD04adaFEfA50A927';

      mockClient.getAssetDetails.mockResolvedValue([]);
      mockClient.getAccountsByL1Address.mockResolvedValue([]);
      mockClient.getAccountByAddress.mockResolvedValue(null);

      await provider.fetchPositions(lowercase, 'wallet-1');

      expect(mockClient.getAccountByAddress).toHaveBeenCalledWith(expected);
    });
  });

  describe('hasActivity', () => {
    it('returns true when account has positions', async () => {
      mockClient.getAccountsByL1Address.mockResolvedValue([
        makeAccount({ positions: [makePosition('BTC-PERP', '0.1', 1)] }),
      ]);

      const result = await provider.hasActivity('0xabc');
      expect(result).toBe(true);
    });

    it('returns true when account has value but no positions', async () => {
      mockClient.getAccountsByL1Address.mockResolvedValue([
        makeAccount({ total_asset_value: '5000', positions: [] }),
      ]);

      const result = await provider.hasActivity('0xabc');
      expect(result).toBe(true);
    });

    it('returns false when no accounts exist', async () => {
      mockClient.getAccountsByL1Address.mockResolvedValue([]);
      mockClient.getAccountByAddress.mockResolvedValue(null);

      const result = await provider.hasActivity('0xabc');
      expect(result).toBe(false);
    });

    it('returns false on API error', async () => {
      mockClient.getAccountsByL1Address.mockRejectedValue(new Error('API down'));

      const result = await provider.hasActivity('0xabc');
      expect(result).toBe(false);
    });

    it('checksums address before calling Lighter API', async () => {
      const lowercase = '0x7fda5a2fe9bf63d2f073bbbad04adafefa50a927';
      const expected = '0x7fda5a2fe9Bf63d2F073BbBaD04adaFEfA50A927';

      mockClient.getAccountsByL1Address.mockResolvedValue([]);
      mockClient.getAccountByAddress.mockResolvedValue(null);

      await provider.hasActivity(lowercase);

      expect(mockClient.getAccountsByL1Address).toHaveBeenCalledWith(expected);
    });
  });
});
