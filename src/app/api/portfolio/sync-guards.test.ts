import { describe, it, expect } from 'vitest';
import {
  guardTotalWipe,
  guardPartialLoss,
  guardDebtLoss,
  runSyncGuards,
} from './sync-guards';
import type { PortfolioData } from './db-store';
import { makePosition, makeDebtPosition, resetPositionCounter } from '@/__tests__/fixtures';

// Helper: build a minimal PortfolioData with N positions
function makePortfolioData(
  positions: PortfolioData['positions'] = [],
  accounts: PortfolioData['accounts'] = [],
): PortfolioData {
  return {
    positions,
    accounts,
    prices: {},
    customPrices: {},
    fxRates: {},
    transactions: [],
    snapshots: [],
    lastRefresh: null,
    hideBalances: false,
    hideDust: false,
    riskFreeRate: 0.05,
  };
}

function makeNPositions(n: number) {
  return Array.from({ length: n }, () => makePosition());
}

beforeEach(() => {
  resetPositionCounter();
});

// ---------------------------------------------------------------------------
// guardTotalWipe
// ---------------------------------------------------------------------------
describe('guardTotalWipe', () => {
  it('blocks when incoming has 0 positions and 0 accounts but existing has data', () => {
    const existing = makePortfolioData(makeNPositions(100));
    const incoming = makePortfolioData([], []);

    const result = guardTotalWipe(existing, incoming);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('0 positions');
    expect(result.reason).toContain('0 accounts');
  });

  it('allows when existing is also empty', () => {
    const existing = makePortfolioData([]);
    const incoming = makePortfolioData([]);

    expect(guardTotalWipe(existing, incoming).allowed).toBe(true);
  });

  it('allows when incoming has positions even if fewer', () => {
    const existing = makePortfolioData(makeNPositions(100));
    const incoming = makePortfolioData(makeNPositions(1));

    expect(guardTotalWipe(existing, incoming).allowed).toBe(true);
  });

  it('allows when incoming has 0 positions but has accounts', () => {
    const existing = makePortfolioData(makeNPositions(100));
    const incoming = makePortfolioData([], [{
      id: 'a1', name: 'test', isActive: true,
      connection: { dataSource: 'manual' as const },
      addedAt: '2024-01-01',
    }]);

    expect(guardTotalWipe(existing, incoming).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// guardPartialLoss
// ---------------------------------------------------------------------------
describe('guardPartialLoss', () => {
  it('blocks when positions drop below 50% threshold', () => {
    const existing = makePortfolioData(makeNPositions(100));
    const incoming = makePortfolioData(makeNPositions(30));

    const result = guardPartialLoss(existing, incoming);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('100');
    expect(result.reason).toContain('30');
    expect(result.reason).toContain('30%');
  });

  it('blocks at exactly 39% (below threshold)', () => {
    const existing = makePortfolioData(makeNPositions(100));
    const incoming = makePortfolioData(makeNPositions(39));

    expect(guardPartialLoss(existing, incoming).allowed).toBe(false);
  });

  it('allows at exactly 50% (at threshold)', () => {
    const existing = makePortfolioData(makeNPositions(100));
    const incoming = makePortfolioData(makeNPositions(50));

    expect(guardPartialLoss(existing, incoming).allowed).toBe(true);
  });

  it('allows at 51% (above threshold)', () => {
    const existing = makePortfolioData(makeNPositions(100));
    const incoming = makePortfolioData(makeNPositions(51));

    expect(guardPartialLoss(existing, incoming).allowed).toBe(true);
  });

  it('allows when incoming has more positions than existing', () => {
    const existing = makePortfolioData(makeNPositions(100));
    const incoming = makePortfolioData(makeNPositions(200));

    expect(guardPartialLoss(existing, incoming).allowed).toBe(true);
  });

  it('skips guard when existing has fewer than 10 positions', () => {
    const existing = makePortfolioData(makeNPositions(9));
    const incoming = makePortfolioData(makeNPositions(1));

    // 1/9 = 11% — would fail threshold, but guard doesn't apply to small DBs
    expect(guardPartialLoss(existing, incoming).allowed).toBe(true);
  });

  it('applies guard at exactly 10 existing positions', () => {
    const existing = makePortfolioData(makeNPositions(10));
    const incoming = makePortfolioData(makeNPositions(3));

    // 3/10 = 30% — below threshold, guard should block
    expect(guardPartialLoss(existing, incoming).allowed).toBe(false);
  });

  it('allows when both are empty', () => {
    const existing = makePortfolioData([]);
    const incoming = makePortfolioData([]);

    expect(guardPartialLoss(existing, incoming).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// guardDebtLoss
// ---------------------------------------------------------------------------
describe('guardDebtLoss', () => {
  it('blocks when all debt positions are lost', () => {
    const existing = makePortfolioData([
      ...makeNPositions(50),
      makeDebtPosition({ symbol: 'USDC', amount: 100000 }),
      makeDebtPosition({ symbol: 'ETH', amount: 5 }),
    ]);
    const incoming = makePortfolioData(makeNPositions(50));

    const result = guardDebtLoss(existing, incoming);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('2 debt positions');
    expect(result.reason).toContain('liabilities');
  });

  it('allows when debt positions are preserved', () => {
    const debt = makeDebtPosition({ id: 'debt-1' });
    const existing = makePortfolioData([...makeNPositions(10), debt]);
    const incoming = makePortfolioData([...makeNPositions(10), debt]);

    expect(guardDebtLoss(existing, incoming).allowed).toBe(true);
  });

  it('allows when existing has no debt positions', () => {
    const existing = makePortfolioData(makeNPositions(50));
    const incoming = makePortfolioData(makeNPositions(30));

    expect(guardDebtLoss(existing, incoming).allowed).toBe(true);
  });

  it('allows when incoming has fewer debts but not zero', () => {
    const existing = makePortfolioData([
      makeDebtPosition({ id: 'd1' }),
      makeDebtPosition({ id: 'd2' }),
      makeDebtPosition({ id: 'd3' }),
    ]);
    const incoming = makePortfolioData([
      makeDebtPosition({ id: 'd1' }),
    ]);

    // Still has at least one debt — allowed (partial loss of debts is okay, total is not)
    expect(guardDebtLoss(existing, incoming).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runSyncGuards (integration of all guards)
// ---------------------------------------------------------------------------
describe('runSyncGuards', () => {
  it('allows a normal sync with similar position counts', () => {
    const existing = makePortfolioData(makeNPositions(100));
    const incoming = makePortfolioData(makeNPositions(105));

    expect(runSyncGuards(existing, incoming).allowed).toBe(true);
  });

  it('blocks total wipe (first guard to fail)', () => {
    const existing = makePortfolioData(makeNPositions(100));
    const incoming = makePortfolioData([]);

    const result = runSyncGuards(existing, incoming);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('0 positions');
  });

  it('blocks partial loss even when other guards pass', () => {
    // No debts, so debt guard passes. But 20/100 = 20% triggers partial loss.
    const existing = makePortfolioData(makeNPositions(100));
    const incoming = makePortfolioData(makeNPositions(20));

    const result = runSyncGuards(existing, incoming);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('position count would drop');
  });

  it('blocks debt loss even when position count is fine', () => {
    const existing = makePortfolioData([
      ...makeNPositions(100),
      makeDebtPosition(),
    ]);
    // Same count (101), but no debts
    const incoming = makePortfolioData(makeNPositions(101));

    const result = runSyncGuards(existing, incoming);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('debt');
  });

  it('allows sync from empty to populated (fresh setup)', () => {
    const existing = makePortfolioData([]);
    const incoming = makePortfolioData(makeNPositions(500));

    expect(runSyncGuards(existing, incoming).allowed).toBe(true);
  });

  it('reproduces the exact bug scenario: 688 → 270 positions with debts lost', () => {
    const existing = makePortfolioData([
      ...makeNPositions(681),
      makeDebtPosition({ symbol: 'USDC', amount: 89294, protocol: 'Morpho' }),
      makeDebtPosition({ symbol: 'USDC', amount: 241636, protocol: 'Morpho' }),
      makeDebtPosition({ symbol: 'USDC', amount: 191318, protocol: 'Morpho' }),
      makeDebtPosition({ symbol: 'USDC', amount: 0.92, protocol: 'ZeroLend' }),
      makeDebtPosition({ symbol: 'USDe', amount: 102997, protocol: 'Euler' }),
      makeDebtPosition({ symbol: 'EURe', amount: 7523, protocol: 'Aave V3' }),
      makeDebtPosition({ symbol: 'ETH', amount: 0.000006, protocol: 'Rari Capital' }),
    ]);
    const incoming = makePortfolioData(makeNPositions(270));

    const result = runSyncGuards(existing, incoming);

    expect(result.allowed).toBe(false);
    // Should be caught by partial loss (270/688 = 39%)
    expect(result.reason).toContain('position count would drop');
  });
});
