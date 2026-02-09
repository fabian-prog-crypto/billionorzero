import { ParsedPositionAction } from '@/types';
import { ActionHandler, MenuItem, PositionContext } from '../types';
import { parseAbbreviatedNumber } from '../parse-value';

export const sellPartialHandler: ActionHandler = {
  id: 'sell-partial',
  actionType: 'sell_partial',

  generateMenuItems(positions: PositionContext[]): MenuItem[] {
    return positions
      .filter(p => p.type !== 'cash')
      .map(p => ({
        id: `sell_partial_${p.symbol.toLowerCase()}`,
        label: `Sell some ${p.symbol}`,
        description: `Have: ${p.amount}`,
        fields: [
          { name: 'percent', required: false, type: 'number' as const },
          { name: 'sellAmount', required: false, type: 'number' as const },
          { name: 'price', required: false, type: 'number' as const },
        ],
        _handler: 'sell-partial',
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
    _positions: PositionContext[],
  ): ParsedPositionAction {
    const ctx = item._context;
    const symbol = (ctx.symbol as string).toUpperCase();
    const percent = values.percent ? parseAbbreviatedNumber(values.percent) : null;
    const sellAmount = values.sellAmount ? parseAbbreviatedNumber(values.sellAmount) : null;
    const price = values.price ? parseAbbreviatedNumber(values.price) : null;
    const currentAmount = ctx.currentAmount as number;

    // Derive sell amount from percent
    let derivedSellAmount = sellAmount ?? undefined;
    if (percent && !derivedSellAmount) {
      derivedSellAmount = currentAmount * (percent / 100);
    }

    // Derive total proceeds
    let totalProceeds: number | undefined;
    if (derivedSellAmount && price) {
      totalProceeds = derivedSellAmount * (price ?? 0);
    }

    const fmtPrice = (n: number) =>
      n >= 1
        ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })
        : '$' + n.toString();

    let qtyPart: string;
    if (percent) {
      qtyPart = `${percent}% of`;
    } else if (derivedSellAmount) {
      const pct = currentAmount > 0 ? Math.round((derivedSellAmount / currentAmount) * 100) : null;
      qtyPart = pct !== null ? `${derivedSellAmount} (${pct}%) of` : `${derivedSellAmount}`;
    } else {
      qtyPart = 'some';
    }
    const pricePart = price ? ` at ${fmtPrice(price)}` : '';

    const today = new Date().toISOString().split('T')[0];

    return {
      action: 'sell_partial',
      symbol,
      name: (ctx.name as string) || undefined,
      assetType: (ctx.assetType as ParsedPositionAction['assetType']) || 'crypto',
      sellPercent: percent ?? undefined,
      sellAmount: derivedSellAmount,
      sellPrice: price ?? undefined,
      totalProceeds,
      matchedPositionId: ctx.positionId as string,
      date: today,
      confidence: 0.9,
      summary: `Sell ${qtyPart} ${symbol}${pricePart}`,
      missingFields: (!percent && !derivedSellAmount) ? ['sellAmount'] : (price == null ? ['sellPrice'] : []),
    };
  },
};
