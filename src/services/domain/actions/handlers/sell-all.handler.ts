import { ParsedPositionAction } from '@/types';
import { ActionHandler, MenuItem, PositionContext } from '../types';
import { parseAbbreviatedNumber } from '../parse-value';

export const sellAllHandler: ActionHandler = {
  id: 'sell-all',
  actionType: 'sell_all',

  generateMenuItems(positions: PositionContext[]): MenuItem[] {
    return positions
      .filter(p => p.type !== 'cash')
      .map(p => ({
        id: `sell_all_${p.symbol.toLowerCase()}`,
        label: `Sell all ${p.symbol}`,
        description: `Have: ${p.amount}`,
        fields: [
          { name: 'price', required: false, type: 'number' as const },
        ],
        _handler: 'sell-all',
        _context: {
          positionId: p.id,
          symbol: p.symbol,
          name: p.name,
          assetType: p.type,
          currentAmount: p.amount,
        },
      }));
  },

  resolve(
    item: MenuItem,
    values: Record<string, string>,
  ): ParsedPositionAction {
    const ctx = item._context;
    const symbol = (ctx.symbol as string).toUpperCase();
    const price = values.price ? parseAbbreviatedNumber(values.price) : null;
    const currentAmount = ctx.currentAmount as number;

    const fmtPrice = (n: number) =>
      n >= 1
        ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })
        : '$' + n.toString();

    const pricePart = price ? ` at ${fmtPrice(price)}` : '';
    const today = new Date().toISOString().split('T')[0];

    return {
      action: 'sell_all',
      symbol,
      name: (ctx.name as string) || undefined,
      assetType: (ctx.assetType as ParsedPositionAction['assetType']) || 'crypto',
      sellAmount: currentAmount,
      sellPrice: price ?? undefined,
      totalProceeds: price ? currentAmount * price : undefined,
      matchedPositionId: ctx.positionId as string,
      date: today,
      confidence: 0.95,
      summary: `Sell all ${symbol}${pricePart}`,
      missingFields: price == null ? ['sellPrice'] : [],
    };
  },
};
