import { ParsedPositionAction } from '@/types';
import { ActionHandler, MenuItem, PositionContext } from '../types';
import { parseAbbreviatedNumber } from '../parse-value';

export const updateCashHandler: ActionHandler = {
  id: 'update-cash',
  actionType: 'update_cash',

  generateMenuItems(positions: PositionContext[]): MenuItem[] {
    return positions
      .filter(p => p.type === 'cash')
      .map(p => {
        const currMatch = p.symbol.match(/CASH_([A-Z]{3})/);
        const currency = currMatch ? currMatch[1] : 'USD';
        const acct = p.accountName || p.name.match(/^(.+?)\s*\(/)?.[1] || p.name;
        const slug = acct.toLowerCase().replace(/\s+/g, '_');

        return {
          id: `update_cash_${slug}_${currency.toLowerCase()}`,
          label: `Update ${acct} ${currency} balance`,
          description: `Set balance (currently ${p.amount.toLocaleString()} ${currency})`,
          fields: [{ name: 'amount', required: true, type: 'number' as const }],
          _handler: 'update-cash',
          _context: {
            positionId: p.id,
            currency,
            accountName: acct,
            symbol: p.symbol,
          },
        };
      });
  },

  resolve(
    item: MenuItem,
    values: Record<string, string>,
  ): ParsedPositionAction {
    const ctx = item._context;
    const amount = values.amount ? parseAbbreviatedNumber(values.amount) : null;

    return {
      action: 'update_cash',
      symbol: (ctx.symbol as string) || `CASH_${ctx.currency}`,
      assetType: 'cash',
      amount: amount ?? 0,
      currency: ctx.currency as string,
      accountName: ctx.accountName as string,
      matchedPositionId: ctx.positionId as string,
      confidence: 0.95,
      summary: `Update ${ctx.accountName} ${ctx.currency} to ${amount != null ? amount.toLocaleString() : '?'}`,
    };
  },
};
