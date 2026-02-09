/**
 * Test harness for resolveAction() — 37 cases covering cash update bugs,
 * add cash, set price, remove, buy, sell, and edge cases.
 *
 * Run: npx tsx src/services/domain/__tests__/action-resolver.test.ts
 */

// Use relative imports to avoid @/ alias issues with tsx
import { resolveAction, RawLLMAction } from '../action-resolver';
import { PositionContext } from '../prompt-builder';

// ---------------------------------------------------------------------------
// Test fixture: positions
// ---------------------------------------------------------------------------

const POSITIONS: PositionContext[] = [
  { id: 'n26-eur', symbol: 'CASH_EUR_123', name: 'N26 (EUR)', type: 'cash', amount: 9868, accountName: 'N26' },
  { id: 'revolut-eur', symbol: 'CASH_EUR_456', name: 'Revolut (EUR)', type: 'cash', amount: 5000, accountName: 'Revolut' },
  { id: 'wise-usd', symbol: 'CASH_USD_789', name: 'Wise (USD)', type: 'cash', amount: 31733, accountName: 'Wise' },
  { id: 'btc-1', symbol: 'BTC', name: 'Bitcoin', type: 'crypto', amount: 0.5 },
  { id: 'eth-1', symbol: 'ETH', name: 'Ethereum', type: 'crypto', amount: 10 },
  { id: 'aapl-1', symbol: 'AAPL', name: 'Apple Inc', type: 'stock', amount: 50, costBasis: 9250 },
  { id: 'doge-1', symbol: 'DOGE', name: 'Dogecoin', type: 'crypto', amount: 10000 },
];

// ---------------------------------------------------------------------------
// Test case type
// ---------------------------------------------------------------------------

interface TestCase {
  id: number;
  input: string;
  mockLlmAction: Partial<RawLLMAction>;
  expected: {
    action: string;
    amount?: number;
    currency?: string;
    accountName?: string;
    matchedPositionId?: string;
    symbol?: string;
    newPrice?: number;
    pricePerUnit?: number;
    sellPercent?: number;
    sellPrice?: number;
    totalCost?: number;
  };
}

// ---------------------------------------------------------------------------
// 37 Test cases
// ---------------------------------------------------------------------------

const TEST_CASES: TestCase[] = [
  // =========================================================================
  // UPDATE CASH (the core bug area) — cases 1-15
  // =========================================================================
  {
    id: 1,
    input: 'N26 total EUR balance to 4811',
    mockLlmAction: { action: 'add_cash', symbol: 'UNKNOWN' },
    expected: { action: 'update_cash', amount: 4811, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },
  {
    id: 2,
    input: 'N26 EUR balance to 4811',
    mockLlmAction: { action: 'add_cash', symbol: 'UNKNOWN' },
    expected: { action: 'update_cash', amount: 4811, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },
  {
    id: 3,
    input: 'N26 EUR to 4810',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_EUR', currency: 'EUR', accountName: 'N26' },
    expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },
  {
    id: 4,
    input: 'N26 EUR is now 4810',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_EUR', currency: 'EUR', accountName: 'N26' },
    expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },
  {
    id: 5,
    input: 'N26 EUR = 4810',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_EUR', currency: 'EUR', accountName: 'N26' },
    expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },
  {
    id: 6,
    input: 'N26 EUR balance 4810',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_EUR', currency: 'EUR', accountName: 'N26' },
    expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },
  {
    id: 7,
    input: 'N26 EUR 4810',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_EUR', currency: 'EUR', accountName: 'N26' },
    expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },
  {
    id: 8,
    input: 'set N26 EUR balance to 4810',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_EUR', currency: 'EUR', accountName: 'N26' },
    expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },
  {
    id: 9,
    input: 'set N26 EUR to 4810',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_EUR', currency: 'EUR', accountName: 'N26' },
    expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },
  {
    id: 10,
    input: 'update N26 EUR to 4810',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_EUR', currency: 'EUR', accountName: 'N26' },
    expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },
  {
    id: 11,
    input: 'total EUR balance N26 to 4810',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_EUR', currency: 'EUR' },
    expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },
  {
    id: 12,
    input: 'Revolut EUR to 52000',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_EUR', currency: 'EUR', accountName: 'Revolut' },
    expected: { action: 'update_cash', amount: 52000, currency: 'EUR', accountName: 'Revolut', matchedPositionId: 'revolut-eur' },
  },
  {
    id: 13,
    input: 'Revolut EUR balance to 52k',
    mockLlmAction: { action: 'add_cash', symbol: 'UNKNOWN' },
    expected: { action: 'update_cash', amount: 52000, currency: 'EUR', accountName: 'Revolut', matchedPositionId: 'revolut-eur' },
  },
  {
    id: 14,
    input: 'Wise USD to 30000',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_USD', currency: 'USD', accountName: 'Wise' },
    expected: { action: 'update_cash', amount: 30000, currency: 'USD', accountName: 'Wise', matchedPositionId: 'wise-usd' },
  },
  {
    id: 15,
    input: 'N26 total EUR balance to 10k',
    mockLlmAction: { action: 'add_cash', symbol: 'UNKNOWN' },
    expected: { action: 'update_cash', amount: 10000, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },

  // =========================================================================
  // ADD CASH (must NOT regress) — cases 16-18
  // =========================================================================
  {
    id: 16,
    input: '49750 EUR to Revolut',
    mockLlmAction: { action: 'add_cash', symbol: 'CASH_EUR', currency: 'EUR', amount: 49750, accountName: 'Revolut' },
    expected: { action: 'add_cash', amount: 49750, currency: 'EUR', accountName: 'Revolut' },
  },
  {
    id: 17,
    input: '50k USD to IBKR',
    mockLlmAction: { action: 'add_cash', symbol: 'CASH_USD', currency: 'USD', amount: 50000, accountName: 'IBKR' },
    expected: { action: 'add_cash', amount: 50000, currency: 'USD', accountName: 'IBKR' },
  },
  {
    id: 18,
    input: '3000 GBP in Wise',
    mockLlmAction: { action: 'add_cash', symbol: 'CASH_GBP', currency: 'GBP', amount: 3000, accountName: 'Wise' },
    expected: { action: 'add_cash', amount: 3000, currency: 'GBP', accountName: 'Wise' },
  },

  // =========================================================================
  // SET PRICE — cases 19-21
  // =========================================================================
  {
    id: 19,
    input: 'BTC price 95000',
    mockLlmAction: { action: 'set_price', symbol: 'BTC' },
    expected: { action: 'set_price', symbol: 'BTC', newPrice: 95000 },
  },
  {
    id: 20,
    input: 'BTC price 95k',
    mockLlmAction: { action: 'set_price', symbol: 'BTC' },
    expected: { action: 'set_price', symbol: 'BTC', newPrice: 95000 },
  },
  {
    id: 21,
    input: 'set price of ETH to 3200',
    mockLlmAction: { action: 'set_price', symbol: 'ETH' },
    expected: { action: 'set_price', symbol: 'ETH' },
  },

  // =========================================================================
  // REMOVE — cases 22-24
  // =========================================================================
  {
    id: 22,
    input: 'remove DOGE',
    mockLlmAction: { action: 'remove', symbol: 'DOGE' },
    expected: { action: 'remove', symbol: 'DOGE', matchedPositionId: 'doge-1' },
  },
  {
    id: 23,
    input: 'delete DOGE',
    mockLlmAction: { action: 'buy', symbol: 'DOGE' },
    expected: { action: 'remove', symbol: 'DOGE' },
  },
  {
    id: 24,
    input: 'drop DOGE',
    mockLlmAction: { action: 'buy', symbol: 'DOGE' },
    expected: { action: 'remove', symbol: 'DOGE' },
  },

  // =========================================================================
  // BUY — cases 25-28
  // =========================================================================
  {
    id: 25,
    input: 'Bought 10 AAPL at $185',
    mockLlmAction: { action: 'buy', symbol: 'AAPL', amount: 10, pricePerUnit: 185 },
    expected: { action: 'buy', symbol: 'AAPL', amount: 10, pricePerUnit: 185 },
  },
  {
    id: 26,
    input: '0.5 BTC at 95k',
    mockLlmAction: { action: 'buy', symbol: 'BTC', amount: 0.5 },
    expected: { action: 'buy', symbol: 'BTC', amount: 0.5, pricePerUnit: 95000 },
  },
  {
    id: 27,
    input: '100 EURC at 1.05',
    mockLlmAction: { action: 'buy', symbol: 'EURC', amount: 100, pricePerUnit: 1.05 },
    expected: { action: 'buy', symbol: 'EURC' },
  },
  {
    id: 28,
    input: '20 AAPL for 50k',
    mockLlmAction: { action: 'buy', symbol: 'AAPL', amount: 20 },
    expected: { action: 'buy', symbol: 'AAPL', amount: 20, totalCost: 50000 },
  },

  // =========================================================================
  // SELL — cases 29-32
  // =========================================================================
  {
    id: 29,
    input: 'Sold half of my ETH',
    mockLlmAction: { action: 'sell_partial', symbol: 'ETH' },
    expected: { action: 'sell_partial', symbol: 'ETH', sellPercent: 50 },
  },
  {
    id: 30,
    input: 'Sold 50% of ETH at $3200',
    mockLlmAction: { action: 'sell_partial', symbol: 'ETH', sellPercent: 50 },
    expected: { action: 'sell_partial', symbol: 'ETH', sellPercent: 50, sellPrice: 3200 },
  },
  {
    id: 31,
    input: 'Sold all BTC',
    mockLlmAction: { action: 'sell_all', symbol: 'BTC' },
    expected: { action: 'sell_all', symbol: 'BTC' },
  },
  {
    id: 32,
    input: 'Closed my AAPL position',
    mockLlmAction: { action: 'sell_all', symbol: 'AAPL' },
    expected: { action: 'sell_all', symbol: 'AAPL' },
  },

  // =========================================================================
  // EDGE CASES — cases 33-37
  // =========================================================================
  {
    id: 33,
    input: 'N26 total EUR balance to 4811',
    mockLlmAction: { action: 'add_cash', symbol: 'UNKNOWN' },
    expected: { action: 'update_cash', amount: 4811, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },
  {
    id: 34,
    input: 'N26 EUR to 4810',
    mockLlmAction: { action: 'buy', symbol: 'EUR' },
    expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },
  {
    id: 35,
    input: '49750 EUR to Revolut',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_EUR', currency: 'EUR', amount: 49750, accountName: 'Revolut' },
    expected: { action: 'add_cash', amount: 49750, currency: 'EUR', accountName: 'Revolut' },
  },
  {
    id: 36,
    input: 'N26 EUR balance to 0',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_EUR', currency: 'EUR', accountName: 'N26' },
    expected: { action: 'update_cash', amount: 0, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },
  {
    id: 37,
    input: 'Wise USD balance to 31733.50',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_USD', currency: 'USD', accountName: 'Wise' },
    expected: { action: 'update_cash', amount: 31733.50, currency: 'USD', accountName: 'Wise', matchedPositionId: 'wise-usd' },
  },

  // =========================================================================
  // EXTENDED CASES — 38-57 (broader portfolio operations)
  // =========================================================================

  // --- Cash: decimal amounts, abbreviations, alternate phrasings ---
  {
    id: 38,
    input: 'N26 EUR balance to 4811.50',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_EUR', currency: 'EUR', accountName: 'N26' },
    expected: { action: 'update_cash', amount: 4811.50, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },
  {
    id: 39,
    input: 'Revolut EUR is now 52k',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_EUR', currency: 'EUR', accountName: 'Revolut' },
    expected: { action: 'update_cash', amount: 52000, currency: 'EUR', accountName: 'Revolut', matchedPositionId: 'revolut-eur' },
  },
  {
    id: 40,
    input: 'Revolut EUR now 48000',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_EUR', currency: 'EUR', accountName: 'Revolut' },
    expected: { action: 'update_cash', amount: 48000, currency: 'EUR', accountName: 'Revolut', matchedPositionId: 'revolut-eur' },
  },
  {
    id: 41,
    input: 'N26 total EUR 5000',
    mockLlmAction: { action: 'add_cash', symbol: 'UNKNOWN' },
    expected: { action: 'update_cash', amount: 5000, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },
  {
    id: 42,
    input: 'N26 EUR balance to 1.5k',
    mockLlmAction: { action: 'add_cash', symbol: 'UNKNOWN' },
    expected: { action: 'update_cash', amount: 1500, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' },
  },
  {
    id: 43,
    input: 'update Revolut EUR balance to 6000',
    mockLlmAction: { action: 'update_cash', symbol: 'CASH_EUR', currency: 'EUR', accountName: 'Revolut' },
    expected: { action: 'update_cash', amount: 6000, currency: 'EUR', accountName: 'Revolut', matchedPositionId: 'revolut-eur' },
  },

  // --- Cash: add with large/uncommon amounts ---
  {
    id: 44,
    input: '1.5m USD to IBKR',
    mockLlmAction: { action: 'add_cash', symbol: 'CASH_USD', currency: 'USD', amount: 1500000, accountName: 'IBKR' },
    expected: { action: 'add_cash', amount: 1500000, currency: 'USD', accountName: 'IBKR' },
  },
  {
    id: 45,
    input: '50000 JPY to N26',
    mockLlmAction: { action: 'add_cash', symbol: 'CASH_JPY', currency: 'JPY', amount: 50000, accountName: 'N26' },
    expected: { action: 'add_cash', amount: 50000, currency: 'JPY', accountName: 'N26' },
  },

  // --- Buy: edge cases ---
  {
    id: 46,
    input: 'Bought 0.1 BTC',
    mockLlmAction: { action: 'buy', symbol: 'BTC', amount: 0.1 },
    expected: { action: 'buy', symbol: 'BTC', amount: 0.1 },
  },
  {
    id: 47,
    input: 'Buy 100 DOGE at $0.15',
    mockLlmAction: { action: 'buy', symbol: 'DOGE', amount: 100 },
    expected: { action: 'buy', symbol: 'DOGE', amount: 100, pricePerUnit: 0.15 },
  },
  {
    id: 48,
    input: '1000 DOGE for 150',
    mockLlmAction: { action: 'buy', symbol: 'DOGE', amount: 1000 },
    expected: { action: 'buy', symbol: 'DOGE', amount: 1000, totalCost: 150 },
  },
  {
    id: 49,
    input: '0.001 BTC at 95000',
    mockLlmAction: { action: 'buy', symbol: 'BTC', amount: 0.001 },
    expected: { action: 'buy', symbol: 'BTC', amount: 0.001, pricePerUnit: 95000 },
  },

  // --- Sell: edge cases ---
  {
    id: 50,
    input: 'Sold 25% of AAPL',
    mockLlmAction: { action: 'sell_partial', symbol: 'AAPL' },
    expected: { action: 'sell_partial', symbol: 'AAPL', sellPercent: 25 },
  },
  {
    id: 51,
    input: 'Sold all DOGE at 0.20',
    mockLlmAction: { action: 'sell_all', symbol: 'DOGE', sellPrice: 0.20 },
    expected: { action: 'sell_all', symbol: 'DOGE', sellPrice: 0.20 },
  },
  {
    id: 52,
    input: 'Sold a third of BTC',
    mockLlmAction: { action: 'sell_partial', symbol: 'BTC' },
    expected: { action: 'sell_partial', symbol: 'BTC', sellPercent: 33.33 },
  },
  {
    id: 53,
    input: 'Sold a quarter of ETH at $3500',
    mockLlmAction: { action: 'sell_partial', symbol: 'ETH' },
    expected: { action: 'sell_partial', symbol: 'ETH', sellPercent: 25, sellPrice: 3500 },
  },

  // --- Set price: edge cases ---
  {
    id: 54,
    input: 'AAPL price 200',
    mockLlmAction: { action: 'set_price', symbol: 'AAPL' },
    expected: { action: 'set_price', symbol: 'AAPL', newPrice: 200 },
  },
  {
    id: 55,
    input: 'ETH price 3.5k',
    mockLlmAction: { action: 'set_price', symbol: 'ETH' },
    expected: { action: 'set_price', symbol: 'ETH', newPrice: 3500 },
  },

  // --- 3-letter crypto should NOT be treated as fiat ---
  {
    id: 56,
    input: '100 SOL at 150',
    mockLlmAction: { action: 'buy', symbol: 'SOL', amount: 100 },
    expected: { action: 'buy', symbol: 'SOL', amount: 100, pricePerUnit: 150 },
  },

  // --- LLM correction: wrong action must be overridden ---
  {
    id: 57,
    input: 'Revolut EUR balance to 6500',
    mockLlmAction: { action: 'buy', symbol: 'EUR', amount: 6500 },
    expected: { action: 'update_cash', amount: 6500, currency: 'EUR', accountName: 'Revolut', matchedPositionId: 'revolut-eur' },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const tc of TEST_CASES) {
  const result = resolveAction(tc.mockLlmAction as RawLLMAction, tc.input, POSITIONS);

  const errors: string[] = [];

  // Check action
  if (result.action !== tc.expected.action) {
    errors.push(`action: got "${result.action}", expected "${tc.expected.action}"`);
  }

  // Check optional expected fields
  if (tc.expected.amount !== undefined && result.amount !== tc.expected.amount) {
    errors.push(`amount: got ${result.amount}, expected ${tc.expected.amount}`);
  }
  if (tc.expected.currency !== undefined && result.currency !== tc.expected.currency) {
    errors.push(`currency: got "${result.currency}", expected "${tc.expected.currency}"`);
  }
  if (tc.expected.accountName !== undefined && result.accountName !== tc.expected.accountName) {
    errors.push(`accountName: got "${result.accountName}", expected "${tc.expected.accountName}"`);
  }
  if (tc.expected.matchedPositionId !== undefined && result.matchedPositionId !== tc.expected.matchedPositionId) {
    errors.push(`matchedPositionId: got "${result.matchedPositionId}", expected "${tc.expected.matchedPositionId}"`);
  }
  if (tc.expected.symbol !== undefined && result.symbol !== tc.expected.symbol) {
    errors.push(`symbol: got "${result.symbol}", expected "${tc.expected.symbol}"`);
  }
  if (tc.expected.newPrice !== undefined && result.newPrice !== tc.expected.newPrice) {
    errors.push(`newPrice: got ${result.newPrice}, expected ${tc.expected.newPrice}`);
  }
  if (tc.expected.pricePerUnit !== undefined && result.pricePerUnit !== tc.expected.pricePerUnit) {
    errors.push(`pricePerUnit: got ${result.pricePerUnit}, expected ${tc.expected.pricePerUnit}`);
  }
  if (tc.expected.sellPercent !== undefined && result.sellPercent !== tc.expected.sellPercent) {
    errors.push(`sellPercent: got ${result.sellPercent}, expected ${tc.expected.sellPercent}`);
  }
  if (tc.expected.sellPrice !== undefined && result.sellPrice !== tc.expected.sellPrice) {
    errors.push(`sellPrice: got ${result.sellPrice}, expected ${tc.expected.sellPrice}`);
  }
  if (tc.expected.totalCost !== undefined && result.totalCost !== tc.expected.totalCost) {
    errors.push(`totalCost: got ${result.totalCost}, expected ${tc.expected.totalCost}`);
  }

  if (errors.length === 0) {
    passed++;
    console.log(`  ✓ #${tc.id}: ${tc.input}`);
  } else {
    failed++;
    const msg = `  ✗ #${tc.id}: ${tc.input}\n    ${errors.join('\n    ')}`;
    console.log(msg);
    failures.push(msg);
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${TEST_CASES.length}`);

if (failures.length > 0) {
  console.log(`\nFailed cases:`);
  for (const f of failures) console.log(f);
  process.exit(1);
} else {
  console.log('All tests passed!');
  process.exit(0);
}
