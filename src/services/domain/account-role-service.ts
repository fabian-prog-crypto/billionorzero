import { AssetClass, Position } from '@/types';
import { getCategoryService } from './category-service';

export interface ManualAccountHoldings {
  hasAny: boolean;
  hasCash: boolean;
  hasEquity: boolean;
  hasMetals: boolean;
  hasStablecoin: boolean;
  hasOther: boolean;
}

export type ManualAccountRole = 'empty' | 'cash' | 'brokerage' | 'mixed' | 'other';
export type ManualAccountScope = 'cash' | 'brokerage';

export function getEffectiveAssetClass(position: Pick<Position, 'assetClass' | 'assetClassOverride' | 'type' | 'symbol'>): AssetClass {
  if (position.assetClassOverride) return position.assetClassOverride;
  if (position.assetClass) return position.assetClass;
  const categoryService = getCategoryService();
  return categoryService.getAssetClass(position.symbol, position.type);
}

export function isPositionInAssetClass(
  position: Pick<Position, 'assetClass' | 'assetClassOverride' | 'type' | 'symbol'>,
  assetClass: AssetClass
): boolean {
  return getEffectiveAssetClass(position) === assetClass;
}

export function isStablecoinPosition(
  position: Pick<Position, 'assetClass' | 'assetClassOverride' | 'type' | 'symbol'>
): boolean {
  if (!isPositionInAssetClass(position, 'crypto')) return false;
  const categoryService = getCategoryService();
  const categoryInput = position.assetClassOverride ?? position.assetClass ?? position.type;
  return categoryService.getSubCategory(position.symbol, categoryInput) === 'stablecoins';
}

export function buildManualAccountHoldings(positions: Position[]): Map<string, ManualAccountHoldings> {
  const holdings = new Map<string, ManualAccountHoldings>();

  for (const p of positions) {
    if (!p.accountId) continue;

    const current = holdings.get(p.accountId) || {
      hasAny: false,
      hasCash: false,
      hasEquity: false,
      hasMetals: false,
      hasStablecoin: false,
      hasOther: false,
    };

    current.hasAny = true;
    const effectiveClass = getEffectiveAssetClass(p);

    if (effectiveClass === 'cash') {
      current.hasCash = true;
    } else if (effectiveClass === 'equity') {
      current.hasEquity = true;
    } else if (effectiveClass === 'metals') {
      current.hasMetals = true;
    } else {
      current.hasOther = true;
    }

    if (isStablecoinPosition(p)) {
      current.hasStablecoin = true;
    }

    holdings.set(p.accountId, current);
  }

  return holdings;
}

export function getManualAccountRole(flags?: ManualAccountHoldings): ManualAccountRole {
  if (!flags || !flags.hasAny) return 'empty';

  const hasCashEquivalent = flags.hasCash || flags.hasStablecoin;
  const hasBrokerageAssets = flags.hasEquity || flags.hasMetals;
  if (hasBrokerageAssets && hasCashEquivalent) return 'mixed';
  if (hasBrokerageAssets) return 'brokerage';
  if (hasCashEquivalent) return 'cash';
  return 'other';
}

export function isManualAccountInScope(
  flags: ManualAccountHoldings | undefined,
  scope: ManualAccountScope,
  includeEmptyAccounts: boolean = true
): boolean {
  const role = getManualAccountRole(flags);
  if (role === 'empty') return includeEmptyAccounts;
  if (scope === 'brokerage') return role === 'brokerage' || role === 'mixed';
  return role === 'cash' || role === 'mixed';
}

export function filterPositionsByAccountAndAssetClass(
  positions: Position[],
  accountIds: Set<string>,
  assetClass: AssetClass
): Position[] {
  return positions.filter(
    (p) => !!p.accountId && accountIds.has(p.accountId) && isPositionInAssetClass(p, assetClass)
  );
}
