/**
 * Test harness for the Action Catalog pipeline — 57 cases.
 *
 * These tests simulate the LLM by programmatically picking the best
 * menu item based on token overlap, then resolve via the catalog.
 * No Ollama needed.
 *
 * Run: npx tsx src/services/domain/__tests__/action-catalog.test.ts
 */

import { getActionCatalog } from '../actions/action-catalog';
import { ALL_HANDLERS } from '../actions/handlers';
import { PositionContext, MenuItem } from '../actions/types';
import { parseAbbreviatedNumber } from '../actions/parse-value';
import { getFiatCurrencies } from '../category-service';

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
// LLM simulator — picks the best menu item from the filtered menu
// ---------------------------------------------------------------------------

function simulateLLM(
  userText: string,
  menu: MenuItem[],
): { menuId: string; values: Record<string, string>; confidence: number } {
  const text = userText.toLowerCase();
  const tokens = text.split(/\s+/).filter(t => t.length > 0);
  const fiatSet = getFiatCurrencies();

  // Score each menu item
  const scored = menu.map(item => {
    const haystack = (item.id + ' ' + item.label + ' ' + item.description).toLowerCase();
    let score = tokens.filter(t => haystack.includes(t)).length;

    // Bonus for exact handler match based on text patterns
    if (/^(?:remove|delete|drop)\s+/i.test(userText) && item._handler === 'remove') score += 5;
    if (/\bprice\s+\$?\d/i.test(userText) && item._handler === 'set-price') score += 5;
    if (/^(?:set\s+)?price\s+/i.test(userText) && item._handler === 'set-price') score += 5;
    if (/^(?:sold|sell)\s+all\b/i.test(userText) && item._handler === 'sell-all') score += 5;
    if (/^closed?\s+/i.test(userText) && item._handler === 'sell-all') score += 5;
    if ((/^(?:sold|sell)\s+/i.test(userText) && !/\ball\b/i.test(userText)) && item._handler === 'sell-partial') score += 5;
    if (/^(?:bought|buy|purchased)\s+/i.test(userText) && item._handler === 'buy') score += 3;

    // Implicit buy: "{num} {SYMBOL} at {price}" or "{num} {SYMBOL} for {total}"
    // Only match if the symbol is NOT a fiat currency
    const implicitBuyMatch = text.match(/^(\d+(?:\.\d+)?)\s+([a-z]{2,10})\s+(?:at|for|@)\s+/i);
    if (implicitBuyMatch && !fiatSet.has(implicitBuyMatch[2].toLowerCase()) && item._handler === 'buy') {
      const implicitSymbol = implicitBuyMatch[2].toLowerCase();
      if (item.id.includes(implicitSymbol) || item.id === 'buy_new') score += 8;
    }

    // Exact symbol match in menu item ID — strong signal
    const symbolsInText = tokens.filter(t => /^[a-z]{2,10}$/i.test(t) && !fiatSet.has(t) && !['at', 'for', 'to', 'in', 'of', 'my', 'all', 'the', 'set', 'buy', 'sold', 'sell', 'bought', 'purchased', 'remove', 'delete', 'drop', 'update', 'price', 'balance', 'total', 'new', 'now', 'is', 'half', 'third', 'quarter', 'closed', 'shares'].includes(t));
    for (const sym of symbolsInText) {
      if (item.id.includes(`_${sym}`) || item.id.endsWith(`_${sym}`)) score += 3;
    }

    // Cash action detection
    // Pattern: "{account} {FIAT} to/balance/= {num}" → update_cash
    const acctFiatNumMatch = text.match(
      /^(.+?)\s+([a-z]{3})\s+(?:total\s+)?(?:balance\s+)?(?:to|is\s+now|now|=|balance)\s+(\d+(?:[.,]\d+)?[kmb]?)$/i
    );
    if (acctFiatNumMatch && fiatSet.has(acctFiatNumMatch[2]) && item._handler === 'update-cash') {
      const acctName = acctFiatNumMatch[1].replace(/^(?:set|update)\s+/i, '').replace(/\s+(?:total|new|current)\b/gi, '').trim();
      if (item.id.toLowerCase().includes(acctName.toLowerCase())) score += 10;
    }

    // Pattern: "{account} {FIAT} {num}" (bare) → update_cash
    const bareCashMatch = text.match(/^(.+?)\s+([a-z]{3})\s+(\d+(?:[.,]\d+)?[kmb]?)$/i);
    if (bareCashMatch && fiatSet.has(bareCashMatch[2]) && item._handler === 'update-cash') {
      const acctName = bareCashMatch[1].replace(/^(?:set|update)\s+/i, '').replace(/\s+(?:total|new|current)\b/gi, '').trim();
      if (item.id.toLowerCase().includes(acctName.toLowerCase())) score += 10;
    }

    // Pattern: "set/update {account} {FIAT} (balance)? to? {num}" → update_cash
    const verbCashMatch = text.match(
      /^(?:set|update)\s+(.+?)\s+([a-z]{3})\s+(?:balance\s+)?(?:to\s+)?(\d+(?:[.,]\d+)?[kmb]?)$/i
    );
    if (verbCashMatch && fiatSet.has(verbCashMatch[2]) && item._handler === 'update-cash') {
      const acctName = verbCashMatch[1].trim();
      if (item.id.toLowerCase().includes(acctName.toLowerCase())) score += 10;
    }

    // Pattern: "total/new {FIAT} balance {account} to {num}" → update_cash
    const reversedCashMatch = text.match(
      /^(?:total|new)\s+([a-z]{3})\s+balance\s+(.+?)\s+(?:to\s+)?(\d+(?:[.,]\d+)?[kmb]?)$/i
    );
    if (reversedCashMatch && fiatSet.has(reversedCashMatch[1]) && item._handler === 'update-cash') {
      const acctName = reversedCashMatch[2].trim();
      if (item.id.toLowerCase().includes(acctName.toLowerCase())) score += 10;
    }

    // Pattern: "{account} (total)? {FIAT} balance (to)? {num}" → update_cash
    const noisyCashMatch = text.match(
      /^(.+?)\s+(?:total\s+)?([a-z]{3})\s+(?:balance\s+(?:to|is|=)\s*|balance\s+)(\d+(?:[.,]\d+)?[kmb]?)$/i
    );
    if (noisyCashMatch && fiatSet.has(noisyCashMatch[2]) && item._handler === 'update-cash') {
      const acctName = noisyCashMatch[1].replace(/\s+(?:total|new|current)\b/gi, '').trim();
      if (item.id.toLowerCase().includes(acctName.toLowerCase())) score += 10;
    }

    // Pattern: "(Add)? {num} {FIAT} to/in {account}" → add_cash
    const addCashMatch = text.match(
      /^(?:add\s+)?(\d+(?:[.,]\d+)?[kmb]?)\s+([a-z]{3})\s+(?:to|in|into|at)\s+(.+)$/i
    );
    if (addCashMatch && fiatSet.has(addCashMatch[2]) && item._handler === 'add-cash') {
      const matchedCurrency = addCashMatch[2].toLowerCase();
      const matchedAccount = addCashMatch[3].trim().toLowerCase();
      // Per-account item: bonus only if both account name AND currency match
      if (item.id !== 'add_cash_generic') {
        if (item.id.includes(matchedAccount.replace(/\s+/g, '_')) && item.id.includes(matchedCurrency)) {
          score += 15; // Strong match: both account + currency
        }
        // If only account matches but not currency, don't boost (let generic win)
      } else {
        score += 10; // Generic fallback always gets base boost
      }
    }

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (!best || best.score === 0) {
    return { menuId: 'buy_new', values: {}, confidence: 0.1 };
  }

  // Extract values from user text based on the item's fields
  const values = extractValues(userText, best.item);

  return {
    menuId: best.item.id,
    values,
    confidence: 0.9,
  };
}

/**
 * Extract field values from user text for the given menu item.
 * This simulates what the LLM would extract.
 */
function extractValues(userText: string, item: MenuItem): Record<string, string> {
  const values: Record<string, string> = {};
  const fiatSet = getFiatCurrencies();

  // For update_cash: extract amount from patterns
  if (item._handler === 'update-cash') {
    // Find the number at the end (or near the end)
    const numbers = [...userText.matchAll(/(\d+(?:[.,]\d+)?[kmb]?)/gi)];
    if (numbers.length > 0) {
      const lastNum = numbers[numbers.length - 1][1].replace(',', '.');
      values.amount = String(parseAbbreviatedNumber(lastNum) ?? lastNum);
    }
    return values;
  }

  // For add_cash: extract amount, currency, account
  if (item._handler === 'add-cash') {
    const addCashMatch = userText.match(
      /^(?:add\s+)?(\d+(?:[.,]\d+)?[kmb]?)\s+([a-zA-Z]{3})\s+(?:to|in|into|at)\s+(.+)$/i
    );
    if (addCashMatch && fiatSet.has(addCashMatch[2].toLowerCase())) {
      const amt = parseAbbreviatedNumber(addCashMatch[1].replace(',', '.'));
      values.amount = String(amt ?? addCashMatch[1]);
      values.currency = addCashMatch[2].toUpperCase();
      values.account = addCashMatch[3].trim();
    }
    return values;
  }

  // For buy: extract amount, price, totalCost, symbol
  if (item._handler === 'buy') {
    // If it's buy_new, extract symbol
    if (item.id === 'buy_new') {
      // Try to find the symbol from the text
      const symbolMatch = userText.match(/(?:bought|buy|purchased)?\s*\d+(?:\.\d+)?\s+([A-Z]{2,10})/i);
      if (symbolMatch) values.symbol = symbolMatch[1].toUpperCase();
      // Also try leading pattern "0.5 BTC ..."
      if (!values.symbol) {
        const leadingMatch = userText.match(/^\d+(?:\.\d+)?\s+([A-Z]{2,10})/i);
        if (leadingMatch) values.symbol = leadingMatch[1].toUpperCase();
      }
    }

    // Amount
    const amountMatch = userText.match(/(?:bought|purchased|buy)\s+(\d+(?:\.\d+)?)\s/i);
    if (amountMatch) {
      values.amount = amountMatch[1];
    } else {
      // Leading number pattern: "0.5 BTC at 95k", "100 EURC at 1.05"
      const leadingNum = userText.match(/^(\d+(?:\.\d+)?)\s/i);
      if (leadingNum) values.amount = leadingNum[1];
    }

    // Price: "at $X" or "at Xk"
    const priceMatch = userText.match(/(?:at|@)\s*\$?(\d+(?:\.\d+)?[kmb]?)/i);
    if (priceMatch) {
      const p = parseAbbreviatedNumber(priceMatch[1]);
      if (p != null) values.price = String(p);
    }

    // Total cost: "for $X"
    const totalMatch = userText.match(/for\s+\$?(\d+(?:\.\d+)?[kmb]?)/i);
    if (totalMatch) {
      const t = parseAbbreviatedNumber(totalMatch[1]);
      if (t != null) values.totalCost = String(t);
    }

    return values;
  }

  // For sell_partial: extract percent, sellAmount, price
  if (item._handler === 'sell-partial') {
    const percentMatch = userText.match(/(\d+)\s*%/i);
    if (percentMatch) values.percent = percentMatch[1];
    else if (/\bhalf\b/i.test(userText)) values.percent = '50';
    else if (/\bthird\b/i.test(userText)) values.percent = '33.33';
    else if (/\bquarter\b/i.test(userText)) values.percent = '25';

    // Sell amount: "sold 50 shares"
    if (!values.percent) {
      const sellAmountMatch = userText.match(/(?:sold|sell)\s+(\d+(?:\.\d+)?)\s+(?:shares?|units?|\w)/i);
      if (sellAmountMatch) values.sellAmount = sellAmountMatch[1];
    }

    // Price: "at $X"
    const priceMatch = userText.match(/(?:at|@)\s*\$?(\d+(?:\.\d+)?[kmb]?)/i);
    if (priceMatch) {
      const p = parseAbbreviatedNumber(priceMatch[1]);
      if (p != null) values.price = String(p);
    }

    return values;
  }

  // For sell_all: extract price
  if (item._handler === 'sell-all') {
    const priceMatch = userText.match(/(?:at|@)\s*\$?(\d+(?:\.\d+)?[kmb]?)/i);
    if (priceMatch) {
      const p = parseAbbreviatedNumber(priceMatch[1]);
      if (p != null) values.price = String(p);
    }
    return values;
  }

  // For set_price: extract price
  if (item._handler === 'set-price') {
    const priceMatch = userText.match(/(?:price|=|to)\s*\$?(\d+(?:[.,]\d+)?[kmb]?)/i);
    if (priceMatch) {
      const p = parseAbbreviatedNumber(priceMatch[1]);
      if (p != null) values.price = String(p);
    }
    return values;
  }

  // For remove: no values needed
  return values;
}

// ---------------------------------------------------------------------------
// Test case type
// ---------------------------------------------------------------------------

interface TestCase {
  id: number;
  input: string;
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
// 57 Test cases (same expectations as the v1 test suite)
// ---------------------------------------------------------------------------

const TEST_CASES: TestCase[] = [
  // =========================================================================
  // UPDATE CASH — cases 1-15
  // =========================================================================
  { id: 1, input: 'N26 total EUR balance to 4811', expected: { action: 'update_cash', amount: 4811, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },
  { id: 2, input: 'N26 EUR balance to 4811', expected: { action: 'update_cash', amount: 4811, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },
  { id: 3, input: 'N26 EUR to 4810', expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },
  { id: 4, input: 'N26 EUR is now 4810', expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },
  { id: 5, input: 'N26 EUR = 4810', expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },
  { id: 6, input: 'N26 EUR balance 4810', expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },
  { id: 7, input: 'N26 EUR 4810', expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },
  { id: 8, input: 'set N26 EUR balance to 4810', expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },
  { id: 9, input: 'set N26 EUR to 4810', expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },
  { id: 10, input: 'update N26 EUR to 4810', expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },
  { id: 11, input: 'total EUR balance N26 to 4810', expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },
  { id: 12, input: 'Revolut EUR to 52000', expected: { action: 'update_cash', amount: 52000, currency: 'EUR', accountName: 'Revolut', matchedPositionId: 'revolut-eur' } },
  { id: 13, input: 'Revolut EUR balance to 52k', expected: { action: 'update_cash', amount: 52000, currency: 'EUR', accountName: 'Revolut', matchedPositionId: 'revolut-eur' } },
  { id: 14, input: 'Wise USD to 30000', expected: { action: 'update_cash', amount: 30000, currency: 'USD', accountName: 'Wise', matchedPositionId: 'wise-usd' } },
  { id: 15, input: 'N26 total EUR balance to 10k', expected: { action: 'update_cash', amount: 10000, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },

  // =========================================================================
  // ADD CASH — cases 16-18
  // =========================================================================
  { id: 16, input: '49750 EUR to Revolut', expected: { action: 'add_cash', amount: 49750, currency: 'EUR', accountName: 'Revolut', matchedPositionId: 'revolut-eur' } },
  { id: 17, input: '50k USD to IBKR', expected: { action: 'add_cash', amount: 50000, currency: 'USD', accountName: 'IBKR' } },
  { id: 18, input: '3000 GBP in Wise', expected: { action: 'add_cash', amount: 3000, currency: 'GBP', accountName: 'Wise' } },
  { id: 58, input: '5000 EUR to Revolut', expected: { action: 'add_cash', amount: 5000, currency: 'EUR', accountName: 'Revolut', matchedPositionId: 'revolut-eur' } },
  { id: 59, input: 'Add 50000 EUR to N26', expected: { action: 'add_cash', amount: 50000, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },

  // =========================================================================
  // SET PRICE — cases 19-21
  // =========================================================================
  { id: 19, input: 'BTC price 95000', expected: { action: 'set_price', symbol: 'BTC', newPrice: 95000 } },
  { id: 20, input: 'BTC price 95k', expected: { action: 'set_price', symbol: 'BTC', newPrice: 95000 } },
  { id: 21, input: 'set price of ETH to 3200', expected: { action: 'set_price', symbol: 'ETH' } },

  // =========================================================================
  // REMOVE — cases 22-24
  // =========================================================================
  { id: 22, input: 'remove DOGE', expected: { action: 'remove', symbol: 'DOGE', matchedPositionId: 'doge-1' } },
  { id: 23, input: 'delete DOGE', expected: { action: 'remove', symbol: 'DOGE' } },
  { id: 24, input: 'drop DOGE', expected: { action: 'remove', symbol: 'DOGE' } },

  // =========================================================================
  // BUY — cases 25-28
  // =========================================================================
  { id: 25, input: 'Bought 10 AAPL at $185', expected: { action: 'buy', symbol: 'AAPL', amount: 10, pricePerUnit: 185 } },
  { id: 26, input: '0.5 BTC at 95k', expected: { action: 'buy', symbol: 'BTC', amount: 0.5, pricePerUnit: 95000 } },
  { id: 27, input: '100 EURC at 1.05', expected: { action: 'buy', symbol: 'EURC' } },
  { id: 28, input: '20 AAPL for 50k', expected: { action: 'buy', symbol: 'AAPL', amount: 20, totalCost: 50000 } },

  // =========================================================================
  // SELL — cases 29-32
  // =========================================================================
  { id: 29, input: 'Sold half of my ETH', expected: { action: 'sell_partial', symbol: 'ETH', sellPercent: 50 } },
  { id: 30, input: 'Sold 50% of ETH at $3200', expected: { action: 'sell_partial', symbol: 'ETH', sellPercent: 50, sellPrice: 3200 } },
  { id: 31, input: 'Sold all BTC', expected: { action: 'sell_all', symbol: 'BTC' } },
  { id: 32, input: 'Closed my AAPL position', expected: { action: 'sell_all', symbol: 'AAPL' } },

  // =========================================================================
  // EDGE CASES — cases 33-37
  // =========================================================================
  { id: 33, input: 'N26 total EUR balance to 4811', expected: { action: 'update_cash', amount: 4811, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },
  { id: 34, input: 'N26 EUR to 4810', expected: { action: 'update_cash', amount: 4810, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },
  { id: 35, input: '49750 EUR to Revolut', expected: { action: 'add_cash', amount: 49750, currency: 'EUR', accountName: 'Revolut', matchedPositionId: 'revolut-eur' } },
  { id: 36, input: 'N26 EUR balance to 0', expected: { action: 'update_cash', amount: 0, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },
  { id: 37, input: 'Wise USD balance to 31733.50', expected: { action: 'update_cash', amount: 31733.50, currency: 'USD', accountName: 'Wise', matchedPositionId: 'wise-usd' } },

  // =========================================================================
  // EXTENDED CASES — 38-57
  // =========================================================================
  { id: 38, input: 'N26 EUR balance to 4811.50', expected: { action: 'update_cash', amount: 4811.50, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },
  { id: 39, input: 'Revolut EUR is now 52k', expected: { action: 'update_cash', amount: 52000, currency: 'EUR', accountName: 'Revolut', matchedPositionId: 'revolut-eur' } },
  { id: 40, input: 'Revolut EUR now 48000', expected: { action: 'update_cash', amount: 48000, currency: 'EUR', accountName: 'Revolut', matchedPositionId: 'revolut-eur' } },
  { id: 41, input: 'N26 total EUR 5000', expected: { action: 'update_cash', amount: 5000, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },
  { id: 42, input: 'N26 EUR balance to 1.5k', expected: { action: 'update_cash', amount: 1500, currency: 'EUR', accountName: 'N26', matchedPositionId: 'n26-eur' } },
  { id: 43, input: 'update Revolut EUR balance to 6000', expected: { action: 'update_cash', amount: 6000, currency: 'EUR', accountName: 'Revolut', matchedPositionId: 'revolut-eur' } },
  { id: 44, input: '1.5m USD to IBKR', expected: { action: 'add_cash', amount: 1500000, currency: 'USD', accountName: 'IBKR' } },
  { id: 45, input: '50000 JPY to N26', expected: { action: 'add_cash', amount: 50000, currency: 'JPY', accountName: 'N26' } },
  { id: 46, input: 'Bought 0.1 BTC', expected: { action: 'buy', symbol: 'BTC', amount: 0.1 } },
  { id: 47, input: 'Buy 100 DOGE at $0.15', expected: { action: 'buy', symbol: 'DOGE', amount: 100, pricePerUnit: 0.15 } },
  { id: 48, input: '1000 DOGE for 150', expected: { action: 'buy', symbol: 'DOGE', amount: 1000, totalCost: 150 } },
  { id: 49, input: '0.001 BTC at 95000', expected: { action: 'buy', symbol: 'BTC', amount: 0.001, pricePerUnit: 95000 } },
  { id: 50, input: 'Sold 25% of AAPL', expected: { action: 'sell_partial', symbol: 'AAPL', sellPercent: 25 } },
  { id: 51, input: 'Sold all DOGE at 0.20', expected: { action: 'sell_all', symbol: 'DOGE', sellPrice: 0.20 } },
  { id: 52, input: 'Sold a third of BTC', expected: { action: 'sell_partial', symbol: 'BTC', sellPercent: 33.33 } },
  { id: 53, input: 'Sold a quarter of ETH at $3500', expected: { action: 'sell_partial', symbol: 'ETH', sellPercent: 25, sellPrice: 3500 } },
  { id: 54, input: 'AAPL price 200', expected: { action: 'set_price', symbol: 'AAPL', newPrice: 200 } },
  { id: 55, input: 'ETH price 3.5k', expected: { action: 'set_price', symbol: 'ETH', newPrice: 3500 } },
  { id: 56, input: '100 SOL at 150', expected: { action: 'buy', symbol: 'SOL', amount: 100, pricePerUnit: 150 } },
  { id: 57, input: 'Revolut EUR balance to 6500', expected: { action: 'update_cash', amount: 6500, currency: 'EUR', accountName: 'Revolut', matchedPositionId: 'revolut-eur' } },
];

// ---------------------------------------------------------------------------
// Runner utilities
// ---------------------------------------------------------------------------

const catalog = getActionCatalog();
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, msg: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(`  \u2717 ${msg}`);
    console.log(`  \u2717 ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// SECTION 1: Original 57 test cases
// ---------------------------------------------------------------------------

console.log('\n--- Section 1: Original 57 test cases ---');

for (const tc of TEST_CASES) {
  const menu = catalog.generateFilteredMenu(POSITIONS, tc.input);
  const llmResponse = simulateLLM(tc.input, menu);
  const result = catalog.resolve(llmResponse, POSITIONS);

  const errors: string[] = [];

  if (result.action !== tc.expected.action) {
    errors.push(`action: got "${result.action}", expected "${tc.expected.action}"`);
  }
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
    console.log(`  \u2713 #${tc.id}: ${tc.input}`);
  } else {
    failed++;
    const msg = `  \u2717 #${tc.id}: ${tc.input}\n    ${errors.join('\n    ')}`;
    console.log(msg);
    failures.push(msg);
  }
}

// ---------------------------------------------------------------------------
// SECTION 2: Handler → Executor Contract Tests
// ---------------------------------------------------------------------------

console.log('\n--- Section 2: Handler → Executor Contract ---');

// The valid executor action types (cases in executeAction switch)
const EXECUTOR_ACTIONS = new Set(['sell_all', 'sell_partial', 'buy', 'add_cash', 'update_cash', 'remove', 'set_price']);

// 2a: Every handler's actionType maps to a valid executor case
{
  for (const handler of ALL_HANDLERS) {
    assert(
      EXECUTOR_ACTIONS.has(handler.actionType),
      `Handler "${handler.id}" actionType "${handler.actionType}" has a matching executor case`,
    );
    if (EXECUTOR_ACTIONS.has(handler.actionType)) {
      console.log(`  \u2713 Handler "${handler.id}" → executor case "${handler.actionType}"`);
    }
  }
}

// 2b: sell_all handler sets required executor fields
{
  const menu = catalog.generateMenu(POSITIONS);
  const sellAllItem = menu.find(i => i._handler === 'sell-all' && i.id.includes('btc'));
  if (sellAllItem) {
    const handler = ALL_HANDLERS.find(h => h.id === 'sell-all')!;
    const result = handler.resolve(sellAllItem, { price: '95000' }, POSITIONS);
    assert(typeof result.matchedPositionId === 'string' && result.matchedPositionId.length > 0,
      'sell_all: matchedPositionId is set');
    assert(typeof result.sellPrice === 'number',
      'sell_all: sellPrice is set when provided');
    console.log(`  \u2713 sell_all handler sets matchedPositionId and sellPrice`);

    // Without price → missingFields should include sellPrice
    const noPrice = handler.resolve(sellAllItem, {}, POSITIONS);
    assert(Array.isArray(noPrice.missingFields) && noPrice.missingFields.includes('sellPrice'),
      'sell_all: missingFields includes sellPrice when omitted');
    console.log(`  \u2713 sell_all handler reports missing sellPrice`);
  }
}

// 2c: sell_partial handler sets required executor fields
{
  const menu = catalog.generateMenu(POSITIONS);
  const sellPartialItem = menu.find(i => i._handler === 'sell-partial' && i.id.includes('eth'));
  if (sellPartialItem) {
    const handler = ALL_HANDLERS.find(h => h.id === 'sell-partial')!;
    // With percent and price
    const result = handler.resolve(sellPartialItem, { percent: '50', price: '3200' }, POSITIONS);
    assert(typeof result.matchedPositionId === 'string' && result.matchedPositionId.length > 0,
      'sell_partial: matchedPositionId is set');
    assert(typeof result.sellAmount === 'number' && result.sellAmount > 0,
      'sell_partial: sellAmount derived from percent');
    assert(typeof result.sellPrice === 'number',
      'sell_partial: sellPrice is set');
    console.log(`  \u2713 sell_partial handler sets matchedPositionId, sellAmount, sellPrice`);

    // Without amount or percent → missingFields includes sellAmount
    const noQty = handler.resolve(sellPartialItem, {}, POSITIONS);
    assert(Array.isArray(noQty.missingFields) && noQty.missingFields.includes('sellAmount'),
      'sell_partial: missingFields includes sellAmount when omitted');
    console.log(`  \u2713 sell_partial handler reports missing sellAmount`);
  }
}

// 2d: buy handler sets required executor fields
{
  const menu = catalog.generateMenu(POSITIONS);
  const buyItem = menu.find(i => i._handler === 'buy' && i.id.includes('btc'));
  if (buyItem) {
    const handler = ALL_HANDLERS.find(h => h.id === 'buy')!;
    const result = handler.resolve(buyItem, { amount: '0.5', price: '95000' }, POSITIONS);
    assert(typeof result.amount === 'number' && result.amount > 0,
      'buy: amount is set');
    assert(typeof result.symbol === 'string' && result.symbol === 'BTC',
      'buy: symbol is set');
    assert(typeof result.matchedPositionId === 'string',
      'buy: matchedPositionId is set for existing position');
    console.log(`  \u2713 buy handler sets amount, symbol, matchedPositionId`);
  }

  // buy_new: symbol from values
  const buyNewItem = menu.find(i => i.id === 'buy_new');
  if (buyNewItem) {
    const handler = ALL_HANDLERS.find(h => h.id === 'buy')!;
    const result = handler.resolve(buyNewItem, { symbol: 'SOL', amount: '100', price: '150' }, POSITIONS);
    assert(result.symbol === 'SOL', 'buy_new: symbol from values');
    assert(result.amount === 100, 'buy_new: amount from values');
    assert(result.pricePerUnit === 150, 'buy_new: pricePerUnit from values');
    console.log(`  \u2713 buy_new handler sets symbol, amount, pricePerUnit from values`);
  }
}

// 2e: add_cash handler sets required executor fields (generic)
{
  const menu = catalog.generateMenu(POSITIONS);
  const addCashItem = menu.find(i => i.id === 'add_cash_generic');
  if (addCashItem) {
    const handler = ALL_HANDLERS.find(h => h.id === 'add-cash')!;
    const result = handler.resolve(addCashItem, { amount: '5000', currency: 'EUR', account: 'N26' }, POSITIONS);
    assert(result.amount === 5000, 'add_cash generic: amount is set');
    assert(result.currency === 'EUR', 'add_cash generic: currency is set');
    assert(result.accountName === 'N26', 'add_cash generic: accountName is set');
    assert(!result.matchedPositionId, 'add_cash generic: matchedPositionId is NOT set');
    console.log(`  \u2713 add_cash generic handler sets amount, currency, accountName (no matchedPositionId)`);
  }
}

// 2e2: add_cash handler with existing account sets matchedPositionId
{
  const menu = catalog.generateMenu(POSITIONS);
  const addCashN26 = menu.find(i => i.id === 'add_cash_n26_eur');
  if (addCashN26) {
    const handler = ALL_HANDLERS.find(h => h.id === 'add-cash')!;
    const result = handler.resolve(addCashN26, { amount: '5000' }, POSITIONS);
    assert(result.amount === 5000, 'add_cash per-account: amount is set');
    assert(result.currency === 'EUR', 'add_cash per-account: currency from context');
    assert(result.accountName === 'N26', 'add_cash per-account: accountName from context');
    assert(result.matchedPositionId === 'n26-eur', 'add_cash per-account: matchedPositionId is set');
    console.log(`  \u2713 add_cash per-account handler sets matchedPositionId, currency, accountName from context`);
  } else {
    assert(false, 'add_cash per-account item add_cash_n26_eur should exist in menu');
  }
}

// 2f: update_cash handler sets required executor fields
{
  const menu = catalog.generateMenu(POSITIONS);
  const updateCashItem = menu.find(i => i._handler === 'update-cash' && i.id.includes('n26'));
  if (updateCashItem) {
    const handler = ALL_HANDLERS.find(h => h.id === 'update-cash')!;
    const result = handler.resolve(updateCashItem, { amount: '4811' }, POSITIONS);
    assert(typeof result.matchedPositionId === 'string' && result.matchedPositionId.length > 0,
      'update_cash: matchedPositionId is set');
    assert(result.amount === 4811, 'update_cash: amount is set');
    console.log(`  \u2713 update_cash handler sets matchedPositionId, amount`);
  }
}

// 2g: remove handler sets required executor fields
{
  const menu = catalog.generateMenu(POSITIONS);
  const removeItem = menu.find(i => i._handler === 'remove' && i.id.includes('doge'));
  if (removeItem) {
    const handler = ALL_HANDLERS.find(h => h.id === 'remove')!;
    const result = handler.resolve(removeItem, {}, POSITIONS);
    assert(typeof result.matchedPositionId === 'string' && result.matchedPositionId.length > 0,
      'remove: matchedPositionId is set');
    assert(result.symbol === 'DOGE', 'remove: symbol is set');
    console.log(`  \u2713 remove handler sets matchedPositionId, symbol`);
  }
}

// 2h: set_price handler sets required executor fields
{
  const menu = catalog.generateMenu(POSITIONS);
  const setPriceItem = menu.find(i => i._handler === 'set-price' && i.id.includes('btc'));
  if (setPriceItem) {
    const handler = ALL_HANDLERS.find(h => h.id === 'set-price')!;
    const result = handler.resolve(setPriceItem, { price: '95000' }, POSITIONS);
    assert(result.symbol === 'BTC', 'set_price: symbol is set');
    assert(result.newPrice === 95000, 'set_price: newPrice is set');
    console.log(`  \u2713 set_price handler sets symbol, newPrice`);

    // Without price → missingFields includes newPrice
    const noPrice = handler.resolve(setPriceItem, {}, POSITIONS);
    assert(Array.isArray(noPrice.missingFields) && noPrice.missingFields.includes('newPrice'),
      'set_price: missingFields includes newPrice when omitted');
    console.log(`  \u2713 set_price handler reports missing newPrice`);
  }
}

// 2i: No handler produces 'update' actionType (removed dead handler)
{
  const actionTypes = ALL_HANDLERS.map(h => h.actionType);
  assert(!actionTypes.includes('update' as any),
    'No handler produces "update" actionType (dead handler removed)');
  console.log(`  \u2713 No handler produces "update" actionType`);
}

// ---------------------------------------------------------------------------
// SECTION 3: Pre-filtering Tests
// ---------------------------------------------------------------------------

console.log('\n--- Section 3: Pre-filtering ---');

// 3a: Gibberish returns full menu (below MIN_FILTERED_ITEMS threshold)
{
  const menu = catalog.generateFilteredMenu(POSITIONS, 'xyzzyplugh');
  const fullMenu = catalog.generateMenu(POSITIONS);
  assert(menu.length === fullMenu.length,
    `Gibberish input returns full menu (got ${menu.length}, expected ${fullMenu.length})`);
  console.log(`  \u2713 Gibberish returns full menu (${menu.length} items)`);
}

// 3b: Exact match includes the item plus generics
{
  const menu = catalog.generateFilteredMenu(POSITIONS, 'BTC');
  const btcItems = menu.filter(i => i.id.includes('btc'));
  assert(btcItems.length > 0, 'BTC search includes BTC items');
  console.log(`  \u2713 "BTC" search includes ${btcItems.length} BTC-related items`);
}

// 3c: Generic fallbacks always present in filtered results
{
  const menu = catalog.generateFilteredMenu(POSITIONS, 'sell ETH');
  const genericIds = menu.map(i => i.id);
  assert(genericIds.includes('buy_new'), 'Filtered results include buy_new generic');
  assert(genericIds.includes('add_cash_generic'), 'Filtered results include add_cash_generic');
  console.log(`  \u2713 Generic fallbacks (buy_new, add_cash_generic) present in filtered menu`);
}

// 3d: Token matching is case-insensitive
{
  const menuLower = catalog.generateFilteredMenu(POSITIONS, 'btc');
  const menuUpper = catalog.generateFilteredMenu(POSITIONS, 'BTC');
  const menuMixed = catalog.generateFilteredMenu(POSITIONS, 'Btc');
  // All should return similar results (same items)
  const idsLower = new Set(menuLower.map(i => i.id));
  const idsUpper = new Set(menuUpper.map(i => i.id));
  const idsMixed = new Set(menuMixed.map(i => i.id));
  // Check that at least the BTC items appear in all
  const btcInLower = menuLower.some(i => i.id.includes('btc'));
  const btcInUpper = menuUpper.some(i => i.id.includes('btc'));
  const btcInMixed = menuMixed.some(i => i.id.includes('btc'));
  assert(btcInLower && btcInUpper && btcInMixed,
    'Token matching is case-insensitive (btc/BTC/Btc all find BTC items)');
  console.log(`  \u2713 Case-insensitive filtering works`);
}

// 3e: With many positions, filtered menu caps at MAX_FILTERED_ITEMS + generics
{
  // Generate 60 dummy positions
  const manyPositions: PositionContext[] = [];
  for (let i = 0; i < 60; i++) {
    manyPositions.push({
      id: `token-${i}`,
      symbol: `TKN${i}`,
      name: `Token Number ${i}`,
      type: 'crypto',
      amount: 100 + i,
    });
  }
  const menu = catalog.generateFilteredMenu(manyPositions, 'Token');
  // Should not exceed MAX_FILTERED_ITEMS (20) + generics (2)
  assert(menu.length <= 22,
    `Many positions: filtered menu capped (got ${menu.length}, max expected 22)`);
  console.log(`  \u2713 Large portfolio: filtered menu capped at ${menu.length} items`);
}

// ---------------------------------------------------------------------------
// SECTION 4: Edge Cases
// ---------------------------------------------------------------------------

console.log('\n--- Section 4: Edge Cases ---');

// 4a: Duplicate symbols — set_price deduplicates
{
  const dupePositions: PositionContext[] = [
    { id: 'btc-wallet1', symbol: 'BTC', name: 'Bitcoin (Wallet 1)', type: 'crypto', amount: 0.3 },
    { id: 'btc-wallet2', symbol: 'BTC', name: 'Bitcoin (Wallet 2)', type: 'crypto', amount: 0.2 },
  ];
  const menu = catalog.generateMenu(dupePositions);
  const setPriceItems = menu.filter(i => i._handler === 'set-price' && i.id.includes('btc'));
  assert(setPriceItems.length === 1,
    `set_price deduplicates: got ${setPriceItems.length} set_price BTC items, expected 1`);
  console.log(`  \u2713 set_price deduplicates by symbol (${setPriceItems.length} item for 2 BTC positions)`);

  // buy/sell don't deduplicate
  const buyItems = menu.filter(i => i._handler === 'buy' && i.id.includes('btc'));
  const sellAllItems = menu.filter(i => i._handler === 'sell-all' && i.id.includes('btc'));
  assert(buyItems.length === 2,
    `buy does NOT deduplicate: got ${buyItems.length} buy BTC items, expected 2`);
  assert(sellAllItems.length === 2,
    `sell_all does NOT deduplicate: got ${sellAllItems.length} sell_all BTC items, expected 2`);
  console.log(`  \u2713 buy/sell_all keep per-position items (${buyItems.length} buy, ${sellAllItems.length} sell_all)`);
}

// 4b: Position with amount 0 — handlers should still generate menu items
{
  const zeroPositions: PositionContext[] = [
    { id: 'zero-1', symbol: 'ZER', name: 'Zero Token', type: 'crypto', amount: 0 },
  ];
  const menu = catalog.generateMenu(zeroPositions);
  const zerItems = menu.filter(i => i.id.includes('zer'));
  assert(zerItems.length > 0,
    `Zero-amount position generates menu items (got ${zerItems.length})`);
  console.log(`  \u2713 Zero-amount position generates ${zerItems.length} menu items`);
}

// 4c: Very long position names — no crash
{
  const longPositions: PositionContext[] = [
    { id: 'long-1', symbol: 'LONG', name: 'A'.repeat(500), type: 'crypto', amount: 1 },
  ];
  let crashed = false;
  try {
    catalog.generateMenu(longPositions);
  } catch {
    crashed = true;
  }
  assert(!crashed, 'Very long position name does not crash menu generation');
  console.log(`  \u2713 Long position name (500 chars) does not crash`);
}

// 4d: Special characters in account names
{
  const specialPositions: PositionContext[] = [
    { id: 'special-1', symbol: 'CASH_EUR_999', name: 'N26 (EUR)', type: 'cash', amount: 1000, accountName: 'N26' },
    { id: 'special-2', symbol: 'CASH_USD_888', name: 'Savings & Checking (USD)', type: 'cash', amount: 2000, accountName: 'Savings & Checking' },
  ];
  let crashed = false;
  try {
    const menu = catalog.generateMenu(specialPositions);
    assert(menu.length > 0, 'Special chars in account names: menu generated');
  } catch {
    crashed = true;
  }
  assert(!crashed, 'Special characters in account names do not crash');
  console.log(`  \u2713 Special characters in account names handled`);
}

// 4e-pre: add_cash per-account items for multiple same-currency positions
{
  const dupePositions: PositionContext[] = [
    { id: 'n26-eur', symbol: 'CASH_EUR_123', name: 'N26 (EUR)', type: 'cash', amount: 9868, accountName: 'N26' },
    { id: 'revolut-eur', symbol: 'CASH_EUR_456', name: 'Revolut (EUR)', type: 'cash', amount: 5000, accountName: 'Revolut' },
  ];
  const menu = catalog.generateMenu(dupePositions);
  const addCashItems = menu.filter(i => i._handler === 'add-cash' && i.id !== 'add_cash_generic');
  assert(addCashItems.length === 2,
    `add_cash: both EUR accounts get their own menu items (got ${addCashItems.length}, expected 2)`);
  const ids = addCashItems.map(i => i.id);
  assert(ids.includes('add_cash_n26_eur'), 'add_cash: N26 EUR item exists');
  assert(ids.includes('add_cash_revolut_eur'), 'add_cash: Revolut EUR item exists');
  console.log(`  \u2713 Multiple same-currency cash positions each get own add_cash menu item`);
}

// 4e-pre2: add_cash_generic always present regardless of existing accounts
{
  const menu = catalog.generateMenu(POSITIONS);
  const generic = menu.find(i => i.id === 'add_cash_generic');
  assert(!!generic, 'add_cash_generic always present when cash positions exist');
  console.log(`  \u2713 add_cash_generic always present regardless of existing accounts`);
}

// 4e-pre3: add_cash_generic present even with no positions
{
  const menu = catalog.generateMenu([]);
  const generic = menu.find(i => i.id === 'add_cash_generic');
  assert(!!generic, 'add_cash_generic present even with empty positions');
  console.log(`  \u2713 add_cash_generic present even with no positions`);
}

// 4e: parseAbbreviatedNumber edge cases
{
  assert(parseAbbreviatedNumber('0') === 0, 'parseAbbreviatedNumber("0") === 0');
  assert(parseAbbreviatedNumber('0.001') === 0.001, 'parseAbbreviatedNumber("0.001") === 0.001');
  assert(parseAbbreviatedNumber('-5') === null, 'parseAbbreviatedNumber("-5") === null (negatives not supported)');
  assert(parseAbbreviatedNumber('') === null, 'parseAbbreviatedNumber("") === null');
  assert(parseAbbreviatedNumber('abc') === null, 'parseAbbreviatedNumber("abc") === null');
  assert(parseAbbreviatedNumber('1.5m') === 1_500_000, 'parseAbbreviatedNumber("1.5m") === 1500000');
  assert(parseAbbreviatedNumber('999b') === 999_000_000_000, 'parseAbbreviatedNumber("999b") === 999000000000');
  assert(parseAbbreviatedNumber('$3,200') === 3200, 'parseAbbreviatedNumber("$3,200") === 3200');
  console.log(`  \u2713 parseAbbreviatedNumber edge cases all pass`);
}

// ---------------------------------------------------------------------------
// Final results
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failures.length > 0) {
  console.log(`\nFailed cases:`);
  for (const f of failures) console.log(f);
  process.exit(1);
} else {
  console.log('All tests passed!');
  process.exit(0);
}
