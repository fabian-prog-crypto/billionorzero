/**
 * Asset Categories - DEPRECATED
 * This file now re-exports from the category service for backward compatibility.
 * All new code should import from '@/services' instead.
 *
 * @deprecated Use '@/services' exports instead:
 *   import { MainCategory, AssetCategory, getCategoryService, ... } from '@/services';
 */

export type {
  MainCategory,
  AssetCategory,
  SubCategory,
  CryptoSubCategory,
  StockSubCategory,
  CategoryHierarchy,
} from '@/services/domain/category-service';

export {
  CATEGORY_COLORS,
  getAssetCategory,
  getMainCategory,
  getSubCategory,
  getCategoryLabel,
  isPerpProtocol,
  isAssetInCategory,
  getCategoryService,
} from '@/services/domain/category-service';

// Re-export PERP_PROTOCOLS for backward compatibility
// Note: Access through getCategoryService() for new code
export const PERP_PROTOCOLS = new Set([
  'hyperliquid',
  'lighter',
  'ethereal',
  'hyperliquid perp',
  'hyperliquid perpetual',
  'lighter exchange',
  'ethereal exchange',
]);
