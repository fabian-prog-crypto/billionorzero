import { ParsedPositionAction } from '@/types';
import { ActionHandler, MenuItem, PositionContext } from '../types';
import { parseAbbreviatedNumber } from '../parse-value';

export const addCashHandler: ActionHandler = {
  id: 'add-cash',
  actionType: 'add_cash',

  generateMenuItems(positions: PositionContext[]): MenuItem[] {
    const items: MenuItem[] = [];

    // Per-account items for existing cash positions
    const cashPositions = positions.filter(p => p.type === 'cash');
    for (const p of cashPositions) {
      const currMatch = p.symbol.match(/CASH_([A-Z]{3})/);
      const currency = currMatch ? currMatch[1] : 'USD';
      const acct = p.accountName || p.name.match(/^(.+?)\s*\(/)?.[1] || p.name;
      const slug = acct.toLowerCase().replace(/\s+/g, '_');

      items.push({
        id: `add_cash_${slug}_${currency.toLowerCase()}`,
        label: `Add cash to ${acct} (${currency})`,
        description: `Add to balance (currently ${p.amount.toLocaleString()} ${currency})`,
        fields: [{ name: 'amount', required: true, type: 'number' as const }],
        _handler: 'add-cash',
        _context: {
          positionId: p.id,
          currency,
          accountName: acct,
          symbol: p.symbol,
        },
      });
    }

    // Generic fallback for new accounts
    items.push({
      id: 'add_cash_generic',
      label: 'Add cash to an account',
      description: 'New cash position',
      fields: [
        { name: 'amount', required: true, type: 'number' },
        { name: 'currency', required: true, type: 'string' },
        { name: 'account', required: true, type: 'string' },
      ],
      _handler: 'add-cash',
      _context: {},
    });

    return items;
  },

  resolve(
    item: MenuItem,
    values: Record<string, string>,
  ): ParsedPositionAction {
    const ctx = item._context;
    const amount = values.amount ? parseAbbreviatedNumber(values.amount) : null;

    // Per-account item: positionId is pre-filled from context
    if (ctx.positionId) {
      const currency = ctx.currency as string;
      const accountName = ctx.accountName as string;
      return {
        action: 'add_cash',
        symbol: (ctx.symbol as string) || `CASH_${currency}`,
        assetType: 'cash',
        amount: amount ?? 0,
        currency,
        accountName,
        matchedPositionId: ctx.positionId as string,
        confidence: 0.95,
        summary: `Add ${amount != null ? amount.toLocaleString() : '?'} ${currency} to ${accountName}`,
      };
    }

    // Generic item: values from LLM
    const currency = (values.currency || 'USD').toUpperCase();
    const accountName = values.account || '';

    return {
      action: 'add_cash',
      symbol: `CASH_${currency}`,
      assetType: 'cash',
      amount: amount ?? 0,
      currency,
      accountName,
      confidence: 0.9,
      summary: `Add ${amount != null ? amount.toLocaleString() : '?'} ${currency} to ${accountName || '?'}`,
    };
  },
};
