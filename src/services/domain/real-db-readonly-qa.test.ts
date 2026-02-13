import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { readDb } from '@/app/api/portfolio/db-store';
import { GET as getPositionsApi } from '@/app/api/portfolio/positions/route';
import { GET as getAccountsApi } from '@/app/api/portfolio/accounts/route';
import { calculateAllPositionsWithPrices, calculateEquitiesBreakdown, filterDustPositions } from './portfolio-calculator';
import {
  buildManualAccountHoldings,
  filterPositionsByAccountAndAssetClass,
  getEffectiveAssetClass,
  isManualAccountInScope,
} from './account-role-service';
import { getCategoryService } from './category-service';

const EPSILON = 1e-8;

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

describe('real-db readonly regression checks', () => {
  const db = readDb();
  const categoryService = getCategoryService();
  const assetsWithContext = calculateAllPositionsWithPrices(
    db.positions,
    db.prices,
    db.customPrices,
    db.fxRates
  );

  it('dataset sanity: has real positions/accounts loaded from data/db.json', () => {
    expect(db.positions.length).toBeGreaterThan(0);
    expect(db.accounts.length).toBeGreaterThan(0);
  });

  it('BZ-001: equities stock count includes all holdings (not only positively-valued)', () => {
    const expectedStockCount = assetsWithContext.filter((asset) => {
      if (getEffectiveAssetClass(asset) !== 'equity') return false;
      return categoryService.getSubCategory(asset.symbol, asset.type) !== 'etfs';
    }).length;

    const breakdown = calculateEquitiesBreakdown(assetsWithContext);
    expect(breakdown.stocks.count).toBe(expectedStockCount);
  });

  it('BZ-002: hideDust filtering keeps zero-valued equity holdings visible', () => {
    const equityAssets = assetsWithContext.filter(
      (asset) => getEffectiveAssetClass(asset) === 'equity'
    );
    const zeroValuedEquityIds = equityAssets
      .filter((asset) => asset.value === 0)
      .map((asset) => asset.id);

    const filtered = filterDustPositions(equityAssets, true);
    const filteredIds = new Set(filtered.map((asset) => asset.id));

    for (const id of zeroValuedEquityIds) {
      expect(filteredIds.has(id)).toBe(true);
    }
  });

  it('BZ-003/004: mixed manual accounts exist in real data; asset-class filtering keeps class purity', () => {
    const manualAccountIds = new Set(
      db.accounts
        .filter((account) => account.connection.dataSource === 'manual')
        .map((account) => account.id)
    );

    const perManual = new Map<string, { equity: number; cash: number; crypto: number; other: number }>();
    for (const p of db.positions) {
      if (!p.accountId || !manualAccountIds.has(p.accountId)) continue;
      const cls = getEffectiveAssetClass(p);
      const curr = perManual.get(p.accountId) || { equity: 0, cash: 0, crypto: 0, other: 0 };
      curr[cls] += 1;
      perManual.set(p.accountId, curr);
    }

    const mixedManualAccountIds = Array.from(perManual.entries())
      .filter(([_, c]) => c.equity > 0 && c.cash > 0)
      .map(([id]) => id);

    expect(mixedManualAccountIds.length).toBeGreaterThan(0);

    const equityOnly = filterPositionsByAccountAndAssetClass(
      db.positions,
      new Set(mixedManualAccountIds),
      'equity'
    );

    expect(equityOnly.every((p) => getEffectiveAssetClass(p) === 'equity')).toBe(true);
    expect(equityOnly.some((p) => p.symbol.toUpperCase().startsWith('CASH_'))).toBe(false);
  });

  it('BZ-005: wallet-account class filtering remains crypto-pure', () => {
    const walletAccountIds = new Set(
      db.accounts
        .filter((account) => account.connection.dataSource === 'debank' || account.connection.dataSource === 'helius')
        .map((account) => account.id)
    );

    const walletCrypto = filterPositionsByAccountAndAssetClass(
      db.positions,
      walletAccountIds,
      'crypto'
    );

    expect(walletCrypto.length).toBeGreaterThan(0);
    expect(walletCrypto.every((p) => getEffectiveAssetClass(p) === 'crypto')).toBe(true);
  });

  it('BZ-006: customPrices materially affect valuation on real data', () => {
    expect(Object.keys(db.customPrices).length).toBeGreaterThan(0);

    const withCustom = assetsWithContext;
    const withoutCustom = calculateAllPositionsWithPrices(
      db.positions,
      db.prices,
      {},
      db.fxRates
    );

    const withoutCustomById = byId(withoutCustom);
    const changed = withCustom.filter((asset) => {
      const other = withoutCustomById.get(asset.id);
      if (!other) return false;
      return Math.abs(asset.value - other.value) > EPSILON;
    });

    expect(changed.length).toBeGreaterThan(0);
  });

  it('BZ-007: fxRates materially affect valuation on real data', () => {
    expect(Object.keys(db.fxRates).length).toBeGreaterThan(0);

    const withFx = assetsWithContext;
    const withoutFx = calculateAllPositionsWithPrices(
      db.positions,
      db.prices,
      db.customPrices,
      {}
    );

    const withoutFxById = byId(withoutFx);
    const changed = withFx.filter((asset) => {
      const other = withoutFxById.get(asset.id);
      if (!other) return false;
      return Math.abs(asset.value - other.value) > EPSILON;
    });

    expect(changed.length).toBeGreaterThan(0);
  });

  it('BZ-011/BZ-012: manual account role scopes align with holdings flags', () => {
    const holdings = buildManualAccountHoldings(db.positions);

    const mixedInBothScopes = Array.from(holdings.entries()).filter(
      ([_, flags]) =>
        flags.hasAny &&
        flags.hasEquity &&
        (flags.hasCash || flags.hasStablecoin) &&
        isManualAccountInScope(flags, 'brokerage') &&
        isManualAccountInScope(flags, 'cash')
    );

    expect(mixedInBothScopes.length).toBeGreaterThan(0);
  });

  it('BZ-017: positions API allocations match canonical calculator allocations for filtered equity set', async () => {
    const req = new NextRequest('http://localhost/api/portfolio/positions?assetClass=equity');
    const res = await getPositionsApi(req);
    const json = await res.json();
    const rows = json.data as Array<{ id: string; allocation: number }>;

    const filteredEquity = db.positions.filter((p) => getEffectiveAssetClass(p) === 'equity');
    const priced = calculateAllPositionsWithPrices(
      filteredEquity,
      db.prices,
      db.customPrices,
      db.fxRates
    );
    const pricedById = byId(priced);

    expect(rows.length).toBe(filteredEquity.length);
    for (const row of rows) {
      const canonical = pricedById.get(row.id);
      expect(canonical).toBeDefined();
      expect(Math.abs((canonical?.allocation ?? 0) - row.allocation)).toBeLessThanOrEqual(EPSILON);
    }
  });

  it('BZ-018: accounts API type filters match shared manual-role classification (cash/brokerage)', async () => {
    const holdings = buildManualAccountHoldings(db.positions);

    const brokerageReq = new NextRequest('http://localhost/api/portfolio/accounts?type=brokerage');
    const brokerageRes = await getAccountsApi(brokerageReq);
    const brokerageJson = await brokerageRes.json();
    const brokerageIds = (brokerageJson.data as Array<{ id: string }>).map((a) => a.id).sort();

    const cashReq = new NextRequest('http://localhost/api/portfolio/accounts?type=cash');
    const cashRes = await getAccountsApi(cashReq);
    const cashJson = await cashRes.json();
    const cashIds = (cashJson.data as Array<{ id: string }>).map((a) => a.id).sort();

    const expectedBrokerage = db.accounts
      .filter((a) => a.connection.dataSource === 'manual')
      .filter((a) => isManualAccountInScope(holdings.get(a.id), 'brokerage'))
      .map((a) => a.id)
      .sort();

    const expectedCash = db.accounts
      .filter((a) => a.connection.dataSource === 'manual')
      .filter((a) => isManualAccountInScope(holdings.get(a.id), 'cash'))
      .map((a) => a.id)
      .sort();

    expect(brokerageIds).toEqual(expectedBrokerage);
    expect(cashIds).toEqual(expectedCash);
  });
});
