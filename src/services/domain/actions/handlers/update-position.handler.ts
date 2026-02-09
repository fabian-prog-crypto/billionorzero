import { ParsedPositionAction } from '@/types';
import { ActionHandler, MenuItem, PositionContext } from '../types';
import { parseAbbreviatedNumber } from '../parse-value';

export const updatePositionHandler: ActionHandler = {
  id: 'update-position',
  actionType: 'update_position',

  generateMenuItems(positions: PositionContext[]): MenuItem[] {
    return positions
      .filter(p => p.type !== 'cash' && !p.walletAddress)
      .map(p => {
        const idSlug = p.id.slice(0, 8);
        const costStr = p.costBasis != null ? ` (cost: $${p.costBasis.toLocaleString()})` : '';

        return {
          id: `update_position_${p.symbol.toLowerCase()}_${idSlug}`,
          label: `Update ${p.symbol} position`,
          description: `Current: ${p.amount}${costStr}`,
          fields: [
            { name: 'amount', required: false, type: 'number' as const },
            { name: 'costBasis', required: false, type: 'number' as const },
            { name: 'date', required: false, type: 'string' as const },
          ],
          _handler: 'update-position',
          _context: {
            positionId: p.id,
            symbol: p.symbol,
            name: p.name,
            type: p.type,
            currentAmount: p.amount,
            currentCostBasis: p.costBasis,
            currentDate: p.purchaseDate,
          },
        };
      });
  },

  resolve(
    item: MenuItem,
    values: Record<string, string>,
    _positions: PositionContext[],
  ): ParsedPositionAction {
    const ctx = item._context;
    const amount = values.amount ? parseAbbreviatedNumber(values.amount) : null;
    const costBasis = values.costBasis ? parseAbbreviatedNumber(values.costBasis) : null;
    const date = values.date || null;

    const missingFields: string[] = [];
    if (amount == null && costBasis == null && !date) {
      missingFields.push('amount', 'costBasis', 'date');
    }

    const parts: string[] = [];
    if (amount != null) parts.push(`amount to ${amount}`);
    if (costBasis != null) parts.push(`cost basis to $${costBasis.toLocaleString()}`);
    if (date) parts.push(`date to ${date}`);
    const summary = parts.length > 0
      ? `Update ${ctx.symbol} ${parts.join(', ')}`
      : `Update ${ctx.symbol} position`;

    return {
      action: 'update_position',
      symbol: ctx.symbol as string,
      name: ctx.name as string,
      assetType: (ctx.type as ParsedPositionAction['assetType']) || 'crypto',
      amount: amount ?? undefined,
      costBasis: costBasis ?? undefined,
      date: date ?? undefined,
      matchedPositionId: ctx.positionId as string,
      missingFields: missingFields.length > 0 ? missingFields : undefined,
      confidence: 0.95,
      summary,
    };
  },
};
