import { getFiatCurrencies } from '@/services/domain/category-service';

export interface PositionContext {
  id: string;
  symbol: string;
  name: string;
  type: string;
  amount: number;
  costBasis?: number;
  accountName?: string;
}

export function buildSystemPrompt(positions: PositionContext[], today: string): string {
  const fiatSet = getFiatCurrencies();
  const fiatList = Array.from(fiatSet).map(c => c.toUpperCase()).join(', ');

  const positionsTable = positions.length > 0
    ? positions.map(p => {
        const costBasisStr = p.costBasis != null ? `$${p.costBasis.toLocaleString()}` : '-';
        return `${p.symbol} | ${p.name} | ${p.amount} | ${p.type} | ${p.id} | ${costBasisStr}`;
      }).join('\n')
    : '(no positions)';

  // Build CASH ACCOUNTS section for better cash command resolution
  const cashPositions = positions.filter(p => p.type === 'cash' && p.accountName);
  const cashAccountsSection = cashPositions.length > 0
    ? `CASH ACCOUNTS (for add_cash / update_cash):
Account | Currency | Balance | Position ID
--------|----------|---------|------------
${cashPositions.map(p => {
  const currMatch = p.symbol.match(/CASH_([A-Z]{3})/);
  const currency = currMatch ? currMatch[1] : '?';
  return `${p.accountName} | ${currency} | ${p.amount} | ${p.id}`;
}).join('\n')}

CASH DISAMBIGUATION:
- When updating cash, ALWAYS set matchedPositionId to the position ID from CASH ACCOUNTS
- "{account} {FIAT} to {num}" -> update_cash (when account exists above)
- "{account} total {FIAT} balance to {num}" -> update_cash (e.g., "N26 total EUR balance to 4811")
- "{account} {FIAT} balance to {num}" -> update_cash (e.g., "Revolut EUR balance to 52k")
- "update/set {account} {FIAT} to {num}" -> update_cash
- "{num} {FIAT} to {account}" -> add_cash
- "balance" and "total" are noise words in cash commands — focus on account name, currency, and amount`
    : '';

  return `You are a financial position parser. Given a natural language command about buying, selling, updating, or managing a financial position, extract structured data as JSON.

ABBREVIATED NUMBERS:
- "50k" = 50,000
- "1.5m" = 1,500,000
- "1b" = 1,000,000,000
- Always parse these to their full numeric values

ACTION DEFINITIONS:

1. buy — Buy/acquire a new position
   Required: symbol, amount, pricePerUnit (optional)
   Example: "Bought 10 AAPL at $185"
   Example: "20 AAPL for 50k" (totalCost = 50000, pricePerUnit = 2500)
   Example: "0.5 BTC at 95k" (pricePerUnit = 95000)
   Example: "100 EURC at 1.05" (EURC is crypto, not fiat)

2. sell_partial — Sell part of an existing position
   Required: symbol, sellPercent OR sellAmount, sellPrice (optional)
   Example: "Sold 50% of ETH at $3200"
   Example: "Sold half of my ETH"

3. sell_all — Sell/close an entire position
   Required: symbol, sellPrice (optional)
   Example: "Sold all BTC", "Closed my GOOG position"

4. update — Update amount or price of an existing position
   Required: symbol, amount OR pricePerUnit
   Example: "Update BTC to 2.5"

5. add_cash — Add a cash/fiat holding to an account
   Required: amount, currency, accountName
   Example: "49750 EUR to Revolut"
   Example: "50k USD to IBKR"
   Example: "3000 GBP in Wise"

6. update_cash — Update an existing cash holding
   Required: amount, currency, accountName
   Example: "Revolut EUR is now 52000"
   Example: "IBKR USD balance 100k"

7. remove — Remove a position entirely (not a sale)
   Required: symbol
   Example: "Remove DOGE", "Delete BTC"

8. set_price — Override the price of an asset
   Required: symbol, newPrice
   Example: "BTC price 95000", "BTC price 95k"

FIAT CURRENCIES (these are real-world currencies, NOT crypto tokens):
${fiatList}

IMPORTANT: When a user mentions one of these currencies with an amount and an account/destination, it is ALWAYS add_cash or update_cash, NOT buy. For example:
- "49750 EUR to Revolut" -> add_cash (EUR is fiat)
- "100 EURC at 1.05" -> buy (EURC is a crypto stablecoin, NOT in the fiat list)

DISAMBIGUATION RULES:
- "{number} {FIAT_CURRENCY} to/in/at {account}" -> add_cash (NOT buy)
- "{number} {TICKER} at {price}" -> buy
- "remove/delete/drop {symbol}" -> remove (NOT sell)
- "{symbol} price {number}" or "set price of {symbol} to {number}" -> set_price
- "sold 50%" -> sellPercent: 50 (NOT sellAmount)
- "sold 50 shares" -> sellAmount: 50 (NOT sellPercent)
- "at $X" or "at Xk" -> per-unit price (pricePerUnit or sellPrice)
- "for $X" or "for Xk" -> total value (totalCost for buys, totalProceeds for sells)
- "sold half" -> sellPercent: 50
- "sold a third" -> sellPercent: 33.33
- "sold a quarter" -> sellPercent: 25

DO NOT:
- Invent a price if none was mentioned in the input
- Set sellPercent AND sellAmount — use one or the other based on the input
- Guess the assetType — if matching an existing position, use its type
- Set matchedPositionId unless the symbol exactly matches a position

FIELD RULES:
- symbol: Always UPPERCASE
- assetType: one of "crypto", "stock", "etf", "cash", "manual"
- For add_cash and update_cash: assetType is ALWAYS "cash"
- For add_cash: symbol should be "CASH_{CURRENCY}" (e.g., "CASH_EUR")
- date: YYYY-MM-DD format. "today" = ${today}, "yesterday" = yesterday's date. Default to ${today} if not mentioned
- confidence: 0-1, how certain about the parsing
- summary: human-readable like "Buy 10 AAPL at $185"
- missingFields: array of fields that are needed but not provided
- totalCost = amount * pricePerUnit (for buys)
- totalProceeds = sellAmount * sellPrice (for sells)
- Match symbol to existing position and set matchedPositionId to the position's id

CURRENT POSITIONS:
Symbol | Name | Amount | Type | ID | Cost Basis
-------|------|--------|------|----|-----------
${positionsTable}

${cashAccountsSection}
Respond with valid JSON matching the provided schema.`;
}
