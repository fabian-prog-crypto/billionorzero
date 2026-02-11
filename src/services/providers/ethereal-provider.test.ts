import { EtherealProvider } from './ethereal-provider';
import type { EtherealSubaccount, EtherealPosition, EtherealBalance, EtherealProduct } from '../api/ethereal-api';

// Mock the ethereal-api module
vi.mock('../api/ethereal-api', () => {
  const mockClient = {
    getSubaccounts: vi.fn(),
    getProducts: vi.fn(),
    getPositions: vi.fn(),
    getSubaccountBalances: vi.fn(),
  };
  return {
    getEtherealApiClient: () => mockClient,
    __mockClient: mockClient,
  };
});

// Access the mock client
async function getMockClient() {
  const mod = await import('../api/ethereal-api');
  return (mod as unknown as { __mockClient: {
    getSubaccounts: ReturnType<typeof vi.fn>;
    getProducts: ReturnType<typeof vi.fn>;
    getPositions: ReturnType<typeof vi.fn>;
    getSubaccountBalances: ReturnType<typeof vi.fn>;
  } }).__mockClient;
}

function makeSubaccount(overrides?: Partial<EtherealSubaccount>): EtherealSubaccount {
  return {
    id: 'sub-abc12345-long-id',
    account: '0xabc',
    name: 'default',
    createdBlockNumber: '100',
    registeredBlockNumber: '100',
    createdAt: 1700000000,
    ...overrides,
  };
}

function makePosition(overrides?: Partial<EtherealPosition>): EtherealPosition {
  return {
    id: 'pos-1',
    subaccountId: 'sub-abc12345-long-id',
    productId: 1,
    symbol: 'ETH-PERP',
    size: '5',
    side: 'long',
    avgEntryPrice: '3000',
    unrealizedPnl: '500',
    realizedPnl: '100',
    liquidationPrice: '2500',
    isLiquidated: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeBalance(overrides?: Partial<EtherealBalance>): EtherealBalance {
  return {
    subaccountId: 'sub-abc12345-long-id',
    tokenId: 'usde',
    tokenAddress: '0xb6fc4b1bff391e5f6b4a3d2c7bda1fee3524692d',
    tokenName: 'USDe',
    amount: '10000',
    available: '8000',
    totalUsed: '2000',
    updatedAt: 1700000000,
    ...overrides,
  };
}

function makeProduct(overrides?: Partial<EtherealProduct>): EtherealProduct {
  return {
    id: 1,
    symbol: 'ETH-PERP',
    baseAsset: 'ETH',
    quoteAsset: 'USD',
    markPrice: '3200',
    indexPrice: '3190',
    lastPrice: '3195',
    ...overrides,
  };
}

describe('EtherealProvider', () => {
  let provider: EtherealProvider;
  let mockClient: Awaited<ReturnType<typeof getMockClient>>;

  beforeEach(async () => {
    provider = new EtherealProvider();
    mockClient = await getMockClient();
    mockClient.getSubaccounts.mockReset();
    mockClient.getProducts.mockReset();
    mockClient.getPositions.mockReset();
    mockClient.getSubaccountBalances.mockReset();
  });

  describe('fetchPositions - perp positions', () => {
    it('returns long perp position with correct shape', async () => {
      mockClient.getSubaccounts.mockResolvedValue([makeSubaccount()]);
      mockClient.getProducts.mockResolvedValue([makeProduct()]);
      mockClient.getPositions.mockResolvedValue([makePosition()]);
      mockClient.getSubaccountBalances.mockResolvedValue([makeBalance()]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const ethPos = result.positions.find(p => p.symbol === 'ETH' && p.name.includes('Long'));
      expect(ethPos).toBeDefined();
      expect(ethPos!.type).toBe('crypto');
      expect(ethPos!.amount).toBe(5);
      expect(ethPos!.chain).toBe('ethereal');
      expect(ethPos!.protocol).toBe('Ethereal');
      expect(ethPos!.accountId).toBe('wallet-1');
      expect(ethPos!.isDebt).toBe(false);
      expect(ethPos!.id).toContain('long');
    });

    it('marks short positions with isDebt=true', async () => {
      mockClient.getSubaccounts.mockResolvedValue([makeSubaccount()]);
      mockClient.getProducts.mockResolvedValue([makeProduct()]);
      mockClient.getPositions.mockResolvedValue([
        makePosition({ symbol: 'BTC-PERP', side: 'short', size: '0.5', productId: 2 }),
      ]);
      mockClient.getSubaccountBalances.mockResolvedValue([makeBalance()]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const btcPos = result.positions.find(p => p.symbol === 'BTC' && p.name.includes('Short'));
      expect(btcPos).toBeDefined();
      expect(btcPos!.isDebt).toBe(true);
      expect(btcPos!.amount).toBe(0.5);
      expect(btcPos!.id).toContain('short');
    });

    it('skips liquidated positions', async () => {
      mockClient.getSubaccounts.mockResolvedValue([makeSubaccount()]);
      mockClient.getProducts.mockResolvedValue([makeProduct()]);
      mockClient.getPositions.mockResolvedValue([
        makePosition({ isLiquidated: true }),
      ]);
      mockClient.getSubaccountBalances.mockResolvedValue([]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const perpPositions = result.positions.filter(p => p.name.includes('Long') || p.name.includes('Short'));
      expect(perpPositions).toHaveLength(0);
    });

    it('skips zero-size positions', async () => {
      mockClient.getSubaccounts.mockResolvedValue([makeSubaccount()]);
      mockClient.getProducts.mockResolvedValue([makeProduct()]);
      mockClient.getPositions.mockResolvedValue([
        makePosition({ size: '0' }),
      ]);
      mockClient.getSubaccountBalances.mockResolvedValue([]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const perpPositions = result.positions.filter(p => p.name.includes('Long') || p.name.includes('Short'));
      expect(perpPositions).toHaveLength(0);
    });

    it('uses mark price from products over entry price', async () => {
      mockClient.getSubaccounts.mockResolvedValue([makeSubaccount()]);
      mockClient.getProducts.mockResolvedValue([
        makeProduct({ id: 1, markPrice: '3200', baseAsset: 'ETH' }),
      ]);
      mockClient.getPositions.mockResolvedValue([
        makePosition({ productId: 1, avgEntryPrice: '3000' }),
      ]);
      mockClient.getSubaccountBalances.mockResolvedValue([makeBalance()]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      expect(result.prices['ethereal-perp-eth']).toEqual({
        price: 3200,
        symbol: 'ETH',
      });
    });

    it('sets debankPriceKey in correct format', async () => {
      mockClient.getSubaccounts.mockResolvedValue([makeSubaccount()]);
      mockClient.getProducts.mockResolvedValue([makeProduct()]);
      mockClient.getPositions.mockResolvedValue([makePosition()]);
      mockClient.getSubaccountBalances.mockResolvedValue([makeBalance()]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const ethPos = result.positions.find(p => p.symbol === 'ETH' && p.name.includes('Long'));
      expect(ethPos!.debankPriceKey).toBe('ethereal-perp-eth');
    });
  });

  describe('fetchPositions - balance processing', () => {
    it('resolves stablecoin balance from token address', async () => {
      mockClient.getSubaccounts.mockResolvedValue([makeSubaccount()]);
      mockClient.getProducts.mockResolvedValue([]);
      mockClient.getPositions.mockResolvedValue([]);
      mockClient.getSubaccountBalances.mockResolvedValue([
        makeBalance({
          tokenAddress: '0xb6fc4b1bff391e5f6b4a3d2c7bda1fee3524692d',
          tokenName: 'USDe',
          amount: '10000',
        }),
      ]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const usdePos = result.positions.find(p => p.symbol === 'USDe');
      expect(usdePos).toBeDefined();
      expect(usdePos!.amount).toBe(10000);
      expect(usdePos!.name).toContain('Margin');
      expect(result.prices['ethereal-spot-usde'].price).toBe(1);
    });

    it('tracks accountValue from stablecoin balances', async () => {
      mockClient.getSubaccounts.mockResolvedValue([makeSubaccount()]);
      mockClient.getProducts.mockResolvedValue([]);
      mockClient.getPositions.mockResolvedValue([]);
      mockClient.getSubaccountBalances.mockResolvedValue([
        makeBalance({ tokenName: 'USDC', tokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', amount: '5000' }),
        makeBalance({ tokenName: 'USDe', tokenAddress: '0xb6fc4b1bff391e5f6b4a3d2c7bda1fee3524692d', amount: '3000' }),
      ]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      expect(result.accountValue).toBe(8000);
    });

    it('resolves USDC from known token address', async () => {
      mockClient.getSubaccounts.mockResolvedValue([makeSubaccount()]);
      mockClient.getProducts.mockResolvedValue([]);
      mockClient.getPositions.mockResolvedValue([]);
      mockClient.getSubaccountBalances.mockResolvedValue([
        makeBalance({
          tokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          tokenName: 'USDC',
          amount: '5000',
        }),
      ]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      const usdcPos = result.positions.find(p => p.symbol === 'USDC');
      expect(usdcPos).toBeDefined();
      expect(result.prices['ethereal-spot-usdc'].price).toBe(1);
    });
  });

  describe('fetchPositions - fallback margin estimation', () => {
    it('estimates margin from notional/10 when no balances but has perps', async () => {
      mockClient.getSubaccounts.mockResolvedValue([makeSubaccount()]);
      mockClient.getProducts.mockResolvedValue([makeProduct()]);
      mockClient.getPositions.mockResolvedValue([
        makePosition({ size: '10', avgEntryPrice: '3000', side: 'long' }),
      ]);
      mockClient.getSubaccountBalances.mockResolvedValue([]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      // notional = 10 * 3000 = 30000, estimated margin = 30000 / 10 = 3000
      const marginPos = result.positions.find(p => p.symbol === 'USDC' && p.name.includes('Margin'));
      expect(marginPos).toBeDefined();
      expect(marginPos!.amount).toBe(3000);
      expect(result.accountValue).toBe(3000);
    });

    it('does not add fallback margin when balances exist', async () => {
      mockClient.getSubaccounts.mockResolvedValue([makeSubaccount()]);
      mockClient.getProducts.mockResolvedValue([makeProduct()]);
      mockClient.getPositions.mockResolvedValue([
        makePosition({ size: '10', avgEntryPrice: '3000' }),
      ]);
      mockClient.getSubaccountBalances.mockResolvedValue([
        makeBalance({ amount: '5000' }),
      ]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      // Should have the balance-based position, not a fallback USDC Margin
      const fallbackMargin = result.positions.filter(p => p.id.includes('ethereal-margin-usdc'));
      expect(fallbackMargin).toHaveLength(0);
    });
  });

  describe('fetchPositions - empty/no subaccounts', () => {
    it('returns empty result when no subaccounts', async () => {
      mockClient.getSubaccounts.mockResolvedValue([]);

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      expect(result.positions).toEqual([]);
      expect(result.prices).toEqual({});
      expect(result.accountValue).toBe(0);
    });
  });

  describe('fetchPositions - error handling', () => {
    it('returns empty result with error message on failure', async () => {
      mockClient.getSubaccounts.mockRejectedValue(new Error('Network error'));

      const result = await provider.fetchPositions('0xabc', 'wallet-1');

      expect(result.positions).toEqual([]);
      expect(result.prices).toEqual({});
      expect(result.accountValue).toBe(0);
      expect(result.error).toBe('Network error');
    });
  });

  describe('hasActivity', () => {
    it('returns true when subaccounts exist', async () => {
      mockClient.getSubaccounts.mockResolvedValue([makeSubaccount()]);

      const result = await provider.hasActivity('0xabc');
      expect(result).toBe(true);
    });

    it('returns false when no subaccounts', async () => {
      mockClient.getSubaccounts.mockResolvedValue([]);

      const result = await provider.hasActivity('0xabc');
      expect(result).toBe(false);
    });

    it('returns false on API error', async () => {
      mockClient.getSubaccounts.mockRejectedValue(new Error('API down'));

      const result = await provider.hasActivity('0xabc');
      expect(result).toBe(false);
    });
  });
});
