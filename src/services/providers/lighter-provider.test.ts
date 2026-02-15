import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LighterAccount, LighterAssetDetails } from '../api/lighter-api';

const mockClient = {
  getAssetDetails: vi.fn<[], Promise<LighterAssetDetails[]>>(),
  getAccountsByL1Address: vi.fn<[string], Promise<LighterAccount[]>>(),
  getAccountByAddress: vi.fn<[string], Promise<LighterAccount | null>>(),
};

vi.mock('../api/lighter-api', () => ({
  getLighterApiClient: () => mockClient,
}));

import { LighterProvider } from './lighter-provider';

const CHECKSUM_ADDRESS = `0x${'1'.repeat(40)}`;

const makeAccount = (): LighterAccount => ({
  index: 176991,
  l1_address: CHECKSUM_ADDRESS,
  collateral: '100',
  available_balance: '50',
  total_asset_value: '150',
  positions: [
    {
      market_id: 1,
      symbol: 'BTC-PERP',
      position: '1',
      sign: 1,
      avg_entry_price: '30000',
      position_value: '30000',
      unrealized_pnl: '0',
      realized_pnl: '0',
      liquidation_price: '10000',
      allocated_margin: '50',
      margin_mode: 'cross',
    },
  ],
  assets: [
    {
      symbol: 'BTC',
      asset_id: 1,
      balance: '0.5',
      locked_balance: '0',
    },
  ],
});

describe('LighterProvider', () => {
  beforeEach(() => {
    mockClient.getAssetDetails.mockReset();
    mockClient.getAccountsByL1Address.mockReset();
    mockClient.getAccountByAddress.mockReset();
  });

  it('builds positions without throwing when processing accounts', async () => {
    mockClient.getAssetDetails.mockResolvedValue([
      {
        asset_id: 1,
        symbol: 'BTC',
        decimals: 8,
        l1_address: CHECKSUM_ADDRESS,
        index_price: '30000',
        margin_mode: 'cross',
      },
    ]);
    mockClient.getAccountsByL1Address.mockResolvedValue([makeAccount()]);

    const provider = new LighterProvider();
    const result = await provider.fetchPositions(CHECKSUM_ADDRESS, 'wallet-1');

    expect(result.positions.length).toBeGreaterThan(0);
    expect(result.positions.some(p => p.protocol === 'Lighter')).toBe(true);
  });
});
