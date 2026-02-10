import { PerpExchangeService } from './perp-exchange-service';
import type { Wallet } from '@/types';

// Mock the provider singletons (they are imported by perp-exchange-service)
vi.mock('../providers/hyperliquid-provider', () => ({
  getHyperliquidProvider: vi.fn(() => ({ fetchPositions: vi.fn() })),
}));
vi.mock('../providers/lighter-provider', () => ({
  getLighterProvider: vi.fn(() => ({ fetchPositions: vi.fn() })),
}));
vi.mock('../providers/ethereal-provider', () => ({
  getEtherealProvider: vi.fn(() => ({ fetchPositions: vi.fn() })),
}));

function makeWallet(overrides?: Partial<Wallet>): Wallet {
  return {
    id: 'wallet-1',
    address: '0xabc',
    name: 'Test Wallet',
    chains: ['eth'],
    addedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('PerpExchangeService', () => {
  let service: PerpExchangeService;

  beforeEach(() => {
    service = new PerpExchangeService();
  });

  describe('getSupportedExchanges', () => {
    it('returns all three supported exchanges', () => {
      const exchanges = service.getSupportedExchanges();

      expect(exchanges).toHaveLength(3);
      const ids = exchanges.map(e => e.id);
      expect(ids).toContain('hyperliquid');
      expect(ids).toContain('lighter');
      expect(ids).toContain('ethereal');
    });

    it('each exchange has name, color, and description', () => {
      const exchanges = service.getSupportedExchanges();

      for (const exchange of exchanges) {
        expect(exchange.name).toBeTruthy();
        expect(exchange.color).toBeTruthy();
        expect(exchange.description).toBeTruthy();
      }
    });
  });

  describe('getExchangeInfo', () => {
    it('returns metadata for a known exchange', () => {
      const info = service.getExchangeInfo('hyperliquid');

      expect(info).toBeDefined();
      expect(info!.name).toBe('Hyperliquid');
      expect(info!.color).toBe('#00D1FF');
      expect(info!.description).toBeTruthy();
    });

    it('returns undefined for unknown exchange', () => {
      const info = service.getExchangeInfo('unknown' as never);
      expect(info).toBeUndefined();
    });
  });

  describe('getExchangeName', () => {
    it('returns display name for known exchange', () => {
      expect(service.getExchangeName('lighter')).toBe('Lighter');
      expect(service.getExchangeName('ethereal')).toBe('Ethereal');
    });

    it('falls back to id for unknown exchange', () => {
      expect(service.getExchangeName('unknown' as never)).toBe('unknown');
    });
  });

  describe('isValidExchange', () => {
    it('returns true for valid exchange ids', () => {
      expect(service.isValidExchange('hyperliquid')).toBe(true);
      expect(service.isValidExchange('lighter')).toBe(true);
      expect(service.isValidExchange('ethereal')).toBe(true);
    });

    it('returns false for invalid exchange ids', () => {
      expect(service.isValidExchange('binance')).toBe(false);
      expect(service.isValidExchange('')).toBe(false);
      expect(service.isValidExchange('HYPERLIQUID')).toBe(false);
    });
  });

  describe('hasEnabledExchanges', () => {
    it('returns true when wallet has perpExchanges', () => {
      const wallet = makeWallet({ perpExchanges: ['hyperliquid', 'lighter'] });
      expect(service.hasEnabledExchanges(wallet)).toBe(true);
    });

    it('returns false when wallet has empty perpExchanges', () => {
      const wallet = makeWallet({ perpExchanges: [] });
      expect(service.hasEnabledExchanges(wallet)).toBe(false);
    });

    it('returns false when wallet has no perpExchanges field', () => {
      const wallet = makeWallet();
      delete wallet.perpExchanges;
      expect(service.hasEnabledExchanges(wallet)).toBe(false);
    });
  });

  describe('getWalletExchanges', () => {
    it('returns the list of enabled exchanges for a wallet', () => {
      const wallet = makeWallet({ perpExchanges: ['hyperliquid', 'ethereal'] });
      expect(service.getWalletExchanges(wallet)).toEqual(['hyperliquid', 'ethereal']);
    });

    it('returns empty array when no perpExchanges set', () => {
      const wallet = makeWallet();
      delete wallet.perpExchanges;
      expect(service.getWalletExchanges(wallet)).toEqual([]);
    });
  });
});
