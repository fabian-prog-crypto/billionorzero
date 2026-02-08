import { ParsedPositionAction, PositionActionType, AssetType } from '@/types';
import { PositionContext } from './prompt-builder';
import { getFiatCurrencies } from './category-service';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RawLLMAction {
  action?: string;
  symbol?: string;
  name?: string;
  assetType?: string;
  amount?: number;
  pricePerUnit?: number;
  totalCost?: number;
  sellAmount?: number;
  sellPercent?: number;
  sellPrice?: number;
  totalProceeds?: number;
  date?: string;
  matchedPositionId?: string;
  missingFields?: string[];
  confidence?: number;
  summary?: string;
  currency?: string;
  accountName?: string;
  newPrice?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseAbbreviatedNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$,]/g, '').trim().toLowerCase();
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*([kmb])?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const suffix = match[2];
  if (suffix === 'k') return num * 1_000;
  if (suffix === 'm') return num * 1_000_000;
  if (suffix === 'b') return num * 1_000_000_000;
  return num;
}

// ---------------------------------------------------------------------------
// Internal mutable working type (mirrors RawLLMAction but all fields writable)
// ---------------------------------------------------------------------------

interface WorkingAction {
  action: string;
  symbol: string;
  name?: string;
  assetType?: string;
  amount?: number;
  pricePerUnit?: number;
  totalCost?: number;
  sellAmount?: number;
  sellPercent?: number;
  sellPrice?: number;
  totalProceeds?: number;
  date?: string;
  matchedPositionId?: string;
  missingFields: string[];
  confidence: number;
  summary: string;
  currency?: string;
  accountName?: string;
  newPrice?: number;
}

// ---------------------------------------------------------------------------
// Step 1: normalizeSymbol
// ---------------------------------------------------------------------------

function normalizeSymbol(w: WorkingAction): WorkingAction {
  if (w.symbol) {
    w.symbol = w.symbol.toUpperCase().trim();
  }
  return w;
}

// ---------------------------------------------------------------------------
// Step 2: correctActionType — lightweight, only touches the action field
// ---------------------------------------------------------------------------

function correctActionType(w: WorkingAction, originalText: string, positions: PositionContext[]): WorkingAction {
  const trimmed = originalText.trim();
  const fiatCurrencies = getFiatCurrencies();

  // "remove/delete/drop {symbol}" → must be remove
  if (/^(?:remove|delete|drop)\s+/i.test(trimmed) && w.action !== 'remove') {
    w.action = 'remove';
  }

  // "{symbol} price {num}" or "set price of {symbol}" → must be set_price
  if (
    (/\bprice\s+\$?\d/i.test(trimmed) || /^(?:set\s+)?price\s+/i.test(trimmed)) &&
    w.action !== 'set_price'
  ) {
    w.action = 'set_price';
  }

  // "{num} {FIAT} to/in/at {account}" → must be add_cash
  const addCashMatch = trimmed.match(
    /^(\d+(?:[.,]\d+)?[kmb]?)\s+([a-zA-Z]{3})\s+(?:to|in|into|at)\s+(.+)$/i
  );
  if (addCashMatch && fiatCurrencies.has(addCashMatch[2].toLowerCase())) {
    w.action = 'add_cash';
  }

  // "{account} {FIAT} is now/= {num}" → must be update_cash
  const updateCashMatch = trimmed.match(
    /^(.+?)\s+([a-zA-Z]{3})\s+(?:is\s+now|now|=|balance)\s+(\d+(?:[.,]\d+)?[kmb]?)$/i
  );
  if (updateCashMatch && fiatCurrencies.has(updateCashMatch[2].toLowerCase())) {
    w.action = 'update_cash';
  }

  // If action is sell_all but sellAmount < position amount, downgrade to sell_partial
  if (w.action === 'sell_all' && w.sellAmount && w.matchedPositionId) {
    const matchedPos = positions.find(p => p.id === w.matchedPositionId);
    if (matchedPos && w.sellAmount < matchedPos.amount) {
      w.action = 'sell_partial';
    }
  }

  // For cash actions, force assetType to cash
  if (w.action === 'add_cash' || w.action === 'update_cash') {
    w.assetType = 'cash';
  }

  return w;
}

// ---------------------------------------------------------------------------
// Step 4: fillMissingFields — fills fields the LLM left empty
// All checks gated on !w.field so LLM output is never overwritten
// ---------------------------------------------------------------------------

function fillMissingFields(w: WorkingAction, originalText: string): WorkingAction {
  const trimmed = originalText.trim();
  const fiatCurrencies = getFiatCurrencies();

  // --- Buy fields ---

  // Extract buy amount: "bought 10 ...", "purchased 100 ...", or implicit "10 AAPL at ..."
  if (!w.amount && w.action === 'buy') {
    const verbBuyMatch = originalText.match(
      /(?:bought|purchased|added|buy)\s+(\d+(?:\.\d+)?)\s/i
    );
    if (verbBuyMatch) {
      w.amount = parseFloat(verbBuyMatch[1]);
    } else {
      // Implicit buy: leading number is the amount ("100 EURC at 1.05", "0.5 BTC at 95000")
      const implicitBuyMatch = originalText.match(/^(\d+(?:\.\d+)?)\s+\w/i);
      if (implicitBuyMatch) {
        w.amount = parseFloat(implicitBuyMatch[1]);
      }
    }
  }

  // "at/@ $X" = per-unit price
  const perUnitMatch = originalText.match(/(?:at|@)\s*(\$?\d+(?:\.\d+)?[kmb]?)/i);
  if (perUnitMatch) {
    const price = parseAbbreviatedNumber(perUnitMatch[1]);
    if (price !== null) {
      if (w.action === 'buy' && !w.pricePerUnit) w.pricePerUnit = price;
      if ((w.action === 'sell_partial' || w.action === 'sell_all') && !w.sellPrice) w.sellPrice = price;
    }
  }

  // "for $X" = total proceeds (sell) or total cost (buy)
  const forTotalMatch = originalText.match(/for\s+(\$?\d+(?:\.\d+)?[kmb]?)/i);
  if (forTotalMatch) {
    const total = parseAbbreviatedNumber(forTotalMatch[1]);
    if (total !== null) {
      const isSellAction = w.action === 'sell_partial' || w.action === 'sell_all';
      if (isSellAction && !w.totalProceeds) w.totalProceeds = total;
      if (w.action === 'buy' && !w.totalCost) w.totalCost = total;
    }
  }

  // --- Sell fields ---

  // Extract sell percent: "sold 50%", "sold half"
  if (!w.sellPercent && w.action === 'sell_partial') {
    const percentMatch = originalText.match(/(\d+)\s*%/i);
    if (percentMatch) {
      w.sellPercent = parseFloat(percentMatch[1]);
    } else if (/\bhalf\b/i.test(originalText)) {
      w.sellPercent = 50;
    } else if (/\bthird\b/i.test(originalText)) {
      w.sellPercent = 33.33;
    } else if (/\bquarter\b/i.test(originalText)) {
      w.sellPercent = 25;
    }
  }

  // Extract sell amount: "sold 50 shares", "sold 10 GOOG"
  if (
    !w.sellAmount &&
    !w.sellPercent &&
    (w.action === 'sell_partial' || w.action === 'sell_all')
  ) {
    const sellAmountMatch = originalText.match(
      /(?:sold|sell)\s+(\d+(?:\.\d+)?)\s+(?:shares?|units?|\w)/i
    );
    if (sellAmountMatch) {
      w.sellAmount = parseFloat(sellAmountMatch[1]);
    }
  }

  // --- Cash fields (only fill gaps) ---

  // For add_cash: extract currency, accountName, amount from "{num} {FIAT} to/in {account}"
  if (w.action === 'add_cash') {
    const addCashMatch = trimmed.match(
      /^(\d+(?:[.,]\d+)?[kmb]?)\s+([a-zA-Z]{3})\s+(?:to|in|into|at)\s+(.+)$/i
    );
    if (addCashMatch && fiatCurrencies.has(addCashMatch[2].toLowerCase())) {
      if (!w.currency) w.currency = addCashMatch[2].toUpperCase();
      if (!w.accountName) w.accountName = addCashMatch[3].trim();
      if (!w.amount) {
        const amt = parseAbbreviatedNumber(addCashMatch[1].replace(',', '.'));
        if (amt !== null) w.amount = amt;
      }
    }
    // Normalize cash symbol
    if (w.currency && (!w.symbol || w.symbol === 'UNKNOWN')) {
      w.symbol = `CASH_${w.currency}`;
    }
  }

  // For update_cash: extract currency, accountName, amount from "{account} {FIAT} is now {num}"
  if (w.action === 'update_cash') {
    const updateCashMatch = trimmed.match(
      /^(.+?)\s+([a-zA-Z]{3})\s+(?:is\s+now|now|=|balance)\s+(\d+(?:[.,]\d+)?[kmb]?)$/i
    );
    if (updateCashMatch && fiatCurrencies.has(updateCashMatch[2].toLowerCase())) {
      if (!w.currency) w.currency = updateCashMatch[2].toUpperCase();
      if (!w.accountName) w.accountName = updateCashMatch[1].trim();
      if (!w.amount) {
        const amt = parseAbbreviatedNumber(updateCashMatch[3].replace(',', '.'));
        if (amt !== null) w.amount = amt;
      }
    }
    // Also try extracting last number as amount if still missing
    if (!w.amount) {
      const numbers = [...originalText.matchAll(/(\d+(?:[.,]\d+)?[kmb]?)/gi)];
      if (numbers.length > 0) {
        const lastNum = numbers[numbers.length - 1][1];
        const amt = parseAbbreviatedNumber(lastNum.replace(',', '.'));
        if (amt !== null) w.amount = amt;
      }
    }
    // Normalize cash symbol
    if (w.currency && (!w.symbol || w.symbol === 'UNKNOWN')) {
      w.symbol = `CASH_${w.currency}`;
    }
  }

  // --- Set price fields ---

  // For set_price: extract number after symbol as newPrice ("BTC price 95000")
  if (!w.newPrice && w.action === 'set_price') {
    const priceMatch = originalText.match(/(?:price|=)\s*(\$?\d+(?:[.,]\d+)?[kmb]?)/i);
    if (priceMatch) {
      const price = parseAbbreviatedNumber(priceMatch[1]);
      if (price !== null) w.newPrice = price;
    }
  }

  return w;
}

// ---------------------------------------------------------------------------
// Step 3: matchToPosition
// ---------------------------------------------------------------------------

function matchToPosition(w: WorkingAction, positions: PositionContext[]): WorkingAction {
  if (!w.matchedPositionId && w.symbol) {
    const matches = positions.filter(
      p => p.symbol.toUpperCase() === w.symbol.toUpperCase()
    );
    if (matches.length === 1) {
      w.matchedPositionId = matches[0].id;
      w.name = w.name || matches[0].name;
      w.assetType = w.assetType || matches[0].type;
    }
  }
  return w;
}

// ---------------------------------------------------------------------------
// Step 5: deriveComputedFields
// ---------------------------------------------------------------------------

function deriveComputedFields(w: WorkingAction, positions: PositionContext[]): WorkingAction {
  const isSell = w.action === 'sell_partial' || w.action === 'sell_all';
  const isBuy = w.action === 'buy';

  // For buys: derive amount/pricePerUnit/totalCost
  if (isBuy) {
    if (!w.pricePerUnit && w.totalCost && w.amount) {
      w.pricePerUnit = w.totalCost / w.amount;
    }
    if (!w.amount && w.totalCost && w.pricePerUnit) {
      w.amount = w.totalCost / w.pricePerUnit;
    }
    if (w.amount && w.pricePerUnit) {
      w.totalCost = w.amount * w.pricePerUnit;
    }
  }

  // For sell_all: derive sellAmount from matched position
  if (w.action === 'sell_all' && w.matchedPositionId) {
    const matchedPos = positions.find(p => p.id === w.matchedPositionId);
    if (matchedPos) w.sellAmount = matchedPos.amount;
  }

  // Calculate sellAmount from sellPercent
  if (w.action === 'sell_partial' && w.sellPercent && !w.sellAmount && w.matchedPositionId) {
    const matchedPos = positions.find(p => p.id === w.matchedPositionId);
    if (matchedPos) w.sellAmount = matchedPos.amount * (w.sellPercent / 100);
  }

  // Derive sellPrice from totalProceeds
  if (isSell && !w.sellPrice && w.totalProceeds && w.sellAmount) {
    w.sellPrice = w.totalProceeds / w.sellAmount;
  }
  // Recalculate totalProceeds
  if (isSell && w.sellAmount && w.sellPrice) {
    w.totalProceeds = w.sellAmount * w.sellPrice;
  }

  return w;
}

// ---------------------------------------------------------------------------
// Step 6: validateDate
// ---------------------------------------------------------------------------

function validateDate(w: WorkingAction): WorkingAction {
  const today = new Date().toISOString().split('T')[0];
  if (!w.date) {
    w.date = today;
  } else {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(w.date) || isNaN(Date.parse(w.date)) || w.date > today) {
      w.date = today;
    }
  }
  return w;
}

// ---------------------------------------------------------------------------
// Step 7: computeMissingFields
// ---------------------------------------------------------------------------

function computeMissingFields(w: WorkingAction): WorkingAction {
  const isSell = w.action === 'sell_partial' || w.action === 'sell_all';
  const isBuy = w.action === 'buy';

  w.missingFields = [];
  if (isSell && !w.sellPrice) w.missingFields.push('sellPrice');
  if (isSell && w.action === 'sell_partial' && !w.sellAmount) w.missingFields.push('sellAmount');
  if (isBuy && !w.amount) w.missingFields.push('amount');
  if (isBuy && !w.pricePerUnit) w.missingFields.push('pricePerUnit');

  if (w.action === 'add_cash') {
    w.missingFields = [];
    if (!w.amount) w.missingFields.push('amount');
    if (!w.currency) w.missingFields.push('currency');
  }
  if (w.action === 'update_cash') {
    w.missingFields = [];
    if (!w.amount) w.missingFields.push('amount');
  }
  if (w.action === 'set_price') {
    w.missingFields = [];
    if (!w.newPrice) w.missingFields.push('newPrice');
  }
  if (w.action === 'update') {
    w.missingFields = [];
    if (!w.amount && !w.pricePerUnit) w.missingFields.push('amount');
  }
  if (w.action === 'remove') {
    w.missingFields = [];
  }

  return w;
}

// ---------------------------------------------------------------------------
// Step 8: buildSummary
// ---------------------------------------------------------------------------

function buildSummary(w: WorkingAction, positions: PositionContext[]): WorkingAction {
  const isSell = w.action === 'sell_partial' || w.action === 'sell_all';
  const isBuy = w.action === 'buy';

  const fmtPrice = (n: number) =>
    n >= 1
      ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })
      : '$' + n.toString();

  if (isSell) {
    const matchedPos = w.matchedPositionId
      ? positions.find(p => p.id === w.matchedPositionId)
      : null;
    let qtyPart: string;
    if (w.sellPercent) {
      qtyPart = `${w.sellPercent}% of`;
    } else if (w.sellAmount) {
      const pct = matchedPos && matchedPos.amount > 0
        ? Math.round((w.sellAmount / matchedPos.amount) * 100)
        : null;
      qtyPart = pct !== null ? `${w.sellAmount} (${pct}%) of` : `${w.sellAmount}`;
    } else {
      qtyPart = 'all';
    }
    const pricePart = w.sellPrice ? ` at ${fmtPrice(w.sellPrice)}` : '';
    w.summary = `Sell ${qtyPart} ${w.symbol}${pricePart}`;
  } else if (isBuy) {
    const qtyPart = w.amount ? `${w.amount}` : '';
    const pricePart = w.pricePerUnit ? ` at ${fmtPrice(w.pricePerUnit)}` : '';
    w.summary = `Buy ${qtyPart} ${w.symbol}${pricePart}`;
  } else if (w.action === 'add_cash') {
    const fmtAmt = w.amount ? w.amount.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '?';
    w.summary = `Add ${fmtAmt} ${w.currency || '?'} to ${w.accountName || '?'}`;
  } else if (w.action === 'update_cash') {
    const fmtAmt = w.amount ? w.amount.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '?';
    w.summary = `Update ${w.accountName || '?'} ${w.currency || '?'} to ${fmtAmt}`;
  } else if (w.action === 'update') {
    const parts: string[] = [`Update ${w.symbol}`];
    if (w.amount) parts.push(`amount to ${w.amount}`);
    if (w.pricePerUnit) parts.push(`price to ${fmtPrice(w.pricePerUnit)}`);
    w.summary = parts.join(' ');
  } else if (w.action === 'set_price') {
    w.summary = `Set ${w.symbol} price to ${w.newPrice ? fmtPrice(w.newPrice) : '?'}`;
  } else if (w.action === 'remove') {
    w.summary = `Remove ${w.symbol}`;
  }

  return w;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function resolveAction(
  raw: RawLLMAction,
  originalText: string,
  positions: PositionContext[]
): ParsedPositionAction {
  // Create mutable working copy with defaults for required fields
  let w: WorkingAction = {
    action: raw.action || 'buy',
    symbol: raw.symbol || 'UNKNOWN',
    name: raw.name,
    assetType: raw.assetType,
    amount: raw.amount,
    pricePerUnit: raw.pricePerUnit,
    totalCost: raw.totalCost,
    sellAmount: raw.sellAmount,
    sellPercent: raw.sellPercent,
    sellPrice: raw.sellPrice,
    totalProceeds: raw.totalProceeds,
    date: raw.date,
    matchedPositionId: raw.matchedPositionId,
    missingFields: [],
    confidence: raw.confidence ?? 0.5,
    summary: raw.summary || '',
    currency: raw.currency,
    accountName: raw.accountName,
    newPrice: raw.newPrice,
  };

  // Pipeline: each step mutates and returns the working copy
  // Order: correctActionType before fillMissingFields so action-gated
  // field extraction works regardless of whether LLM or correction set the action.
  w = normalizeSymbol(w);
  w = correctActionType(w, originalText, positions);
  w = matchToPosition(w, positions);
  w = fillMissingFields(w, originalText);
  w = deriveComputedFields(w, positions);
  w = validateDate(w);
  w = computeMissingFields(w);
  w = buildSummary(w, positions);

  // Construct the final ParsedPositionAction
  const result: ParsedPositionAction = {
    action: w.action as PositionActionType,
    symbol: w.symbol,
    assetType: (w.assetType as AssetType) || 'crypto',
    confidence: w.confidence,
    summary: w.summary,
    missingFields: w.missingFields,
  };

  // Copy optional fields only if they have values
  if (w.name !== undefined) result.name = w.name;
  if (w.amount !== undefined) result.amount = w.amount;
  if (w.pricePerUnit !== undefined) result.pricePerUnit = w.pricePerUnit;
  if (w.totalCost !== undefined) result.totalCost = w.totalCost;
  if (w.sellAmount !== undefined) result.sellAmount = w.sellAmount;
  if (w.sellPercent !== undefined) result.sellPercent = w.sellPercent;
  if (w.sellPrice !== undefined) result.sellPrice = w.sellPrice;
  if (w.totalProceeds !== undefined) result.totalProceeds = w.totalProceeds;
  if (w.date !== undefined) result.date = w.date;
  if (w.matchedPositionId !== undefined) result.matchedPositionId = w.matchedPositionId;
  const isCashAction = w.action === 'add_cash' || w.action === 'update_cash';
  if (isCashAction && w.currency) result.currency = w.currency;
  if (isCashAction && w.accountName) result.accountName = w.accountName;
  if (w.newPrice !== undefined && w.action === 'set_price') result.newPrice = w.newPrice;

  return result;
}
