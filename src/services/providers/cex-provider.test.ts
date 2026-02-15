import { fetchCexAccountPositions, fetchAllCexPositions } from './cex-provider';
import type { Account, CexExchange } from '@/types';

// Mock uuid to return deterministic IDs
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234'),
}));

function makeAccount(overrides: Partial<Account> & { exchange?: CexExchange; apiKey?: string; apiSecret?: string; apiPassphrase?: string } = {}): Account {
  return {
    id: overrides.id || 'acc-1',
    name: overrides.name || 'My Binance',
    isActive: overrides.isActive ?? true,
    connection: {
      dataSource: (overrides.exchange || 'binance') as CexExchange,
      apiKey: overrides.apiKey ?? 'api-key-123',
      apiSecret: overrides.apiSecret ?? 'api-secret-456',
      apiPassphrase: overrides.apiPassphrase,
    },
    addedAt: new Date().toISOString(),
  };
}

function makeBinanceResponse(balances: { asset: string; free: string; locked: string }[]) {
  return {
    balances,
    canTrade: true,
    accountType: 'SPOT',
  };
}

function makeCoinbaseResponse(accounts: { currency: string; balance?: string; available?: string; hold?: string }[]) {
  return {
    accounts: accounts.map((account, idx) => ({
      uuid: `acct-${idx + 1}`,
      currency: account.currency,
      available_balance: {
        value: account.available ?? account.balance ?? '0',
        currency: account.currency,
      },
      hold: {
        value: account.hold ?? '0',
        currency: account.currency,
      },
    })),
  };
}

describe('CEX Provider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  // ─── fetchCexAccountPositions ─────────────────────────────────────

  describe('fetchCexAccountPositions', () => {
    it('returns empty array for inactive accounts', async () => {
      const result = await fetchCexAccountPositions(makeAccount({ isActive: false }));

      expect(result).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('fetches Binance balances and creates positions', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeBinanceResponse([
          { asset: 'BTC', free: '0.5', locked: '0.1' },
          { asset: 'ETH', free: '10', locked: '0' },
        ])),
      } as Response);

      const result = await fetchCexAccountPositions(makeAccount());

      expect(result).toHaveLength(2);

      const btcPos = result.find(p => p.symbol === 'btc');
      expect(btcPos).toBeDefined();
      expect(btcPos!.amount).toBe(0.6); // 0.5 free + 0.1 locked
      expect(btcPos!.name).toBe('Bitcoin');
      expect(btcPos!.type).toBe('crypto');
      expect(btcPos!.chain).toBe('binance');
      expect(btcPos!.accountId).toBe('acc-1');

      const ethPos = result.find(p => p.symbol === 'eth');
      expect(ethPos).toBeDefined();
      expect(ethPos!.amount).toBe(10);
      expect(ethPos!.name).toBe('Ethereum');
    });

    it('filters out zero balance assets', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeBinanceResponse([
          { asset: 'BTC', free: '0.5', locked: '0' },
          { asset: 'DOGE', free: '0', locked: '0' },
          { asset: 'ADA', free: '0.00', locked: '0.00' },
        ])),
      } as Response);

      const result = await fetchCexAccountPositions(makeAccount());

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('btc');
    });

    it('maps common asset names correctly', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeBinanceResponse([
          { asset: 'BTC', free: '1', locked: '0' },
          { asset: 'SOL', free: '100', locked: '0' },
          { asset: 'LINK', free: '50', locked: '0' },
        ])),
      } as Response);

      const result = await fetchCexAccountPositions(makeAccount());

      expect(result.find(p => p.symbol === 'btc')!.name).toBe('Bitcoin');
      expect(result.find(p => p.symbol === 'sol')!.name).toBe('Solana');
      expect(result.find(p => p.symbol === 'link')!.name).toBe('Chainlink');
    });

    it('uses symbol as name for unmapped assets', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeBinanceResponse([
          { asset: 'OBSCURECOIN', free: '999', locked: '0' },
        ])),
      } as Response);

      const result = await fetchCexAccountPositions(makeAccount());

      expect(result[0].name).toBe('OBSCURECOIN');
      expect(result[0].symbol).toBe('obscurecoin');
    });

    it('sends POST request with correct body', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeBinanceResponse([])),
      } as Response);

      const account = makeAccount({ apiKey: 'my-key', apiSecret: 'my-secret' });
      await fetchCexAccountPositions(account);

      expect(fetch).toHaveBeenCalledWith('/api/cex/binance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: 'my-key',
          apiSecret: 'my-secret',
          endpoint: 'account',
        }),
      });
    });

    it('throws on Binance API error', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid API key' }),
      } as unknown as Response);

      await expect(fetchCexAccountPositions(makeAccount())).rejects.toThrow('Invalid API key');
    });

    it('returns empty for unimplemented exchanges (kraken, okx)', async () => {
      for (const exchange of ['kraken', 'okx'] as const) {
        const result = await fetchCexAccountPositions(makeAccount({ exchange }));
        expect(result).toEqual([]);
      }
      expect(fetch).not.toHaveBeenCalled();
    });

    it('fetches Coinbase balances and creates positions', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeCoinbaseResponse([
          { currency: 'BTC', balance: '0.5' },
          { currency: 'ETH', available: '1.2', hold: '0.3' },
          { currency: 'DOGE', balance: '0' },
        ])),
      } as Response);

      const result = await fetchCexAccountPositions(makeAccount({
        exchange: 'coinbase',
      }));

      expect(result).toHaveLength(2);
      const btcPos = result.find(p => p.symbol === 'btc');
      expect(btcPos).toBeDefined();
      expect(btcPos!.amount).toBe(0.5);
      expect(btcPos!.chain).toBe('coinbase');

      const ethPos = result.find(p => p.symbol === 'eth');
      expect(ethPos).toBeDefined();
      expect(ethPos!.amount).toBeCloseTo(1.5, 6);
    });

    it('uses balance total when available/hold are zero', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          accounts: [
            {
              uuid: 'acct-1',
              currency: 'USDC',
              available_balance: { value: '0', currency: 'USDC' },
              hold: { value: '0', currency: 'USDC' },
              balance: { value: '42.5', currency: 'USDC' },
            },
          ],
        }),
      } as Response);

      const result = await fetchCexAccountPositions(makeAccount({
        exchange: 'coinbase',
      }));

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('usdc');
      expect(result[0].amount).toBe(42.5);
    });

    it('throws when Coinbase private key is missing', async () => {
      await expect(fetchCexAccountPositions(makeAccount({
        exchange: 'coinbase',
        apiSecret: '',
      }))).rejects.toThrow('Missing Coinbase private key');
    });

    it('sends POST request with correct Coinbase body', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeCoinbaseResponse([])),
      } as Response);

      await fetchCexAccountPositions(makeAccount({
        exchange: 'coinbase',
        apiKey: 'cb-key',
        apiSecret: 'cb-private-key',
      }));

      expect(fetch).toHaveBeenCalledWith('/api/cex/coinbase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: 'cb-key',
          apiSecret: 'cb-private-key',
          endpoint: 'accounts',
        }),
      });
    });

    it('throws on Coinbase API error', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      } as unknown as Response);

      await expect(fetchCexAccountPositions(makeAccount({
        exchange: 'coinbase',
      }))).rejects.toThrow('Unauthorized');
    });

    it('sets accountId field to account id', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeBinanceResponse([
          { asset: 'BTC', free: '1', locked: '0' },
        ])),
      } as Response);

      const result = await fetchCexAccountPositions(makeAccount({ id: 'acc-42', exchange: 'binance' }));

      expect(result[0].accountId).toBe('acc-42');
    });
  });

  // ─── fetchAllCexPositions ─────────────────────────────────────────

  describe('fetchAllCexPositions', () => {
    it('returns empty for no accounts', async () => {
      const result = await fetchAllCexPositions([]);
      expect(result).toEqual([]);
    });

    it('skips inactive accounts', async () => {
      const result = await fetchAllCexPositions([
        makeAccount({ isActive: false }),
      ]);

      expect(result).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('aggregates positions from multiple accounts', async () => {
      vi.mocked(fetch).mockImplementation((_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string);
        if (body.apiKey === 'key-1') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(makeBinanceResponse([
              { asset: 'BTC', free: '1', locked: '0' },
            ])),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeBinanceResponse([
            { asset: 'ETH', free: '5', locked: '0' },
          ])),
        } as Response);
      });

      const result = await fetchAllCexPositions([
        makeAccount({ id: 'a1', apiKey: 'key-1' }),
        makeAccount({ id: 'a2', apiKey: 'key-2' }),
      ]);

      expect(result).toHaveLength(2);
      expect(result.map(p => p.symbol).sort()).toEqual(['btc', 'eth']);
    });

    it('isolates errors -- one account failure does not block others', async () => {
      let callCount = 0;
      vi.mocked(fetch).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: 'first account fails' }),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeBinanceResponse([
            { asset: 'SOL', free: '100', locked: '0' },
          ])),
        } as Response);
      });

      const result = await fetchAllCexPositions([
        makeAccount({ id: 'fail', apiKey: 'bad' }),
        makeAccount({ id: 'ok', apiKey: 'good' }),
      ]);

      // Second account still returns its positions
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('sol');
    });

    it('continues when a Coinbase account is missing private key', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeBinanceResponse([
          { asset: 'BTC', free: '1', locked: '0' },
        ])),
      } as Response);

      const result = await fetchAllCexPositions([
        makeAccount({ id: 'cb-1', exchange: 'coinbase', apiSecret: '' }),
        makeAccount({ id: 'bn-1', exchange: 'binance', apiKey: 'key-1' }),
      ]);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0].accountId).toBe('bn-1');
      expect(result[0].symbol).toBe('btc');
    });
  });
});
