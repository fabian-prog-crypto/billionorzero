import { ParsedPositionAction } from '@/types';
import { ActionHandler, MenuItem, PositionContext } from '../types';
import { parseAbbreviatedNumber } from '../parse-value';

export const buyHandler: ActionHandler = {
  id: 'buy',
  actionType: 'buy',

  generateMenuItems(positions: PositionContext[]): MenuItem[] {
    const items: MenuItem[] = [];

    // One item per existing non-cash position
    for (const p of positions) {
      if (p.type === 'cash') continue;
      items.push({
        id: `buy_${p.symbol.toLowerCase()}`,
        label: `Buy more ${p.symbol}`,
        description: `Have: ${p.amount}`,
        fields: [
          { name: 'amount', required: true, type: 'number' },
          { name: 'price', required: false, type: 'number' },
          { name: 'totalCost', required: false, type: 'number' },
        ],
        _handler: 'buy',
        _context: {
          positionId: p.id,
          symbol: p.symbol,
          name: p.name,
          assetType: p.type,
        },
      });
    }

    // Generic "buy new asset"
    items.push({
      id: 'buy_new',
      label: 'Buy a new asset',
      description: 'Asset not in portfolio',
      fields: [
        { name: 'symbol', required: true, type: 'string' },
        { name: 'amount', required: true, type: 'number' },
        { name: 'price', required: false, type: 'number' },
        { name: 'totalCost', required: false, type: 'number' },
        { name: 'assetType', required: false, type: 'string' },
      ],
      _handler: 'buy',
      _context: {},
    });

    return items;
  },

  resolve(
    item: MenuItem,
    values: Record<string, string>,
    positions: PositionContext[],
  ): ParsedPositionAction {
    const ctx = item._context;
    const symbol = ((ctx.symbol as string) || values.symbol || 'UNKNOWN').toUpperCase();
    const amount = values.amount ? parseAbbreviatedNumber(values.amount) : null;
    const price = values.price ? parseAbbreviatedNumber(values.price) : null;
    const totalCost = values.totalCost ? parseAbbreviatedNumber(values.totalCost) : null;

    // Determine asset type from context or values
    let assetType = (ctx.assetType as string) || values.assetType || 'crypto';

    // Try to match position for new buys
    let matchedPositionId = ctx.positionId as string | undefined;
    if (!matchedPositionId) {
      const match = positions.find(p => p.symbol.toUpperCase() === symbol);
      if (match) {
        matchedPositionId = match.id;
        assetType = match.type;
      }
    }

    // Derive computed fields
    let derivedPrice = price ?? undefined;
    let derivedTotalCost = totalCost ?? undefined;
    const derivedAmount = amount ?? undefined;

    if (derivedAmount && derivedPrice) {
      derivedTotalCost = derivedAmount * derivedPrice;
    } else if (derivedTotalCost && derivedAmount && !derivedPrice) {
      derivedPrice = derivedTotalCost / derivedAmount;
    }

    const fmtPrice = (n: number) =>
      n >= 1
        ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })
        : '$' + n.toString();

    const pricePart = derivedPrice ? ` at ${fmtPrice(derivedPrice)}` : '';
    const today = new Date().toISOString().split('T')[0];

    return {
      action: 'buy',
      symbol,
      name: (ctx.name as string) || undefined,
      assetType: assetType as ParsedPositionAction['assetType'],
      amount: derivedAmount,
      pricePerUnit: derivedPrice,
      totalCost: derivedTotalCost,
      matchedPositionId,
      date: today,
      confidence: 0.9,
      summary: `Buy ${derivedAmount ?? '?'} ${symbol}${pricePart}`,
    };
  },
};
