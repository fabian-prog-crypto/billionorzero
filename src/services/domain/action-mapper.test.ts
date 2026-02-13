import { describe, it, expect } from 'vitest';
import { toolCallToAction, findPositionBySymbol, CONFIRM_MUTATION_TOOLS, type ActionMapperData } from './action-mapper';
import type { Position } from '@/types';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

function makePosition(overrides: Partial<Position> & Pick<Position, 'id' | 'symbol' | 'name' | 'amount' | 'type'>): Position {
  return {
    assetClass: 'crypto',
    addedAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  } as Position;
}

const FIXTURE_POSITIONS: Position[] = [
  makePosition({ id: 'pos-btc', symbol: 'bitcoin', name: 'Bitcoin', amount: 1.5, type: 'crypto', assetClass: 'crypto', costBasis: 45000 }),
  makePosition({ id: 'pos-eth', symbol: 'ethereum', name: 'Ethereum', amount: 10, type: 'crypto', assetClass: 'crypto', costBasis: 20000 }),
  makePosition({ id: 'pos-aapl', symbol: 'AAPL', name: 'Apple Inc.', amount: 50, type: 'stock', assetClass: 'equity', accountId: 'acct-revolut', costBasis: 8500 }),
  makePosition({ id: 'pos-googl', symbol: 'GOOGL', name: 'Alphabet', amount: 12, type: 'stock', assetClass: 'equity', accountId: 'acct-revolut', costBasis: 1800 }),
  makePosition({ id: 'pos-cash-usd', symbol: 'CASH_USD_1000000', name: 'Test Bank (USD)', amount: 10000, type: 'cash', assetClass: 'cash', accountId: 'acct-bank', costBasis: 10000 }),
  makePosition({ id: 'pos-cash-eur-revolut', symbol: 'CASH_EUR_2000000', name: 'Revolut (EUR)', amount: 5000, type: 'cash', assetClass: 'cash', accountId: 'acct-revolut', costBasis: 5000 }),
  makePosition({ id: 'pos-cash-eur-broker', symbol: 'CASH_EUR_2000001', name: 'Revolut Broker (EUR)', amount: 3000, type: 'cash', assetClass: 'cash', accountId: 'acct-revolut-broker', costBasis: 3000 }),
  makePosition({ id: 'pos-gold', symbol: 'GOLD', name: 'Gold', amount: 5, type: 'manual', assetClass: 'other', costBasis: 9500 }),
];

const FIXTURE_ACCOUNTS = [
  { id: 'acct-revolut', name: 'Revolut', connection: { dataSource: 'manual' } },
  { id: 'acct-revolut-broker', name: 'Revolut Broker', connection: { dataSource: 'manual' } },
  { id: 'acct-bank', name: 'Test Bank', connection: { dataSource: 'manual' } },
];

const FIXTURE_DB: ActionMapperData = {
  positions: FIXTURE_POSITIONS,
  accounts: FIXTURE_ACCOUNTS,
  prices: {
    bitcoin: { price: 70000 },
    ethereum: { price: 3200 },
    googl: { price: 175 },
  },
};

// ─── CONFIRM_MUTATION_TOOLS ─────────────────────────────────────────────────

describe('CONFIRM_MUTATION_TOOLS', () => {
  it('contains all 7 confirmable mutation tools', () => {
    expect(CONFIRM_MUTATION_TOOLS.size).toBe(7);
    expect(CONFIRM_MUTATION_TOOLS.has('buy_position')).toBe(true);
    expect(CONFIRM_MUTATION_TOOLS.has('sell_partial')).toBe(true);
    expect(CONFIRM_MUTATION_TOOLS.has('sell_all')).toBe(true);
    expect(CONFIRM_MUTATION_TOOLS.has('remove_position')).toBe(true);
    expect(CONFIRM_MUTATION_TOOLS.has('update_position')).toBe(true);
    expect(CONFIRM_MUTATION_TOOLS.has('set_price')).toBe(true);
    expect(CONFIRM_MUTATION_TOOLS.has('add_cash')).toBe(true);
    expect(CONFIRM_MUTATION_TOOLS.has('update_cash')).toBe(false);
  });
});

// ─── findPositionBySymbol ───────────────────────────────────────────────────

describe('findPositionBySymbol', () => {
  it('matches case-insensitively', () => {
    const result = findPositionBySymbol(FIXTURE_POSITIONS, 'BITCOIN');
    expect(result?.id).toBe('pos-btc');
  });

  it('matches lowercase symbol against uppercase', () => {
    const result = findPositionBySymbol(FIXTURE_POSITIONS, 'aapl');
    expect(result?.id).toBe('pos-aapl');
  });

  it('matches known aliases (GOOG -> GOOGL)', () => {
    const result = findPositionBySymbol(FIXTURE_POSITIONS, 'GOOG');
    expect(result?.id).toBe('pos-googl');
  });

  it('prefers manual position (no accountId) over synced', () => {
    const positions: Position[] = [
      makePosition({ id: 'synced', symbol: 'BTC', name: 'BTC', amount: 1, type: 'crypto', accountId: 'some-wallet' }),
      makePosition({ id: 'manual', symbol: 'BTC', name: 'BTC', amount: 0.5, type: 'crypto' }),
    ];
    const result = findPositionBySymbol(positions, 'BTC');
    expect(result?.id).toBe('manual');
  });

  it('returns first match when all have accountId', () => {
    const positions: Position[] = [
      makePosition({ id: 'first', symbol: 'ETH', name: 'ETH', amount: 5, type: 'crypto', accountId: 'wallet-1' }),
      makePosition({ id: 'second', symbol: 'ETH', name: 'ETH', amount: 3, type: 'crypto', accountId: 'wallet-2' }),
    ];
    const result = findPositionBySymbol(positions, 'ETH');
    expect(result?.id).toBe('first');
  });

  it('returns undefined when no match', () => {
    const result = findPositionBySymbol(FIXTURE_POSITIONS, 'DOGE');
    expect(result).toBeUndefined();
  });
});

// ─── toolCallToAction: buy_position ─────────────────────────────────────────

describe('toolCallToAction — buy_position', () => {
  it('basic buy with amount and price', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'BTC', amount: 0.5, price: 65000, assetType: 'crypto',
    }, FIXTURE_DB);

    expect(result).not.toBeNull();
    expect(result!.action).toBe('buy');
    expect(result!.symbol).toBe('BTC');
    expect(result!.amount).toBe(0.5);
    expect(result!.pricePerUnit).toBe(65000);
    expect(result!.totalCost).toBe(32500);
    expect(result!.assetType).toBe('crypto');
    expect(result!.confidence).toBe(0.9);
  });

  it('buy with totalCost derives pricePerUnit', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'MSFT', amount: 123.61, totalCost: 50000, assetType: 'stock',
    }, FIXTURE_DB);

    expect(result!.totalCost).toBe(50000);
    expect(result!.pricePerUnit).toBeCloseTo(404.50, 1);
  });

  it('buy without price sets pricePerUnit and totalCost to undefined', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'ETH', amount: 2,
    }, FIXTURE_DB);

    expect(result!.pricePerUnit).toBeUndefined();
    expect(result!.totalCost).toBeUndefined();
  });

  it('buy with account match sets matchedAccountId', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'AAPL', amount: 10, price: 185, assetType: 'stock', account: 'Revolut',
    }, FIXTURE_DB);

    expect(result!.matchedAccountId).toBe('acct-revolut');
    expect(result!.accountName).toBe('Revolut');
  });

  it('buy with account substring match (case-insensitive)', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'AAPL', amount: 10, price: 185, account: 'brok',
    }, FIXTURE_DB);

    expect(result!.matchedAccountId).toBe('acct-revolut-broker');
    expect(result!.accountName).toBe('Revolut Broker');
  });

  it('buy with unmatched account preserves accountName string', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'AAPL', amount: 10, account: 'Fidelity',
    }, FIXTURE_DB);

    expect(result!.matchedAccountId).toBeUndefined();
    expect(result!.accountName).toBe('Fidelity');
  });

  it('buy matching existing position sets matchedPositionId', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'AAPL', amount: 10, price: 185, assetType: 'stock',
    }, FIXTURE_DB);

    expect(result!.matchedPositionId).toBe('pos-aapl');
  });

  it('buy new symbol has no matchedPositionId', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'TSLA', amount: 5, price: 250, assetType: 'stock',
    }, FIXTURE_DB);

    expect(result!.matchedPositionId).toBeUndefined();
  });

  it('buy generates correct summary', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'SOL', amount: 10, price: 150,
    }, FIXTURE_DB);

    expect(result!.summary).toBe('Buy 10 SOL at $150.00');
  });

  it('buy without price generates summary without price', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'SOL', amount: 10,
    }, FIXTURE_DB);

    expect(result!.summary).toBe('Buy 10 SOL');
  });

  it('totalCost only (no amount) generates "$X worth of" summary', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'MSFT', totalCost: 50000, assetType: 'stock',
    }, FIXTURE_DB);

    expect(result).not.toBeNull();
    expect(result!.action).toBe('buy');
    expect(result!.symbol).toBe('MSFT');
    expect(result!.amount).toBeUndefined();
    expect(result!.totalCost).toBe(50000);
    expect(result!.pricePerUnit).toBeUndefined();
    expect(result!.assetType).toBe('stock');
    expect(result!.summary).toBe('Buy $50,000 worth of MSFT');
  });

  it('totalCost only (no amount, no price) leaves amount and price undefined', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'SOL', totalCost: 10000,
    }, FIXTURE_DB);

    expect(result).not.toBeNull();
    expect(result!.amount).toBeUndefined();
    expect(result!.pricePerUnit).toBeUndefined();
    expect(result!.totalCost).toBe(10000);
    expect(result!.summary).toBe('Buy $10,000 worth of SOL');
  });

  it('totalCost only defaults assetType to crypto', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'SOL', totalCost: 10000,
    }, FIXTURE_DB);

    expect(result!.assetType).toBe('crypto');
  });

  it('buy defaults date to today when missing', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'SOL', totalCost: 10000,
    }, FIXTURE_DB);

    expect(result!.date).toBe(new Date().toISOString().split('T')[0]);
  });
});

// ─── toolCallToAction: sell_partial ─────────────────────────────────────────

describe('toolCallToAction — sell_partial', () => {
  it('sell by amount', () => {
    const result = toolCallToAction('sell_partial', {
      symbol: 'ethereum', amount: 5,
    }, FIXTURE_DB);

    expect(result!.action).toBe('sell_partial');
    expect(result!.sellAmount).toBe(5);
    expect(result!.sellPercent).toBeUndefined();
    expect(result!.matchedPositionId).toBe('pos-eth');
    expect(result!.assetType).toBe('crypto');
  });

  it('sell by percent', () => {
    const result = toolCallToAction('sell_partial', {
      symbol: 'ethereum', percent: 50,
    }, FIXTURE_DB);

    expect(result!.sellPercent).toBe(50);
    expect(result!.sellAmount).toBeUndefined();
    expect(result!.summary).toBe('Sell 50% of ETHEREUM');
  });

  it('sell with price', () => {
    const result = toolCallToAction('sell_partial', {
      symbol: 'ethereum', amount: 5, price: 3200,
    }, FIXTURE_DB);

    expect(result!.sellPrice).toBe(3200);
    expect(result!.sellAmount).toBe(5);
  });

  it('sell defaults date to today when missing', () => {
    const result = toolCallToAction('sell_partial', {
      symbol: 'ethereum', amount: 5,
    }, FIXTURE_DB);

    expect(result!.date).toBe(new Date().toISOString().split('T')[0]);
  });

  it('sell inherits assetType from matched position', () => {
    const result = toolCallToAction('sell_partial', {
      symbol: 'AAPL', amount: 10,
    }, FIXTURE_DB);

    expect(result!.assetType).toBe('stock');
  });

  it('sell unmatched symbol defaults to crypto', () => {
    const result = toolCallToAction('sell_partial', {
      symbol: 'DOGE', amount: 100,
    }, FIXTURE_DB);

    expect(result!.assetType).toBe('crypto');
    expect(result!.matchedPositionId).toBeUndefined();
  });

  it('resolves GOOG to existing GOOGL and infers price from DB', () => {
    const result = toolCallToAction('sell_partial', {
      symbol: 'GOOG',
      percent: 50,
    }, FIXTURE_DB);

    expect(result).not.toBeNull();
    expect(result!.symbol).toBe('GOOGL');
    expect(result!.matchedPositionId).toBe('pos-googl');
    expect(result!.sellPrice).toBe(175);
  });
});

// ─── toolCallToAction: sell_all ─────────────────────────────────────────────

describe('toolCallToAction — sell_all', () => {
  it('basic sell all', () => {
    const result = toolCallToAction('sell_all', { symbol: 'GOLD' }, FIXTURE_DB);

    expect(result!.action).toBe('sell_all');
    expect(result!.symbol).toBe('GOLD');
    expect(result!.matchedPositionId).toBe('pos-gold');
    expect(result!.summary).toBe('Sell all GOLD');
  });

  it('sell all with price', () => {
    const result = toolCallToAction('sell_all', { symbol: 'bitcoin', price: 70000 }, FIXTURE_DB);

    expect(result!.sellPrice).toBe(70000);
    expect(result!.matchedPositionId).toBe('pos-btc');
  });

  it('sell all resolves relative date and infers price when missing', () => {
    const result = toolCallToAction('sell_all', { symbol: 'GOOG', date: 'yesterday' }, FIXTURE_DB);

    const expectedYesterday = new Date();
    expectedYesterday.setDate(expectedYesterday.getDate() - 1);

    expect(result).not.toBeNull();
    expect(result!.symbol).toBe('GOOGL');
    expect(result!.matchedPositionId).toBe('pos-googl');
    expect(result!.sellPrice).toBe(175);
    expect(result!.date).toBe(expectedYesterday.toISOString().split('T')[0]);
  });

  it('prefers account-linked equity match over accountless duplicate', () => {
    const duplicateDb: ActionMapperData = {
      ...FIXTURE_DB,
      positions: [
        ...FIXTURE_POSITIONS,
        makePosition({
          id: 'pos-googl-manual',
          symbol: 'GOOGL',
          name: 'Alphabet Manual',
          amount: 1,
          type: 'stock',
          assetClass: 'equity',
        }),
      ],
    };

    const result = toolCallToAction('sell_all', { symbol: 'GOOG' }, duplicateDb);

    expect(result).not.toBeNull();
    expect(result!.symbol).toBe('GOOGL');
    expect(result!.matchedPositionId).toBe('pos-googl');
    expect(result!.matchedAccountId).toBe('acct-revolut');
  });

  it('respects explicit account match when multiple linked positions share a symbol', () => {
    const duplicateDb: ActionMapperData = {
      ...FIXTURE_DB,
      positions: [
        ...FIXTURE_POSITIONS,
        makePosition({
          id: 'pos-googl-broker',
          symbol: 'GOOGL',
          name: 'Alphabet (Broker)',
          amount: 7,
          type: 'stock',
          assetClass: 'equity',
          accountId: 'acct-revolut-broker',
        }),
      ],
    };

    const result = toolCallToAction('sell_all', {
      symbol: 'GOOG',
      account: 'Revolut Broker',
    }, duplicateDb);

    expect(result).not.toBeNull();
    expect(result!.symbol).toBe('GOOGL');
    expect(result!.matchedPositionId).toBe('pos-googl-broker');
    expect(result!.matchedAccountId).toBe('acct-revolut-broker');
  });
});

// ─── toolCallToAction: add_cash ─────────────────────────────────────────────

describe('toolCallToAction — add_cash', () => {
  it('basic add cash', () => {
    const result = toolCallToAction('add_cash', {
      currency: 'EUR', amount: 5000,
    }, FIXTURE_DB);

    expect(result!.action).toBe('add_cash');
    expect(result!.symbol).toBe('EUR');
    expect(result!.amount).toBe(5000);
    expect(result!.currency).toBe('EUR');
    expect(result!.assetType).toBe('cash');
    expect(result!.matchedAccountId).toBeUndefined();
  });

  it('add cash with account match', () => {
    const result = toolCallToAction('add_cash', {
      currency: 'USD', amount: 10000, account: 'Test Bank',
    }, FIXTURE_DB);

    expect(result!.matchedAccountId).toBe('acct-bank');
    expect(result!.accountName).toBe('Test Bank');
    // Should also match the existing USD cash position in this account
    expect(result!.matchedPositionId).toBe('pos-cash-usd');
  });

  it('add cash with unmatched account', () => {
    const result = toolCallToAction('add_cash', {
      currency: 'CHF', amount: 5000, account: 'UBS',
    }, FIXTURE_DB);

    expect(result!.matchedAccountId).toBeUndefined();
    expect(result!.accountName).toBe('UBS');
  });

  it('add cash generates correct summary with account', () => {
    const result = toolCallToAction('add_cash', {
      currency: 'EUR', amount: 5000, account: 'Test Bank',
    }, FIXTURE_DB);

    expect(result!.summary).toBe('Add 5000 EUR to Test Bank');
  });

  it('does not resolve ambiguous partial account names', () => {
    const result = toolCallToAction('add_cash', {
      currency: 'EUR', amount: 2500, account: 'revol',
    }, FIXTURE_DB);

    expect(result!.matchedAccountId).toBeUndefined();
    expect(result!.matchedPositionId).toBeUndefined();
    expect(result!.accountName).toBe('revol');
  });
});

// ─── toolCallToAction: legacy update_cash alias ─────────────────────────────

describe('toolCallToAction — legacy update_cash alias', () => {
  it('maps update_cash to canonical update_position action', () => {
    const result = toolCallToAction('update_cash', {
      currency: 'USD', amount: 15000,
    }, FIXTURE_DB);

    expect(result!.action).toBe('update_position');
    expect(result!.symbol).toBe('USD');
    expect(result!.amount).toBe(15000);
    // Should match the USD cash position by symbol/name
    expect(result!.matchedPositionId).toBe('pos-cash-usd');
  });

  it('update cash with account match', () => {
    const result = toolCallToAction('update_cash', {
      currency: 'USD', amount: 3000, account: 'Test Bank',
    }, FIXTURE_DB);

    expect(result!.matchedAccountId).toBe('acct-bank');
    expect(result!.matchedPositionId).toBe('pos-cash-usd');
    expect(result!.summary).toBe('Update USD balance to 3000 in Test Bank');
  });

  it('update cash matches by position name', () => {
    const result = toolCallToAction('update_cash', {
      currency: 'USD', amount: 20000,
    }, FIXTURE_DB);

    expect(result!.matchedPositionId).toBe('pos-cash-usd');
  });

  it('does not fall back to a different account when account has no matching currency', () => {
    const result = toolCallToAction('update_cash', {
      currency: 'USD', amount: 20000, account: 'Revolut',
    }, FIXTURE_DB);

    expect(result!.matchedAccountId).toBe('acct-revolut');
    expect(result!.matchedPositionId).toBeUndefined();
  });

  it('does not resolve ambiguous partial account names for cash updates', () => {
    const result = toolCallToAction('update_cash', {
      currency: 'EUR', amount: 20000, account: 'revol',
    }, FIXTURE_DB);

    expect(result!.matchedAccountId).toBeUndefined();
    expect(result!.matchedPositionId).toBeUndefined();
  });
});

// ─── toolCallToAction: remove_position ──────────────────────────────────────

describe('toolCallToAction — remove_position', () => {
  it('basic remove', () => {
    const result = toolCallToAction('remove_position', { symbol: 'GOLD' }, FIXTURE_DB);

    expect(result!.action).toBe('remove');
    expect(result!.symbol).toBe('GOLD');
    expect(result!.matchedPositionId).toBe('pos-gold');
    expect(result!.summary).toBe('Remove GOLD from portfolio');
  });

  it('remove unmatched symbol', () => {
    const result = toolCallToAction('remove_position', { symbol: 'DOGE' }, FIXTURE_DB);

    expect(result!.matchedPositionId).toBeUndefined();
  });
});

// ─── toolCallToAction: update_position ──────────────────────────────────────

describe('toolCallToAction — update_position', () => {
  it('update amount', () => {
    const result = toolCallToAction('update_position', {
      symbol: 'bitcoin', amount: 0.6,
    }, FIXTURE_DB);

    expect(result!.action).toBe('update_position');
    expect(result!.amount).toBe(0.6);
    expect(result!.matchedPositionId).toBe('pos-btc');
  });

  it('update cost basis', () => {
    const result = toolCallToAction('update_position', {
      symbol: 'AAPL', costBasis: 9000,
    }, FIXTURE_DB);

    expect(result!.costBasis).toBe(9000);
    expect(result!.matchedPositionId).toBe('pos-aapl');
  });

  it('update date', () => {
    const result = toolCallToAction('update_position', {
      symbol: 'ethereum', date: '2024-01-15',
    }, FIXTURE_DB);

    expect(result!.date).toBe('2024-01-15');
    expect(result!.matchedPositionId).toBe('pos-eth');
  });

  it('normalizes relative update date strings', () => {
    const result = toolCallToAction('update_position', {
      symbol: 'ethereum', date: 'yesterday',
    }, FIXTURE_DB);

    const expectedYesterday = new Date();
    expectedYesterday.setDate(expectedYesterday.getDate() - 1);

    expect(result!.date).toBe(expectedYesterday.toISOString().split('T')[0]);
  });

  it('does not preselect matched position when symbol is ambiguous', () => {
    const duplicatePositions: Position[] = [
      ...FIXTURE_POSITIONS,
      makePosition({ id: 'pos-aapl-2', symbol: 'AAPL', name: 'Apple Alt', amount: 20, type: 'stock', assetClass: 'equity', accountId: 'acct-bank', costBasis: 3000 }),
    ];
    const duplicateDb: ActionMapperData = {
      ...FIXTURE_DB,
      positions: duplicatePositions,
    };

    const result = toolCallToAction('update_position', {
      symbol: 'AAPL',
      amount: 10,
    }, duplicateDb);

    expect(result!.matchedPositionId).toBeUndefined();
  });

  it('resolves cash symbol variants to the same cash currency match', () => {
    const result = toolCallToAction('update_position', {
      symbol: 'CASH_USD',
      amount: 12000,
      assetType: 'cash',
    }, FIXTURE_DB);

    expect(result).not.toBeNull();
    expect(result!.action).toBe('update_position');
    expect(result!.assetType).toBe('cash');
    expect(result!.currency).toBe('USD');
    expect(result!.matchedPositionId).toBe('pos-cash-usd');
  });
});

// ─── toolCallToAction: set_price ────────────────────────────────────────────

describe('toolCallToAction — set_price', () => {
  it('basic set price', () => {
    const result = toolCallToAction('set_price', {
      symbol: 'BTC', price: 65000,
    }, FIXTURE_DB);

    expect(result!.action).toBe('set_price');
    expect(result!.symbol).toBe('BTC');
    expect(result!.newPrice).toBe(65000);
    expect(result!.assetType).toBe('crypto');
    expect(result!.summary).toBe('Set BTC price to $65000');
  });
});

// ─── toolCallToAction: edge cases ───────────────────────────────────────────

describe('toolCallToAction — edge cases', () => {
  it('unknown tool name returns null', () => {
    const result = toolCallToAction('unknown_tool', { symbol: 'BTC' }, FIXTURE_DB);
    expect(result).toBeNull();
  });

  it('non-confirmable tool (toggle_hide_balances) returns null', () => {
    const result = toolCallToAction('toggle_hide_balances', {}, FIXTURE_DB);
    expect(result).toBeNull();
  });

  it('missing symbol still creates action with empty symbol', () => {
    const result = toolCallToAction('buy_position', { amount: 5 }, FIXTURE_DB);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe('');
  });

  it('query tools return null', () => {
    expect(toolCallToAction('query_net_worth', {}, FIXTURE_DB)).toBeNull();
    expect(toolCallToAction('query_top_positions', {}, FIXTURE_DB)).toBeNull();
    expect(toolCallToAction('navigate', { page: 'dashboard' }, FIXTURE_DB)).toBeNull();
  });
});

// ─── Account resolution (dedicated section) ─────────────────────────────────

describe('toolCallToAction — account resolution', () => {
  it('exact name match resolves account', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'AAPL', amount: 10, account: 'Revolut',
    }, FIXTURE_DB);

    expect(result!.matchedAccountId).toBe('acct-revolut');
    expect(result!.accountName).toBe('Revolut');
  });

  it('substring match resolves account', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'AAPL', amount: 10, account: 'brok',
    }, FIXTURE_DB);

    expect(result!.matchedAccountId).toBe('acct-revolut-broker');
  });

  it('case-insensitive match resolves account', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'AAPL', amount: 10, account: 'revolut',
    }, FIXTURE_DB);

    expect(result!.matchedAccountId).toBe('acct-revolut');
    expect(result!.accountName).toBe('Revolut');
  });

  it('no match preserves accountName string', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'AAPL', amount: 10, account: 'Fidelity',
    }, FIXTURE_DB);

    expect(result!.matchedAccountId).toBeUndefined();
    expect(result!.accountName).toBe('Fidelity');
  });

  it('no account arg leaves both undefined', () => {
    const result = toolCallToAction('buy_position', {
      symbol: 'AAPL', amount: 10,
    }, FIXTURE_DB);

    expect(result!.matchedAccountId).toBeUndefined();
    expect(result!.accountName).toBeUndefined();
  });

  it('multiple accounts with similar names stay unresolved', () => {
    const db: ActionMapperData = {
      positions: [],
      accounts: [
        { id: 'acct-1', name: 'My Bank Account', connection: { dataSource: 'manual' } },
        { id: 'acct-2', name: 'My Bank Savings', connection: { dataSource: 'manual' } },
      ],
    };

    const result = toolCallToAction('buy_position', {
      symbol: 'ETH', amount: 1, account: 'My Bank',
    }, db);

    expect(result!.matchedAccountId).toBeUndefined();
    expect(result!.accountName).toBe('My Bank');
  });
});
