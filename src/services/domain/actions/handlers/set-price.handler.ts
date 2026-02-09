import { ParsedPositionAction } from '@/types';
import { ActionHandler, MenuItem, PositionContext } from '../types';
import { parseAbbreviatedNumber } from '../parse-value';

export const setPriceHandler: ActionHandler = {
  id: 'set-price',
  actionType: 'set_price',

  generateMenuItems(positions: PositionContext[]): MenuItem[] {
    // Deduplicate by symbol (multiple positions of same asset -> one set-price item)
    const seen = new Set<string>();
    const items: MenuItem[] = [];

    for (const p of positions) {
      if (p.type === 'cash') continue;
      const sym = p.symbol.toUpperCase();
      if (seen.has(sym)) continue;
      seen.add(sym);

      items.push({
        id: `set_price_${p.symbol.toLowerCase()}`,
        label: `Set ${sym} price`,
        description: p.name,
        fields: [{ name: 'price', required: true, type: 'number' }],
        _handler: 'set-price',
        _context: {
          symbol: sym,
          name: p.name,
          assetType: p.type,
          positionId: p.id,
        },
      });
    }

    return items;
  },

  resolve(
    item: MenuItem,
    values: Record<string, string>,
  ): ParsedPositionAction {
    const ctx = item._context;
    const symbol = (ctx.symbol as string).toUpperCase();
    const price = values.price ? parseAbbreviatedNumber(values.price) : null;

    const fmtPrice = (n: number) =>
      n >= 1
        ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })
        : '$' + n.toString();

    return {
      action: 'set_price',
      symbol,
      assetType: (ctx.assetType as ParsedPositionAction['assetType']) || 'crypto',
      newPrice: price ?? undefined,
      matchedPositionId: ctx.positionId as string,
      confidence: 0.95,
      summary: `Set ${symbol} price to ${price != null ? fmtPrice(price) : '?'}`,
      missingFields: price == null ? ['newPrice'] : [],
    };
  },
};
