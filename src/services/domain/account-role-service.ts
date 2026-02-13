import { AssetClass, Position, assetClassFromType } from '@/types';
import { getCategoryService } from './category-service';

export interface ManualAccountHoldings {
  hasAny: boolean;
  hasCash: boolean;
  hasEquity: boolean;
  hasStablecoin: boolean;
  hasOther: boolean;
}

export type ManualAccountRole = 'empty' | 'cash' | 'brokerage' | 'mixed' | 'other';
export type ManualAccountScope = 'cash' | 'brokerage';

export function getEffectiveAssetClass(position: Pick<Position, 'assetClass' | 'type'>): AssetClass {
  return position.assetClass ?? assetClassFromType(position.type);
}

export function isPositionInAssetClass(
  position: Pick<Position, 'assetClass' | 'type'>,
  assetClass: AssetClass
): boolean {
  return getEffectiveAssetClass(position) === assetClass;
}

export function isStablecoinPosition(
  position: Pick<Position, 'assetClass' | 'type' | 'symbol'>
): boolean {
  if (!isPositionInAssetClass(position, 'crypto')) return false;
  const categoryService = getCategoryService();
  return categoryService.getSubCategory(position.symbol, position.type) === 'stablecoins';
}

export function buildManualAccountHoldings(positions: Position[]): Map<string, ManualAccountHoldings> {
  const holdings = new Map<string, ManualAccountHoldings>();

  for (const p of positions) {
    if (!p.accountId) continue;

    const current = holdings.get(p.accountId) || {
      hasAny: false,
      hasCash: false,
      hasEquity: false,
      hasStablecoin: false,
      hasOther: false,
    };

    current.hasAny = true;
    const effectiveClass = getEffectiveAssetClass(p);

    if (effectiveClass === 'cash') {
      current.hasCash = true;
    } else if (effectiveClass === 'equity') {
      current.hasEquity = true;
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
  if (flags.hasEquity && hasCashEquivalent) return 'mixed';
  if (flags.hasEquity) return 'brokerage';
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
