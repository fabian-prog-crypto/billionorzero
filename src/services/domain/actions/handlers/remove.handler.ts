import { ParsedPositionAction } from '@/types';
import { ActionHandler, MenuItem, PositionContext } from '../types';

export const removeHandler: ActionHandler = {
  id: 'remove',
  actionType: 'remove',

  generateMenuItems(positions: PositionContext[]): MenuItem[] {
    return positions.map(p => ({
      id: `remove_${p.symbol.toLowerCase()}`,
      label: `Remove ${p.symbol}`,
      description: `${p.name} (${p.amount})`,
      fields: [],
      _handler: 'remove',
      _context: {
        positionId: p.id,
        symbol: p.symbol,
        name: p.name,
        assetType: p.type,
      },
    }));
  },

  resolve(
    item: MenuItem,
  ): ParsedPositionAction {
    const ctx = item._context;
    const symbol = (ctx.symbol as string).toUpperCase();

    return {
      action: 'remove',
      symbol,
      name: (ctx.name as string) || undefined,
      assetType: (ctx.assetType as ParsedPositionAction['assetType']) || 'crypto',
      matchedPositionId: ctx.positionId as string,
      confidence: 0.95,
      summary: `Remove ${symbol}`,
    };
  },
};
