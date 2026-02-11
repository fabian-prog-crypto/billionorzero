import { WalletProvider } from './wallet-provider';
import type { DebankTokenResponse, DebankProtocolResponse } from '../api/types';
import type { Account } from '@/types';

// Mock the DeBank API module
vi.mock('../api', () => {
  const mockClient = {
    getWalletTokens: vi.fn(),
    getWalletProtocols: vi.fn(),
  };
  return {
    getDebankApiClient: () => mockClient,
    __mockClient: mockClient,
    ApiError: class ApiError extends Error {
      statusCode?: number;
      service?: string;
      constructor(message: string, statusCode?: number, service?: string) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.service = service;
      }
    },
  };
});

// Mock the demo-data module
vi.mock('./demo-data', () => ({
  generateDemoWalletTokens: vi.fn(() => [
    { symbol: 'ETH', name: 'Ethereum', amount: 1, price: 3200, value: 3200, chain: 'eth' },
  ]),
  generateDemoDefiPositions: vi.fn(() => [
    { protocol: 'Demo Protocol', chain: 'eth', type: 'DeFi', value: 1000, tokens: [{ symbol: 'ETH', amount: 0.3, price: 3200 }] },
  ]),
}));

// Mock perp-exchange-service
vi.mock('../domain/perp-exchange-service', () => ({
  getPerpExchangeService: () => ({
    hasEnabledExchanges: vi.fn(() => false),
    fetchPositions: vi.fn(() => ({ positions: [], prices: {} })),
  }),
}));

// Mock cache module
vi.mock('../utils/cache', () => ({
  getCached: vi.fn(() => null),
  setCache: vi.fn(),
  clearAllCache: vi.fn(),
  formatCacheAge: vi.fn(() => '1m ago'),
}));

async function getMockDebankClient() {
  const mod = await import('../api');
  return (mod as unknown as {
    __mockClient: {
      getWalletTokens: ReturnType<typeof vi.fn>;
      getWalletProtocols: ReturnType<typeof vi.fn>;
    };
  }).__mockClient;
}

function makeToken(overrides: Partial<DebankTokenResponse> = {}): DebankTokenResponse {
  return {
    id: '0xtoken',
    chain: 'eth',
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    price: 3200,
    amount: 1.5,
    raw_amount: 1500000000000000000,
    is_verified: true,
    ...overrides,
  };
}

function makeProtocol(overrides: Partial<DebankProtocolResponse> = {}): DebankProtocolResponse {
  return {
    id: 'aave_v3',
    chain: 'eth',
    name: 'Aave V3',
    portfolio_item_list: [
      {
        name: 'Lending',
        stats: { asset_usd_value: 5000, net_usd_value: 5000 },
        detail: {
          supply_token_list: [
            makeToken({ symbol: 'WETH', name: 'Wrapped Ether', amount: 1, price: 3200 }),
          ],
        },
      },
    ],
    ...overrides,
  };
}

function makeWalletAccount(overrides: { id?: string; address: string; name?: string; chains?: string[] }): Account {
  return {
    id: overrides.id || 'w1',
    name: overrides.name || 'Wallet',
    isActive: true,
    connection: {
      dataSource: 'debank',
      address: overrides.address,
      chains: overrides.chains || ['eth'],
    },
    addedAt: new Date().toISOString(),
  };
}

describe('WalletProvider', () => {
  let provider: WalletProvider;
  let mockClient: Awaited<ReturnType<typeof getMockDebankClient>>;

  beforeEach(async () => {
    mockClient = await getMockDebankClient();
    mockClient.getWalletTokens.mockReset();
    mockClient.getWalletProtocols.mockReset();

    // Reset cache mock before each test
    const cacheMod = await import('../utils/cache');
    vi.mocked(cacheMod.getCached).mockReturnValue(null);
    vi.mocked(cacheMod.setCache).mockClear();
  });

  // ─── getWalletTokens ──────────────────────────────────────────────

  describe('getWalletTokens', () => {
    it('returns demo data when no API key is configured', async () => {
      provider = new WalletProvider({ debankApiKey: undefined });

      const result = await provider.getWalletTokens('0xabc');

      expect(result.isDemo).toBe(true);
      expect(result.tokens.length).toBeGreaterThan(0);
      expect(mockClient.getWalletTokens).not.toHaveBeenCalled();
    });

    it('returns demo data when useDemoData is true', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123', useDemoData: true });

      const result = await provider.getWalletTokens('0xabc');

      expect(result.isDemo).toBe(true);
      expect(mockClient.getWalletTokens).not.toHaveBeenCalled();
    });

    it('fetches tokens from DeBank when API key is present', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletTokens.mockResolvedValue([
        makeToken({ symbol: 'ETH', amount: 2, price: 3200 }),
      ]);

      const result = await provider.getWalletTokens('0xabc');

      expect(result.isDemo).toBe(false);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].symbol).toBe('ETH');
      expect(result.tokens[0].amount).toBe(2);
      expect(result.tokens[0].value).toBe(6400);
    });

    it('filters out scam tokens (is_scam flag)', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletTokens.mockResolvedValue([
        makeToken({ symbol: 'ETH', amount: 1, price: 3200 }),
        makeToken({ symbol: 'SCAMCOIN', amount: 1000, price: 0.01, is_scam: true }),
      ]);

      const result = await provider.getWalletTokens('0xabc');

      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].symbol).toBe('ETH');
    });

    it('filters out suspicious tokens (is_suspicious flag)', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletTokens.mockResolvedValue([
        makeToken({ symbol: 'ETH', amount: 1, price: 3200 }),
        makeToken({ symbol: 'SUSCOIN', amount: 100, price: 1, is_suspicious: true }),
      ]);

      const result = await provider.getWalletTokens('0xabc');

      expect(result.tokens).toHaveLength(1);
    });

    it('filters out spam tokens by pattern matching (symbol contains spam pattern)', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletTokens.mockResolvedValue([
        makeToken({ symbol: 'ETH', amount: 1, price: 3200 }),
        makeToken({ symbol: 'SAFEMOON', name: 'SafeMoon', amount: 1000000, price: 0.0001 }),
        makeToken({ symbol: 'AIRDROP123', name: 'Free Airdrop', amount: 500, price: 0.01 }),
        makeToken({ symbol: 'VISIT.COM', name: 'Visit xyz.com', amount: 100, price: 0.1 }),
      ]);

      const result = await provider.getWalletTokens('0xabc');

      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].symbol).toBe('ETH');
    });

    it('filters out dust balances (< $0.01 for priced tokens)', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletTokens.mockResolvedValue([
        makeToken({ symbol: 'ETH', amount: 1, price: 3200 }),
        makeToken({ symbol: 'DUST', amount: 0.000001, price: 1000 }), // $0.001 -- dust
      ]);

      const result = await provider.getWalletTokens('0xabc');

      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].symbol).toBe('ETH');
    });

    it('keeps unpriced tokens (price = 0) even if value is 0', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletTokens.mockResolvedValue([
        makeToken({ symbol: 'ETH', amount: 1, price: 3200 }),
        makeToken({ symbol: 'SYRUP', amount: 100, price: 0, name: 'Maple Finance' }),
      ]);

      const result = await provider.getWalletTokens('0xabc');

      expect(result.tokens).toHaveLength(2);
      expect(result.tokens.find(t => t.symbol === 'SYRUP')).toBeDefined();
    });

    it('filters out tokens with amount <= 0', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletTokens.mockResolvedValue([
        makeToken({ symbol: 'ETH', amount: 1, price: 3200 }),
        makeToken({ symbol: 'ZERO', amount: 0, price: 100 }),
        makeToken({ symbol: 'NEG', amount: -5, price: 100 }),
      ]);

      const result = await provider.getWalletTokens('0xabc');

      expect(result.tokens).toHaveLength(1);
    });

    it('sorts tokens by value descending', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletTokens.mockResolvedValue([
        makeToken({ symbol: 'SMALL', amount: 1, price: 10 }),
        makeToken({ symbol: 'BIG', amount: 10, price: 5000 }),
        makeToken({ symbol: 'MED', amount: 100, price: 50 }),
      ]);

      const result = await provider.getWalletTokens('0xabc');

      expect(result.tokens[0].symbol).toBe('BIG');
      expect(result.tokens[1].symbol).toBe('MED');
      expect(result.tokens[2].symbol).toBe('SMALL');
    });

    it('returns cached result when available', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      const cachedResult = {
        tokens: [{ symbol: 'CACHED', name: 'Cached', amount: 5, price: 100, value: 500, chain: 'eth' }],
        isDemo: false,
      };
      const cacheMod = await import('../utils/cache');
      vi.mocked(cacheMod.getCached).mockReturnValue({ data: cachedResult, age: 60000 });

      const result = await provider.getWalletTokens('0xabc');

      expect(result.tokens[0].symbol).toBe('CACHED');
      expect(mockClient.getWalletTokens).not.toHaveBeenCalled();
    });

    it('bypasses cache when forceRefresh is true', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      const cacheMod = await import('../utils/cache');
      vi.mocked(cacheMod.getCached).mockReturnValue({
        data: { tokens: [], isDemo: false },
        age: 60000,
      });
      mockClient.getWalletTokens.mockResolvedValue([
        makeToken({ symbol: 'FRESH', amount: 1, price: 1000 }),
      ]);

      // Clear getCached call count before this test's action
      vi.mocked(cacheMod.getCached).mockClear();

      const result = await provider.getWalletTokens('0xabc', true);

      expect(result.tokens[0].symbol).toBe('FRESH');
      // forceRefresh=true should skip the cache check entirely
      expect(cacheMod.getCached).not.toHaveBeenCalled();
    });

    it('caches result after successful fetch', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletTokens.mockResolvedValue([
        makeToken({ symbol: 'ETH', amount: 1, price: 3200 }),
      ]);
      const cacheMod = await import('../utils/cache');

      await provider.getWalletTokens('0xabc');

      expect(cacheMod.setCache).toHaveBeenCalledWith(
        'tokens_0xabc',
        expect.objectContaining({ isDemo: false }),
        expect.any(Number)
      );
    });

    it('falls back to demo data on API error', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletTokens.mockRejectedValue(new Error('Network error'));

      const result = await provider.getWalletTokens('0xabc');

      expect(result.isDemo).toBe(true);
      expect(result.error).toBe('Unknown error');
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it('maps token response to WalletBalance format correctly', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletTokens.mockResolvedValue([
        makeToken({
          symbol: 'WBTC',
          name: 'Wrapped Bitcoin',
          amount: 0.5,
          price: 60000,
          chain: 'eth',
          logo_url: 'https://logo.png',
          is_verified: true,
          id: '0xwbtc',
        }),
      ]);

      const result = await provider.getWalletTokens('0xabc');
      const token = result.tokens[0];

      expect(token.symbol).toBe('WBTC');
      expect(token.name).toBe('Wrapped Bitcoin');
      expect(token.amount).toBe(0.5);
      expect(token.price).toBe(60000);
      expect(token.value).toBe(30000);
      expect(token.chain).toBe('eth');
      expect(token.logo).toBe('https://logo.png');
      expect(token.isVerified).toBe(true);
      expect(token.tokenId).toBe('0xwbtc');
    });
  });

  // ─── getWalletProtocols ────────────────────────────────────────────

  describe('getWalletProtocols', () => {
    it('returns demo data when no API key is configured', async () => {
      provider = new WalletProvider({});

      const result = await provider.getWalletProtocols('0xabc');

      expect(result.isDemo).toBe(true);
      expect(result.positions.length).toBeGreaterThan(0);
    });

    it('fetches protocols from DeBank and creates DeFi positions', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletProtocols.mockResolvedValue([
        makeProtocol(),
      ]);

      const result = await provider.getWalletProtocols('0xabc');

      expect(result.isDemo).toBe(false);
      expect(result.positions).toHaveLength(1);
      expect(result.positions[0].protocol).toBe('Aave V3');
      expect(result.positions[0].chain).toBe('eth');
      expect(result.positions[0].tokens).toHaveLength(1);
      expect(result.positions[0].tokens[0].symbol).toBe('WETH');
    });

    it('processes debt tokens (borrow_token_list)', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletProtocols.mockResolvedValue([
        makeProtocol({
          portfolio_item_list: [
            {
              name: 'Lending',
              stats: { asset_usd_value: 5000, debt_usd_value: 2000, net_usd_value: 3000 },
              detail: {
                supply_token_list: [
                  makeToken({ symbol: 'WETH', amount: 1, price: 3200 }),
                ],
                borrow_token_list: [
                  makeToken({ symbol: 'USDC', amount: 2000, price: 1 }),
                ],
              },
            },
          ],
        }),
      ]);

      const result = await provider.getWalletProtocols('0xabc');

      expect(result.positions[0].debtTokens).toBeDefined();
      expect(result.positions[0].debtTokens![0].symbol).toBe('USDC');
      expect(result.positions[0].debtTokens![0].amount).toBe(2000);
    });

    it('aggregates tokens across multiple portfolio items in same protocol', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletProtocols.mockResolvedValue([
        makeProtocol({
          portfolio_item_list: [
            {
              name: 'Pool 1',
              stats: { asset_usd_value: 3200, net_usd_value: 3200 },
              detail: {
                supply_token_list: [
                  makeToken({ symbol: 'WETH', amount: 0.5, price: 3200, chain: 'eth' }),
                ],
              },
            },
            {
              name: 'Pool 2',
              stats: { asset_usd_value: 3200, net_usd_value: 3200 },
              detail: {
                supply_token_list: [
                  makeToken({ symbol: 'WETH', amount: 0.7, price: 3200, chain: 'eth' }),
                ],
              },
            },
          ],
        }),
      ]);

      const result = await provider.getWalletProtocols('0xabc');

      expect(result.positions).toHaveLength(1);
      // 0.5 + 0.7 = 1.2
      expect(result.positions[0].tokens[0].amount).toBeCloseTo(1.2);
    });

    it('handles vesting detail types on tokens', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletProtocols.mockResolvedValue([
        makeProtocol({
          name: 'Sablier V2',
          portfolio_item_list: [
            {
              name: 'Vesting',
              detail_types: ['vesting'],
              stats: { asset_usd_value: 1000, net_usd_value: 1000 },
              detail: {
                supply_token_list: [
                  makeToken({ symbol: 'TOKEN', amount: 1000, price: 1, chain: 'eth' }),
                ],
              },
            },
          ],
        }),
      ]);

      const result = await provider.getWalletProtocols('0xabc');

      expect(result.positions[0].tokens[0].detailTypes).toEqual(['vesting']);
    });

    it('filters spam tokens from protocol positions', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletProtocols.mockResolvedValue([
        makeProtocol({
          portfolio_item_list: [
            {
              name: 'Pool',
              stats: { asset_usd_value: 5000, net_usd_value: 5000 },
              detail: {
                supply_token_list: [
                  makeToken({ symbol: 'ETH', amount: 1, price: 3200 }),
                  makeToken({ symbol: 'SAFEMOON', name: 'SafeMoon', amount: 100, price: 1 }),
                ],
              },
            },
          ],
        }),
      ]);

      const result = await provider.getWalletProtocols('0xabc');

      expect(result.positions[0].tokens).toHaveLength(1);
      expect(result.positions[0].tokens[0].symbol).toBe('ETH');
    });

    it('sorts protocols by value descending', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletProtocols.mockResolvedValue([
        makeProtocol({
          name: 'Small',
          portfolio_item_list: [{
            name: 'Pool',
            stats: { asset_usd_value: 100, net_usd_value: 100 },
            detail: { supply_token_list: [makeToken({ symbol: 'A', amount: 1, price: 100 })] },
          }],
        }),
        makeProtocol({
          name: 'Big',
          portfolio_item_list: [{
            name: 'Pool',
            stats: { asset_usd_value: 10000, net_usd_value: 10000 },
            detail: { supply_token_list: [makeToken({ symbol: 'B', amount: 10, price: 1000 })] },
          }],
        }),
      ]);

      const result = await provider.getWalletProtocols('0xabc');

      expect(result.positions[0].protocol).toBe('Big');
      expect(result.positions[1].protocol).toBe('Small');
    });

    it('returns cached protocols when available', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      const cachedResult = {
        positions: [{ protocol: 'Cached', chain: 'eth', type: 'DeFi', value: 999, tokens: [] }],
        isDemo: false,
      };
      const cacheMod = await import('../utils/cache');
      vi.mocked(cacheMod.getCached).mockReturnValue({ data: cachedResult, age: 30000 });

      const result = await provider.getWalletProtocols('0xabc');

      expect(result.positions[0].protocol).toBe('Cached');
      expect(mockClient.getWalletProtocols).not.toHaveBeenCalled();
    });

    it('falls back to demo data on API error', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      mockClient.getWalletProtocols.mockRejectedValue(new Error('API down'));

      const result = await provider.getWalletProtocols('0xabc');

      expect(result.isDemo).toBe(true);
      expect(result.error).toBe('Unknown error');
    });
  });

  // ─── isSolanaAddress (tested via fetchAllWalletPositions routing) ──

  describe('isSolanaAddress (via fetchAllWalletPositions)', () => {
    beforeEach(() => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
      // Stub both DeBank methods since EVM wallets call them
      mockClient.getWalletTokens.mockResolvedValue([]);
      mockClient.getWalletProtocols.mockResolvedValue([]);
    });

    it('routes 0x addresses to EVM path', async () => {
      const accounts: Account[] = [
        makeWalletAccount({ id: 'w1', address: '0xAbcD1234567890abcdef1234567890abcdef1234', name: 'EVM', chains: ['eth'] }),
      ];

      await provider.fetchAllWalletPositions(accounts);

      // DeBank should be called for EVM wallet
      expect(mockClient.getWalletProtocols).toHaveBeenCalled();
    });

    it('returns empty for wallets with no supported address type', async () => {
      const accounts: Account[] = [
        makeWalletAccount({ id: 'w1', address: 'bc1qnonsensebitcoinaddress', name: 'BTC', chains: ['btc'] }),
      ];

      const result = await provider.fetchAllWalletPositions(accounts);

      expect(result.positions).toHaveLength(0);
      expect(mockClient.getWalletTokens).not.toHaveBeenCalled();
    });

    it('returns empty result when wallet list is empty', async () => {
      const result = await provider.fetchAllWalletPositions([]);

      expect(result.positions).toEqual([]);
      expect(result.prices).toEqual({});
    });
  });

  // ─── fetchAllWalletPositions ───────────────────────────────────────

  describe('fetchAllWalletPositions', () => {
    beforeEach(() => {
      provider = new WalletProvider({ debankApiKey: 'key123' });
    });

    it('converts wallet tokens to Position objects with correct fields', async () => {
      mockClient.getWalletProtocols.mockResolvedValue([]);
      mockClient.getWalletTokens.mockResolvedValue([
        makeToken({ symbol: 'ETH', name: 'Ethereum', amount: 2, price: 3200, chain: 'eth' }),
      ]);
      const accounts: Account[] = [
        makeWalletAccount({ id: 'w1', address: '0xABCD', name: 'Main', chains: ['eth'] }),
      ];

      const result = await provider.fetchAllWalletPositions(accounts);

      expect(result.positions).toHaveLength(1);
      const pos = result.positions[0];
      expect(pos.type).toBe('crypto');
      expect(pos.symbol).toBe('ETH');
      expect(pos.name).toBe('Ethereum');
      expect(pos.amount).toBe(2);
      expect(pos.accountId).toBe('w1');
      expect(pos.chain).toBe('eth');
      expect(pos.debankPriceKey).toBe('debank-eth-eth');
    });

    it('includes DeBank price data in returned prices', async () => {
      mockClient.getWalletProtocols.mockResolvedValue([]);
      mockClient.getWalletTokens.mockResolvedValue([
        makeToken({ symbol: 'ETH', amount: 2, price: 3200, chain: 'eth' }),
      ]);
      const accounts: Account[] = [
        makeWalletAccount({ id: 'w1', address: '0xABCD', name: 'Main', chains: ['eth'] }),
      ];

      const result = await provider.fetchAllWalletPositions(accounts);

      expect(result.prices['debank-eth-eth']).toEqual({ price: 3200, symbol: 'ETH' });
    });

    it('includes protocol positions with debt marked as isDebt', async () => {
      mockClient.getWalletProtocols.mockResolvedValue([
        makeProtocol({
          name: 'Aave',
          chain: 'eth',
          portfolio_item_list: [{
            name: 'Lending',
            stats: { asset_usd_value: 5000, debt_usd_value: 2000, net_usd_value: 3000 },
            detail: {
              supply_token_list: [makeToken({ symbol: 'WETH', amount: 1, price: 3200, chain: 'eth' })],
              borrow_token_list: [makeToken({ symbol: 'USDC', amount: 2000, price: 1, chain: 'eth' })],
            },
          }],
        }),
      ]);
      mockClient.getWalletTokens.mockResolvedValue([]);
      const accounts: Account[] = [
        makeWalletAccount({ id: 'w1', address: '0xABCD', name: 'Main', chains: ['eth'] }),
      ];

      const result = await provider.fetchAllWalletPositions(accounts);

      const debtPos = result.positions.find(p => p.isDebt);
      expect(debtPos).toBeDefined();
      expect(debtPos!.symbol).toBe('USDC');
      expect(debtPos!.isDebt).toBe(true);
      expect(debtPos!.name).toContain('Debt');

      const supplyPos = result.positions.find(p => p.symbol === 'WETH');
      expect(supplyPos).toBeDefined();
      expect(supplyPos!.isDebt).toBeUndefined();
    });
  });

  // ─── getSolanaWalletTokens ─────────────────────────────────────────

  describe('getSolanaWalletTokens', () => {
    it('returns error when no Solana API keys configured', async () => {
      provider = new WalletProvider({ debankApiKey: 'key123' });

      const result = await provider.getSolanaWalletTokens('SoLAnaAddr1234567890abcdef1234567890abcd');

      expect(result.tokens).toHaveLength(0);
      expect(result.isDemo).toBe(false);
      expect(result.error).toContain('No Solana API key configured');
    });

    it('uses Helius API as primary provider', async () => {
      provider = new WalletProvider({ heliusApiKey: 'helius-key' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { symbol: 'SOL', name: 'Solana', amount: 10, price: 150, value: 1500 },
        ]),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await provider.getSolanaWalletTokens('SoLAnaAddr1234567890abcdef1234567890abcd');

      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].symbol).toBe('SOL');
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/solana/tokens'));
    });

    it('falls back to Birdeye when Helius returns no tokens', async () => {
      provider = new WalletProvider({ heliusApiKey: 'helius-key', birdeyeApiKey: 'birdeye-key' });
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (url.includes('/api/solana/tokens')) {
          // Helius returns empty
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }
        if (url.includes('/api/solana/birdeye')) {
          // Birdeye returns data
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([
              { symbol: 'SOL', name: 'Solana', amount: 10, price: 150, value: 1500 },
            ]),
          });
        }
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await provider.getSolanaWalletTokens('SoLAnaAddr1234567890abcdef1234567890abcd');

      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].symbol).toBe('SOL');
      expect(callCount).toBe(2); // Both Helius and Birdeye were called
    });

    it('falls back to Birdeye when Helius fails', async () => {
      provider = new WalletProvider({ heliusApiKey: 'helius-key', birdeyeApiKey: 'birdeye-key' });
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/solana/tokens')) {
          return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'rate limited' }) });
        }
        if (url.includes('/api/solana/birdeye')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([
              { symbol: 'JUP', name: 'Jupiter', amount: 500, price: 2, value: 1000 },
            ]),
          });
        }
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await provider.getSolanaWalletTokens('SoLAnaAddr1234567890abcdef1234567890abcd');

      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].symbol).toBe('JUP');
    });

    it('filters spam tokens from Solana results', async () => {
      provider = new WalletProvider({ heliusApiKey: 'helius-key' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { symbol: 'SOL', name: 'Solana', amount: 10, price: 150, value: 1500 },
          { symbol: 'CLAIM', name: 'Claim your prize', amount: 9999, price: 0, value: 0 },
        ]),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await provider.getSolanaWalletTokens('SoLAnaAddr1234567890abcdef1234567890abcd');

      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].symbol).toBe('SOL');
    });

    it('caches Solana tokens when fetch succeeds', async () => {
      provider = new WalletProvider({ heliusApiKey: 'helius-key' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { symbol: 'SOL', name: 'Solana', amount: 10, price: 150, value: 1500 },
        ]),
      });
      vi.stubGlobal('fetch', mockFetch);
      const cacheMod = await import('../utils/cache');

      await provider.getSolanaWalletTokens('SoLAnaAddr1234567890abcdef1234567890abcd');

      expect(cacheMod.setCache).toHaveBeenCalledWith(
        expect.stringContaining('solana_tokens_'),
        expect.any(Object),
        expect.any(Number),
      );
    });

    it('does not cache when no tokens found', async () => {
      provider = new WalletProvider({ heliusApiKey: 'helius-key' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      vi.stubGlobal('fetch', mockFetch);
      const cacheMod = await import('../utils/cache');

      await provider.getSolanaWalletTokens('SoLAnaAddr1234567890abcdef1234567890abcd');

      expect(cacheMod.setCache).not.toHaveBeenCalled();
    });
  });

  // ─── updateConfig ──────────────────────────────────────────────────

  describe('updateConfig', () => {
    it('merges new config with existing config', async () => {
      provider = new WalletProvider({ debankApiKey: 'old-key' });

      provider.updateConfig({ debankApiKey: 'new-key' });

      mockClient.getWalletTokens.mockResolvedValue([makeToken()]);
      await provider.getWalletTokens('0xabc');

      // Should call DeBank (not demo) since key is present
      expect(mockClient.getWalletTokens).toHaveBeenCalled();
    });
  });
});
