import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  HyperliquidClearinghouseState,
  HyperliquidSpotState,
} from '../api/hyperliquid-api';

const mockClient = {
  getClearinghouseState: vi.fn<[string], Promise<HyperliquidClearinghouseState | null>>(),
  getSpotClearinghouseState: vi.fn<[string], Promise<HyperliquidSpotState | null>>(),
  getAllMids: vi.fn<[], Promise<Record<string, string>>>(),
};

vi.mock('../api/hyperliquid-api', () => ({
  getHyperliquidApiClient: () => mockClient,
}));

import { HyperliquidProvider } from './hyperliquid-provider';

const CHECKSUM_ADDRESS = `0x${'2'.repeat(40)}`;

const makeClearinghouseState = (): HyperliquidClearinghouseState => ({
  assetPositions: [
    {
      type: 'perp',
      position: {
        coin: 'BTC',
        entryPx: null,
        leverage: { type: 'cross', value: 1 },
        liquidationPx: null,
        marginUsed: '0',
        maxLeverage: 1,
        positionValue: '30000',
        returnOnEquity: '0',
        szi: '1',
        unrealizedPnl: '0',
        cumFunding: {
          allTime: '0',
          sinceChange: '0',
          sinceOpen: '0',
        },
      },
    },
  ],
  crossMaintenanceMarginUsed: '0',
  crossMarginSummary: {
    accountValue: '100',
    totalMarginUsed: '0',
    totalNtlPos: '0',
    totalRawUsd: '0',
  },
  marginSummary: {
    accountValue: '100',
    totalMarginUsed: '0',
    totalNtlPos: '0',
    totalRawUsd: '0',
  },
  time: Date.now(),
  withdrawable: '0',
});

const makeSpotState = (): HyperliquidSpotState => ({
  balances: [
    {
      coin: 'USDC',
      token: 0,
      hold: '0',
      total: '50',
      entryNtl: '0',
    },
  ],
});

describe('HyperliquidProvider', () => {
  beforeEach(() => {
    mockClient.getClearinghouseState.mockReset();
    mockClient.getSpotClearinghouseState.mockReset();
    mockClient.getAllMids.mockReset();
  });

  it('builds positions without throwing when processing perps', async () => {
    mockClient.getClearinghouseState.mockResolvedValue(makeClearinghouseState());
    mockClient.getSpotClearinghouseState.mockResolvedValue(makeSpotState());
    mockClient.getAllMids.mockResolvedValue({
      BTC: '30000',
      'BTC/USDC': '30000',
      USDC: '1',
    });

    const provider = new HyperliquidProvider();
    const result = await provider.fetchPositions(CHECKSUM_ADDRESS, 'wallet-1');

    expect(result.positions.length).toBeGreaterThan(0);
    expect(result.positions.some(p => p.protocol === 'Hyperliquid')).toBe(true);
  });
});
