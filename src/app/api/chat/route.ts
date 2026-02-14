/**
 * /api/chat — Ollama Native Tool Calling
 *
 * Replaces the broken /api/command endpoint. Uses Ollama's native `tools`
 * parameter instead of `format` for reliable tool calling with Qwen 2.5.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readDb, withDb, type PortfolioData } from '../portfolio/db-store';
import { toOllamaTools, getToolById } from '@/services/domain/tool-registry';
import { classifyIntent } from '@/services/domain/intent-router';
import { calculatePortfolioSummary, calculateAllPositionsWithPrices, calculateExposureData, calculateRiskProfile, calculatePerpPageData, extractCurrencyCode } from '@/services/domain/portfolio-calculator';
import { calculatePerformanceMetrics } from '@/services/domain/performance-metrics';
import { isPositionInAssetClass } from '@/services/domain/account-role-service';
import { assetClassFromType } from '@/types';
import type { Position, Transaction, Account } from '@/types';
import { extractAccountInput, resolveAccountFromArgs } from '@/services/domain/command-account-resolver';
import { toolCallToAction, findPositionBySymbol, CONFIRM_MUTATION_TOOLS } from '@/services/domain/action-mapper';
import { getCoinGeckoApiClient, getStockApiClient } from '@/services/api';
import { getCryptoPriceService } from '@/services/providers/crypto-price-service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatRequest {
  text: string;
  ollamaUrl?: string;
  ollamaModel?: string;
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface ToolCallResult {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  isMutation: boolean;
}

const MAX_ROUNDS = 3;
const DEFAULT_MODEL = 'llama3.2:latest';

type AssetTypeHint = 'crypto' | 'stock' | 'etf' | 'cash' | 'manual';
const QUOTE_FETCH_TIMEOUT_MS = Number(process.env.CMDK_QUOTE_TIMEOUT_MS || 1200);
const STOCK_API_KEY = process.env.STOCK_API_KEY || process.env.FINNHUB_API_KEY;

function toDateOnlyString(input: unknown): string {
  if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase();
    if (normalized === 'today') {
      return new Date().toISOString().split('T')[0];
    }
    if (normalized === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    }
    if (normalized === 'tomorrow') {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    }
    // Accept already-normalized YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

function resolveRelativeDateFromUserText(text: string): string | null {
  const normalized = text.toLowerCase();
  if (/\byesterday\b/.test(normalized)) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }
  if (/\btoday\b/.test(normalized)) {
    return new Date().toISOString().split('T')[0];
  }
  if (/\btomorrow\b/.test(normalized)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }
  return null;
}

function resolveCommandDate(argDate: unknown, userText: string): string {
  const fromText = resolveRelativeDateFromUserText(userText);
  if (fromText) return fromText;
  return toDateOnlyString(argDate);
}

function asPositiveNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function isToday(date: string): boolean {
  return date === new Date().toISOString().split('T')[0];
}

function isNearToday(date: string, maxDays: number = 7): boolean {
  const ts = new Date(`${date}T12:00:00Z`).getTime();
  if (Number.isNaN(ts)) return false;
  const now = new Date();
  const nowMid = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayTs = Date.UTC(new Date(ts).getUTCFullYear(), new Date(ts).getUTCMonth(), new Date(ts).getUTCDate());
  const diffDays = Math.abs(nowMid - dayTs) / (24 * 60 * 60 * 1000);
  return diffDays <= maxDays;
}

function withFetchTimeout(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}

function isSuspiciousNearDateQuote(quotePrice: number | null, referencePrice: number | null, date: string): boolean {
  if (!quotePrice || !referencePrice) return false;
  if (!isNearToday(date, 7)) return false;
  const ratio = quotePrice / referencePrice;
  return ratio < 0.3 || ratio > 3.0;
}

function looksLikeEquityTicker(symbol: string): boolean {
  return /^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol.toUpperCase());
}

function getPortfolioSymbols(db: PortfolioData): string[] {
  return Array.from(new Set(db.positions.map((p) => p.symbol.toUpperCase())));
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[rows - 1][cols - 1];
}

function resolveClosestPortfolioSymbol(db: PortfolioData, inputSymbol: string): string {
  const symbol = inputSymbol.trim().toUpperCase();
  if (!symbol) return symbol;

  const catalog = getPortfolioSymbols(db);
  if (catalog.includes(symbol)) return symbol;
  if (catalog.length === 0) return symbol;

  const prefixMatches = catalog.filter((candidate) => candidate.startsWith(symbol) || symbol.startsWith(candidate));
  if (prefixMatches.length === 1) return prefixMatches[0];

  let best: { symbol: string; score: number } | null = null;
  let second: { symbol: string; score: number } | null = null;

  for (const candidate of catalog) {
    const maxLen = Math.max(symbol.length, candidate.length);
    if (maxLen === 0) continue;
    const dist = levenshteinDistance(symbol, candidate);
    const score = 1 - dist / maxLen;

    if (!best || score > best.score) {
      second = best;
      best = { symbol: candidate, score };
      continue;
    }
    if (!second || score > second.score) {
      second = { symbol: candidate, score };
    }
  }

  if (!best) return symbol;

  const bestIsStrong = best.score >= 0.75;
  const hasGap = !second || best.score - second.score >= 0.12;
  return bestIsStrong && hasGap ? best.symbol : symbol;
}

function guessPortfolioSymbolFromUserText(db: PortfolioData, userText: string): string | null {
  const tokens = userText.toUpperCase().match(/[A-Z][A-Z0-9.\-]{0,9}/g) || [];
  if (tokens.length === 0) return null;

  const stopwords = new Set([
    'SOLD', 'SELL', 'ALL', 'OF', 'MY', 'AT',
    'TODAY', 'YESTERDAY', 'TOMORROW', 'POSITION',
    'HALF', 'PERCENT',
  ]);
  const catalog = new Set(getPortfolioSymbols(db));

  for (const token of tokens) {
    if (stopwords.has(token)) continue;
    const resolved = resolveClosestPortfolioSymbol(db, token);
    if (catalog.has(resolved)) return resolved;
  }
  return null;
}

type PositionUpdateMode = 'position' | 'cash';

interface PositionUpdateTarget {
  position?: Position;
  error?: string;
}

function resolvePositionUpdateTarget(
  data: PortfolioData,
  args: Record<string, unknown>,
  mode: PositionUpdateMode,
): PositionUpdateTarget {
  const explicitId = typeof args.matchedPositionId === 'string'
    ? args.matchedPositionId
    : typeof args.positionId === 'string'
      ? args.positionId
      : '';
  if (explicitId) {
    const byId = data.positions.find((p) => p.id === explicitId);
    if (!byId) return { error: `No position found for id ${explicitId}` };
    if (mode === 'cash' && byId.type !== 'cash') {
      return { error: `Position ${explicitId} is not a cash position` };
    }
    return { position: byId };
  }

  if (mode === 'cash') {
    const currencyArg = String(args.currency || args.symbol || '').toUpperCase().trim();
    const currency = extractCurrencyCode(currencyArg).toUpperCase();
    if (!currency) return { error: 'Currency is required' };

    const currencyMatches = data.positions.filter(
      (position) =>
        position.type === 'cash' &&
        extractCurrencyCode(position.symbol).toUpperCase() === currency
    );

    const accountResolution = resolveAccountFromArgs(data.accounts, args, { manualOnly: true });
    const accountArg = accountResolution.input || '';
    if (accountArg) {
      if (!accountResolution.account) {
        const reason = accountResolution.status === 'ambiguous'
          ? `Multiple accounts match "${accountArg}"`
          : `No account match for "${accountArg}"`;
        return { error: reason };
      }
      const account = accountResolution.account;
      const inAccount = currencyMatches.filter((p) => p.accountId === account.id);
      if (inAccount.length === 0) return { error: `No ${currency} cash position found in ${account.name}` };
      if (inAccount.length > 1) return { error: `Multiple ${currency} cash positions found in ${account.name}` };
      return { position: inAccount[0] };
    }

    if (currencyMatches.length === 0) return { error: `No cash position found for ${currency}` };
    if (currencyMatches.length > 1) return { error: `Multiple ${currency} cash positions found. Specify account.` };
    return { position: currencyMatches[0] };
  }

  const rawSymbol = String(args.symbol || '').toUpperCase().trim();
  if (!rawSymbol) return { error: 'Symbol is required' };
  const symbol = resolveClosestPortfolioSymbol(data, rawSymbol);
  let matches = data.positions.filter((p) => p.symbol.toUpperCase() === symbol);
  if (matches.length === 0) return { error: `No position found for ${rawSymbol}` };

  const accountResolution = resolveAccountFromArgs(data.accounts, args);
  const accountArg = accountResolution.input || '';
  if (accountArg) {
    if (!accountResolution.account) {
      const reason = accountResolution.status === 'ambiguous'
        ? `Multiple accounts match "${accountArg}"`
        : `No account match for "${accountArg}"`;
      return { error: reason };
    }
    const account = accountResolution.account;
    matches = matches.filter((p) => p.accountId === account.id);
    if (matches.length === 0) return { error: `No ${symbol} position found in ${account.name}` };
  }

  if (matches.length > 1) return { error: `Multiple ${symbol} positions found. Specify account or positionId.` };
  return { position: matches[0] };
}

function buildPositionUpdates(
  data: PortfolioData,
  position: Position,
  args: Record<string, unknown>,
  mode: PositionUpdateMode,
): { updates?: Partial<Position>; error?: string } {
  const updates: Partial<Position> = {};

  if (args.amount !== undefined) {
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: 'Amount must be greater than 0' };
    }
    updates.amount = amount;
    if (mode === 'cash' || position.type === 'cash') {
      updates.costBasis = amount;
    }
  }

  if (mode === 'position' && args.costBasis !== undefined) {
    const costBasis = Number(args.costBasis);
    if (!Number.isFinite(costBasis) || costBasis < 0) {
      return { error: 'Cost basis must be >= 0' };
    }
    updates.costBasis = costBasis;
  }

  if (args.date !== undefined && String(args.date).trim() !== '') {
    updates.purchaseDate = toDateOnlyString(args.date);
  }

  if (typeof args.accountId === 'string' && args.accountId.trim() !== '') {
    const accountId = args.accountId.trim();
    const account = data.accounts.find((a) => a.id === accountId);
    if (!account) return { error: `Unknown accountId: ${accountId}` };
    updates.accountId = account.id;
  } else {
    const accountResolution = resolveAccountFromArgs(data.accounts, args);
    if (accountResolution.input) {
      if (!accountResolution.account) {
        const reason = accountResolution.status === 'ambiguous'
          ? `Multiple accounts match "${accountResolution.input}"`
          : `No account match for "${accountResolution.input}"`;
        return { error: reason };
      }
      updates.accountId = accountResolution.account.id;
    }
  }

  if (Object.keys(updates).length === 0) {
    return { error: 'No update fields provided' };
  }

  updates.updatedAt = new Date().toISOString();
  return { updates };
}

function getDbPriceForSymbol(db: PortfolioData, symbol: string): number | null {
  const lower = symbol.toLowerCase();
  const upper = symbol.toUpperCase();
  const direct = db.customPrices[lower]?.price ?? db.prices[lower]?.price ?? db.customPrices[upper]?.price ?? db.prices[upper]?.price;
  if (typeof direct === 'number' && direct > 0) return direct;

  // Crypto prices are often stored under CoinGecko IDs (e.g., "bitcoin")
  const coinId = getCryptoPriceService().getCoinId(symbol);
  const cg = db.customPrices[coinId]?.price ?? db.prices[coinId]?.price;
  if (typeof cg === 'number' && cg > 0) return cg;

  return null;
}

async function fetchLiveStockQuote(symbol: string): Promise<number | null> {
  if (!STOCK_API_KEY) return null;
  try {
    const quote = await getStockApiClient(STOCK_API_KEY).getQuote(symbol);
    return asPositiveNumber(quote.c);
  } catch {
    return null;
  }
}

async function fetchYahooStockCloseForDate(symbol: string, date: string): Promise<number | null> {
  try {
    // Pull a small window around the target day and select the last close on/before date.
    const d = new Date(`${date}T12:00:00Z`);
    const from = new Date(d);
    from.setDate(from.getDate() - 7);
    const to = new Date(d);
    to.setDate(to.getDate() + 2);
    const period1 = Math.floor(from.getTime() / 1000);
    const period2 = Math.floor(to.getTime() / 1000);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`;
    const response = await fetch(url, { signal: withFetchTimeout(QUOTE_FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;

    const json = await response.json();
    const result = json?.chart?.result?.[0];
    const timestamps: number[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
    const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close || [];
    if (timestamps.length === 0 || closes.length === 0) return null;

    const targetDay = new Date(`${date}T23:59:59Z`).getTime();
    let bestClose: number | null = null;
    let bestTs = -Infinity;

    for (let i = 0; i < Math.min(timestamps.length, closes.length); i++) {
      const ts = timestamps[i] * 1000;
      const close = asPositiveNumber(closes[i]);
      if (!close) continue;
      if (ts <= targetDay && ts > bestTs) {
        bestTs = ts;
        bestClose = close;
      }
    }

    return bestClose;
  } catch {
    return null;
  }
}

async function fetchStockQuoteForDate(symbol: string, buyDate: string): Promise<number | null> {
  if (STOCK_API_KEY) {
    try {
      const start = Math.floor(new Date(`${buyDate}T00:00:00Z`).getTime() / 1000);
      const end = Math.floor(new Date(`${buyDate}T23:59:59Z`).getTime() / 1000);
      const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${start}&to=${end}&token=${STOCK_API_KEY}`;
      const response = await fetch(url, { signal: withFetchTimeout(QUOTE_FETCH_TIMEOUT_MS) });
      if (response.ok) {
        const data = await response.json();
        if (data?.s === 'ok' && Array.isArray(data.c) && data.c.length > 0) {
          const close = asPositiveNumber(data.c[data.c.length - 1]);
          if (close) return close;
        }
      }
    } catch {
      // fallback below
    }
  } else if (process.env.CMDK_ENABLE_YAHOO_FALLBACK === 'true') {
    const yahooHistorical = await fetchYahooStockCloseForDate(symbol, buyDate);
    if (yahooHistorical) return yahooHistorical;
  }

  if (isToday(buyDate)) {
    return fetchLiveStockQuote(symbol);
  }

  return null;
}

function toCoinGeckoDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}-${month}-${year}`;
}

async function fetchLiveCryptoQuote(symbol: string): Promise<number | null> {
  try {
    const coinId = getCryptoPriceService().getCoinId(symbol);
    const response = await getCoinGeckoApiClient().getPrices([coinId]);
    return asPositiveNumber(response[coinId]?.usd);
  } catch {
    return null;
  }
}

async function fetchCryptoQuoteForDate(symbol: string, buyDate: string): Promise<number | null> {
  if (isToday(buyDate)) {
    return fetchLiveCryptoQuote(symbol);
  }

  try {
    const coinId = getCryptoPriceService().getCoinId(symbol);
    const date = toCoinGeckoDate(buyDate);
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/history?date=${encodeURIComponent(date)}&localization=false`;
    const response = await fetch(url, { signal: withFetchTimeout(QUOTE_FETCH_TIMEOUT_MS) });
    if (response.ok) {
      const data = await response.json();
      const historicalPrice = asPositiveNumber(data?.market_data?.current_price?.usd);
      if (historicalPrice) return historicalPrice;
    }
  } catch {
    // fallback below
  }

  return fetchLiveCryptoQuote(symbol);
}

async function resolveQuotePrice(
  db: PortfolioData,
  symbol: string,
  assetType: AssetTypeHint | undefined,
  buyDate: string,
): Promise<{ price: number | null; resolvedType: AssetTypeHint | undefined }> {
  const dbPrice = getDbPriceForSymbol(db, symbol);
  const shouldUseDbFirst = isToday(buyDate);
  if (dbPrice && shouldUseDbFirst) {
    return { price: dbPrice, resolvedType: assetType };
  }

  // Type-aware lookup first
  if (assetType === 'stock' || assetType === 'etf') {
    // Fast path for local mode without stock API key: return cached server-side price.
    if (!STOCK_API_KEY && dbPrice) {
      return { price: dbPrice, resolvedType: assetType };
    }
    const stockPrice = await fetchStockQuoteForDate(symbol, buyDate);
    const safeStockPrice =
      stockPrice && !isSuspiciousNearDateQuote(stockPrice, dbPrice, buyDate)
        ? stockPrice
        : null;
    return { price: safeStockPrice || dbPrice, resolvedType: assetType };
  }
  if (assetType === 'crypto') {
    const cryptoPrice = await fetchCryptoQuoteForDate(symbol, buyDate);
    if (cryptoPrice) return { price: cryptoPrice, resolvedType: 'crypto' };
    return { price: dbPrice, resolvedType: assetType };
  }

  // Unknown type: try stock first, then crypto.
  const stockPrice = await fetchStockQuoteForDate(symbol, buyDate);
  const safeStockPrice =
    stockPrice && !isSuspiciousNearDateQuote(stockPrice, dbPrice, buyDate)
      ? stockPrice
      : null;
  if (safeStockPrice) return { price: safeStockPrice, resolvedType: 'stock' };

  // Avoid expensive crypto fallback for equity-like symbols unless they are known crypto mappings.
  const cryptoService = getCryptoPriceService();
  if (looksLikeEquityTicker(symbol) && !cryptoService.hasKnownMapping(symbol)) {
    return { price: dbPrice, resolvedType: assetType };
  }

  const cryptoPrice = await fetchCryptoQuoteForDate(symbol, buyDate);
  if (cryptoPrice) return { price: cryptoPrice, resolvedType: 'crypto' };

  return { price: dbPrice, resolvedType: assetType };
}

async function enrichBuyToolArgs(
  args: Record<string, unknown>,
  db: PortfolioData,
  userText: string,
): Promise<Record<string, unknown>> {
  const symbol = String(args.symbol || '').toUpperCase();
  const existing = symbol ? findPositionBySymbol(db.positions, symbol) : undefined;

  const date = resolveCommandDate(args.date, userText);
  const totalCost = asPositiveNumber(args.totalCost);
  let amount = asPositiveNumber(args.amount);
  let price = asPositiveNumber(args.price);

  let assetType = (typeof args.assetType === 'string' ? args.assetType : existing?.type) as AssetTypeHint | undefined;
  if (!assetType && existing) assetType = existing.type;

  if (totalCost && amount && !price) {
    price = Number((totalCost / amount).toFixed(8));
  }

  // Server-side fallback: resolve quote + derive amount for totalCost-only buys.
  if (totalCost && (!amount || !price) && symbol) {
    const quote = await resolveQuotePrice(db, symbol, assetType, date);
    if (!price && quote.price) price = quote.price;
    if (!assetType && quote.resolvedType) assetType = quote.resolvedType;
    if (!amount && totalCost && price) amount = Number((totalCost / price).toFixed(8));
  }

  const enriched: Record<string, unknown> = {
    ...args,
    symbol,
    date,
  };

  if (assetType) enriched.assetType = assetType;
  if (totalCost) enriched.totalCost = totalCost;
  if (amount) enriched.amount = amount;
  if (price) enriched.price = price;

  return enriched;
}

async function enrichSellToolArgs(
  args: Record<string, unknown>,
  db: PortfolioData,
  userText: string,
): Promise<Record<string, unknown>> {
  const rawSymbol = String(args.symbol || '').toUpperCase();
  const guessedSymbol = guessPortfolioSymbolFromUserText(db, userText);
  const symbolInput = rawSymbol || guessedSymbol || '';
  const symbol = resolveClosestPortfolioSymbol(db, symbolInput);
  const existing = symbol ? findPositionBySymbol(db.positions, symbol) : undefined;
  const date = resolveCommandDate(args.date, userText);
  let price = asPositiveNumber(args.price);
  let assetType = (typeof args.assetType === 'string' ? args.assetType : existing?.type) as AssetTypeHint | undefined;
  if (!assetType && existing) assetType = existing.type;

  if (!price && symbol) {
    const quote = await resolveQuotePrice(db, symbol, assetType, date);
    if (quote.price) price = quote.price;
    if (!assetType && quote.resolvedType) assetType = quote.resolvedType;
  }
  // Last-resort fallback: if quote lookup fails, use average cost to avoid blocking sell confirmation.
  if (!price && existing?.costBasis && existing.amount > 0) {
    const avgCost = existing.costBasis / existing.amount;
    if (avgCost > 0) price = avgCost;
  }

  const enriched: Record<string, unknown> = {
    ...args,
    symbol,
    date,
  };
  if (price) enriched.price = price;
  if (assetType) enriched.assetType = assetType;
  return enriched;
}

function enrichExistingPositionToolArgs(
  args: Record<string, unknown>,
  db: PortfolioData,
): Record<string, unknown> {
  const rawSymbol = String(args.symbol || '').toUpperCase();
  if (!rawSymbol) return args;
  const symbol = resolveClosestPortfolioSymbol(db, rawSymbol);
  return {
    ...args,
    symbol,
  };
}

function enrichQueryToolArgs(
  toolName: string,
  args: Record<string, unknown>,
  db: PortfolioData,
): Record<string, unknown> {
  if (toolName !== 'query_position_details') return args;
  const rawSymbol = String(args.symbol || '').toUpperCase();
  if (!rawSymbol) return args;
  const symbol = resolveClosestPortfolioSymbol(db, rawSymbol);
  return { ...args, symbol };
}

// ─── Portfolio Context Builder ────────────────────────────────────────────────

function buildSystemContext(db: PortfolioData, opts?: { includePositions?: boolean; includeSymbolCatalog?: boolean; includeAccounts?: boolean }): string {
  const lines: string[] = [
    'You are a portfolio assistant. ALWAYS respond in English.',
    '',
    '## Rules',
    '- ALWAYS call a tool before answering. NEVER answer from context alone.',
    '- For any question about portfolio data (net worth, positions, exposure, etc.), call the appropriate query tool FIRST, then summarize the result.',
    '- For mutations, call the mutation tool DIRECTLY — do NOT look up the position first.',
    '- For confirmable mutations, emit one tool call immediately with minimal prose.',
    '- When the user uses past tense ("bought", "sold", "added", "removed", "updated"), treat it as a mutation.',
    '  "bought 10 AAPL" → call buy_position(symbol: "AAPL", amount: 10, assetType: "stock")',
    '  "sold half my ETH" → call sell_partial(symbol: "ETH", percent: 50)',
    '  "sold 50% of GOOG today" → call sell_partial(symbol: "GOOG", percent: 50, date: "today")',
    '  "sold all of GOOG yesterday" → call sell_all(symbol: "GOOG", date: "yesterday")',
    '- For buy_position: if the position does not exist yet, it will be created automatically. Do NOT call query_position_details before buying.',
    '- Use the symbol provided by the user. The server will resolve close symbol matches when needed.',
    '',
    '## Buy: "at" vs "for" vs "worth of" disambiguation',
    '- "at $X" means per-unit price → use the `price` parameter',
    '  "bought 10 AAPL at $185" → buy_position(symbol: "AAPL", amount: 10, price: 185, assetType: "stock")',
    '- "for $X" or "for Xk" means total spend → use the `totalCost` parameter',
    '  "bought 123 MSFT for 50k" → buy_position(symbol: "MSFT", amount: 123, totalCost: 50000, assetType: "stock")',
    '- "$X worth of Y" or "Xk of Y" or "X dollars of Y" means total spend → use `totalCost` only, do NOT set `amount`',
    '  "bought $50k worth of MSFT" → buy_position(symbol: "MSFT", totalCost: 50000, assetType: "stock")',
    '  "bought 50k USD of AAPL" → buy_position(symbol: "AAPL", totalCost: 50000, assetType: "stock")',
    '- IMPORTANT: When the user specifies a dollar amount to spend without quantity, set `totalCost` and omit `amount`. The system will calculate shares from the current price.',
    '- For sell commands, if user does not provide a per-unit sale price, omit `price` and let the server infer it.',
    '- Include `date` for buy/sell commands when the user specifies one (YYYY-MM-DD). If no date is provided, default to today.',
    '- NEVER put a total dollar value into the `price` field. `price` is ALWAYS per-unit.',
    '- Keep answers concise — 1-3 sentences max.',
    '- Do NOT refuse to call tools. Do NOT ask for confirmation before querying.',
    '',
    '## Asset type — always set this',
    '- Stock tickers (AAPL, MSFT, TSLA, GOOG, AMZN, META, NVDA, etc.) → assetType: "stock"',
    '- ETFs (SPY, QQQ, VTI, VOO, IWM, etc.) → assetType: "etf"',
    '- Crypto (BTC, ETH, SOL, DOGE, ADA, XRP, etc.) → assetType: "crypto"',
    '- Default to "crypto" only for unknown tickers',
    '',
    '## Portfolio Context (for reference only — always use tools for accurate data)',
  ];

  // Accounts summary
  if (opts?.includeAccounts !== false && db.accounts.length > 0) {
    lines.push(`\nAccounts (${db.accounts.length}):`);
    for (const a of db.accounts) {
      const ds = a.connection.dataSource;
      lines.push(`  - ${a.name} (${ds}, id: ${a.id.slice(0, 8)})`);
    }
  }

  if (opts?.includeSymbolCatalog !== false) {
    const symbolCatalog = Array.from(new Set(db.positions.map((p) => p.symbol.toUpperCase()))).sort();
    if (symbolCatalog.length > 0) {
      lines.push(`\nPortfolio symbols (${symbolCatalog.length}): ${symbolCatalog.join(', ')}`);
    }
  }

  // Top positions by value — skip for mutation intents to reduce context size
  if (opts?.includePositions !== false) {
    try {
      const assets = calculateAllPositionsWithPrices(db.positions, db.prices, db.customPrices, db.fxRates);
      const sorted = assets.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
      const top = sorted.slice(0, 20);

      if (top.length > 0) {
        lines.push(`\nTop positions (${db.positions.length} total):`);
        for (const p of top) {
          const acct = p.accountId ? db.accounts.find(a => a.id === p.accountId) : null;
          const acctStr = acct ? ` [${acct.name}]` : '';
          const debtStr = p.isDebt ? ' (DEBT)' : '';
          lines.push(`  - ${p.symbol}: ${p.amount} = $${Math.round(p.value)}${debtStr}${acctStr} (id: ${p.id.slice(0, 8)})`);
        }
      }

      // Summary stats
      const summary = calculatePortfolioSummary(db.positions, db.prices, db.customPrices, db.fxRates);
      lines.push(`\nNet worth: $${Math.round(summary.totalValue)}`);
      lines.push(`Positions: ${summary.positionCount}, Assets: ${summary.assetCount}`);
    } catch {
      lines.push(`\nPositions: ${db.positions.length} (prices unavailable)`);
    }
  } else {
    lines.push(`\nPositions: ${db.positions.length} total`);
  }

  return lines.join('\n');
}

// ─── Tool Executor ────────────────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, unknown>): Promise<{ result: unknown; isMutation: boolean }> {
  const toolDef = getToolById(name);
  if (!toolDef) return { result: { error: `Unknown tool: ${name}` }, isMutation: false };

  const isMutation = toolDef.type === 'mutation';

  switch (name) {
    // ─── Query tools ──────────────────────────────────────────────────
    case 'query_net_worth':
    case 'query_portfolio_summary': {
      const db = readDb();
      const summary = calculatePortfolioSummary(db.positions, db.prices, db.customPrices, db.fxRates);
      return { result: { netWorth: summary.totalValue, grossAssets: summary.grossAssets, totalDebts: summary.totalDebts, cryptoValue: summary.cryptoValue, equityValue: summary.equityValue, cashValue: summary.cashValue, otherValue: summary.otherValue, change24h: summary.change24h, changePercent24h: summary.changePercent24h, positionCount: summary.positionCount, assetCount: summary.assetCount }, isMutation: false };
    }

    case 'query_top_positions': {
      const db = readDb();
      const count = typeof args.count === 'number' ? args.count : 5;
      const assets = calculateAllPositionsWithPrices(db.positions, db.prices, db.customPrices, db.fxRates);
      const top = assets.filter(a => !a.isDebt && !a.isPerpNotional).slice(0, count);
      return { result: top.map(a => ({ symbol: a.symbol, amount: a.amount, value: Math.round(a.value), allocation: a.allocation, change24h: a.changePercent24h })), isMutation: false };
    }

    case 'query_position_details': {
      const db = readDb();
      const symbol = String(args.symbol || '').toLowerCase();
      const assets = calculateAllPositionsWithPrices(db.positions, db.prices, db.customPrices, db.fxRates);
      const matched = assets.filter(a => a.symbol.toLowerCase() === symbol);
      if (matched.length === 0) return { result: { error: `No position found for ${symbol}` }, isMutation: false };
      const total = matched.reduce((sum, a) => sum + a.value, 0);
      const totalAmount = matched.reduce((sum, a) => sum + a.amount, 0);
      return { result: { symbol: symbol.toUpperCase(), totalAmount, totalValue: total, price: matched[0].currentPrice, positions: matched.length }, isMutation: false };
    }

    case 'query_positions_by_type': {
      const db = readDb();
      const assetType = String(args.assetType || '').toLowerCase();
      const assets = calculateAllPositionsWithPrices(db.positions, db.prices, db.customPrices, db.fxRates);
      const filtered = assets.filter((asset) => {
        if (assetType === 'stock' || assetType === 'etf') return asset.type === assetType;
        if (assetType === 'manual') return isPositionInAssetClass(asset, 'other');
        if (assetType === 'crypto' || assetType === 'cash') {
          return isPositionInAssetClass(asset, assetType);
        }
        return false;
      });
      if (filtered.length === 0 && !['crypto', 'stock', 'etf', 'cash', 'manual'].includes(assetType)) {
        return { result: { error: `Unsupported assetType: ${assetType}` }, isMutation: false };
      }
      return { result: filtered.map(a => ({ symbol: a.symbol, amount: a.amount, value: Math.round(a.value) })), isMutation: false };
    }

    case 'query_exposure':
    case 'query_crypto_exposure': {
      const db = readDb();
      const assets = calculateAllPositionsWithPrices(db.positions, db.prices, db.customPrices, db.fxRates);
      const target = name === 'query_crypto_exposure'
        ? assets.filter((asset) => isPositionInAssetClass(asset, 'crypto'))
        : assets;
      const exposure = calculateExposureData(target);
      const m = exposure.exposureMetrics;
      return { result: { longExposure: m.longExposure, shortExposure: m.shortExposure, grossExposure: m.grossExposure, netExposure: m.netExposure, leverage: m.leverage, cashPosition: m.cashPosition }, isMutation: false };
    }

    case 'query_performance': {
      const db = readDb();
      if (db.snapshots.length < 2) return { result: { error: 'Insufficient snapshot data' }, isMutation: false };
      const metrics = calculatePerformanceMetrics(db.snapshots, db.riskFreeRate);
      return { result: metrics, isMutation: false };
    }

    case 'query_24h_change': {
      const db = readDb();
      const summary = calculatePortfolioSummary(db.positions, db.prices, db.customPrices, db.fxRates);
      return { result: { change24h: summary.change24h, changePercent24h: summary.changePercent24h }, isMutation: false };
    }

    case 'query_category_value': {
      const db = readDb();
      const category = String(args.category || '');
      const summary = calculatePortfolioSummary(db.positions, db.prices, db.customPrices, db.fxRates);
      const match = summary.assetsByType.find(e => e.type === category);
      return { result: match || { error: `No data for category "${category}"` }, isMutation: false };
    }

    case 'query_position_count': {
      const db = readDb();
      return { result: { count: db.positions.length }, isMutation: false };
    }

    case 'query_debt_summary': {
      const db = readDb();
      const assets = calculateAllPositionsWithPrices(db.positions, db.prices, db.customPrices, db.fxRates);
      const debts = assets.filter(a => a.isDebt || a.value < 0);
      const totalDebt = debts.reduce((sum, a) => sum + Math.abs(a.value), 0);
      return { result: { totalDebt, positions: debts.map(a => ({ symbol: a.symbol, value: a.value, protocol: a.protocol })) }, isMutation: false };
    }

    case 'query_leverage': {
      const db = readDb();
      const assets = calculateAllPositionsWithPrices(db.positions, db.prices, db.customPrices, db.fxRates);
      const exposure = calculateExposureData(assets);
      return { result: { leverage: exposure.exposureMetrics.leverage }, isMutation: false };
    }

    case 'query_perps_summary': {
      const db = readDb();
      const assets = calculateAllPositionsWithPrices(db.positions, db.prices, db.customPrices, db.fxRates);
      const perpData = calculatePerpPageData(assets);
      return { result: { hasPerps: perpData.hasPerps, exchanges: perpData.exchangeStats }, isMutation: false };
    }

    case 'query_risk_profile': {
      const db = readDb();
      const assets = calculateAllPositionsWithPrices(db.positions, db.prices, db.customPrices, db.fxRates);
      const risk = calculateRiskProfile(assets);
      return { result: risk, isMutation: false };
    }

    // ─── Mutation tools ───────────────────────────────────────────────
    case 'buy_position': {
      const symbol = String(args.symbol || '').toUpperCase();
      let amount = Number(args.amount || 0);
      let price = args.price ? Number(args.price) : 0;
      const totalCost = args.totalCost ? Number(args.totalCost) : 0;
      // Derive price from totalCost
      if (totalCost > 0 && amount > 0 && price <= 0) {
        price = totalCost / amount;
      }
      // Derive amount from totalCost when only price is known.
      if (totalCost > 0 && amount <= 0 && price > 0) {
        amount = totalCost / price;
      }
      const assetType = String(args.assetType || 'crypto');
      const name = String(args.name || symbol);
      const accountInput = extractAccountInput(args);

      if (!symbol) return { result: { error: 'Symbol is required' }, isMutation: true };
      if ((!amount || amount <= 0) && (!totalCost || totalCost <= 0)) return { result: { error: 'Amount or totalCost must be > 0' }, isMutation: true };
      if (totalCost > 0 && (!amount || amount <= 0)) {
        return { result: { error: 'Could not determine amount from totalCost. Provide amount or a resolvable price.' }, isMutation: true };
      }

      const effectiveAssetClass = assetClassFromType(assetType as 'crypto' | 'stock' | 'etf' | 'cash' | 'manual');
      const effectiveType = assetType as 'crypto' | 'stock' | 'etf' | 'cash' | 'manual';

      const result = await withDb(data => {
        // Resolve account by name
        let accountId: string | undefined;
        const accountResolution = resolveAccountFromArgs(
          data.accounts,
          accountInput ? { account: accountInput } : {},
        );
        if (accountResolution.account) {
          accountId = accountResolution.account.id;
        }

        // Check for existing position
        const existing = findPositionBySymbol(data.positions, symbol);
        if (existing) {
          const newAmount = existing.amount + amount;
          const newCostBasis = (existing.costBasis || 0) + (amount * price);
          const positions = data.positions.map(p =>
            p.id === existing.id ? { ...p, amount: newAmount, costBasis: newCostBasis, updatedAt: new Date().toISOString() } : p
          );
          const tx: Transaction = {
            id: crypto.randomUUID(), type: 'buy', symbol, name: existing.name, assetType: existing.type,
            amount, pricePerUnit: price, totalValue: amount * price, positionId: existing.id,
            date: new Date().toISOString().split('T')[0], createdAt: new Date().toISOString(),
          };
          return { data: { ...data, positions, transactions: [...data.transactions, tx] }, result: { action: 'added_to_existing', symbol, amount: newAmount } };
        }

        const pos: Position = {
          id: crypto.randomUUID(), symbol, name, amount, assetClass: effectiveAssetClass, type: effectiveType,
          costBasis: price ? amount * price : undefined, accountId, addedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        const tx: Transaction = {
          id: crypto.randomUUID(), type: 'buy', symbol, name, assetType: effectiveType,
          amount, pricePerUnit: price, totalValue: amount * price, positionId: pos.id,
          date: new Date().toISOString().split('T')[0], createdAt: new Date().toISOString(),
        };
        return { data: { ...data, positions: [...data.positions, pos], transactions: [...data.transactions, tx] }, result: { action: 'created', symbol, amount } };
      });
      return { result, isMutation: true };
    }

    case 'sell_partial':
    case 'sell_all': {
      const requestedSymbol = String(args.symbol || '').toUpperCase();
      const requestedDate = toDateOnlyString(args.date);
      if (!requestedSymbol) return { result: { error: 'Symbol is required' }, isMutation: true };

      type SellResult =
        | { error: string }
        | { sold: number; remaining: number; symbol: string; price: number; date: string };
      const result = await withDb<SellResult>(data => {
        const resolvedSymbol = resolveClosestPortfolioSymbol(data, requestedSymbol);
        const position = findPositionBySymbol(data.positions, resolvedSymbol) || findPositionBySymbol(data.positions, requestedSymbol);
        if (!position) return { data, result: { error: `No position found for ${requestedSymbol}` } };

        const effectiveSymbol = position.symbol.toUpperCase();
        const sellPrice =
          asPositiveNumber(args.price)
          || getDbPriceForSymbol(data, effectiveSymbol)
          || getDbPriceForSymbol(data, resolvedSymbol)
          || getDbPriceForSymbol(data, requestedSymbol);
        if (!sellPrice) {
          return { data, result: { error: `No sale price available for ${effectiveSymbol}` } };
        }

        let sellAmount: number;
        if (name === 'sell_all') {
          sellAmount = position.amount;
        } else {
          sellAmount = args.amount ? Number(args.amount) : 0;
          if (!sellAmount && args.percent) sellAmount = position.amount * (Number(args.percent) / 100);
        }

        if (!sellAmount || sellAmount <= 0) return { data, result: { error: 'No sell amount' } };
        if (sellAmount > position.amount) return { data, result: { error: `Insufficient amount: have ${position.amount}, want to sell ${sellAmount}` } };

        const remaining = position.amount - sellAmount;
        const tx: Transaction = {
          id: crypto.randomUUID(), type: 'sell', symbol: effectiveSymbol, name: position.name, assetType: position.type,
          amount: sellAmount, pricePerUnit: sellPrice, totalValue: sellAmount * sellPrice,
          costBasisAtExecution: position.costBasis, positionId: position.id,
          date: requestedDate, createdAt: new Date().toISOString(),
        };

        const positions = remaining <= 0
          ? data.positions.filter(p => p.id !== position.id)
          : data.positions.map(p => p.id === position.id ? { ...p, amount: remaining, updatedAt: new Date().toISOString() } : p);

        return { data: { ...data, positions, transactions: [...data.transactions, tx] }, result: { sold: sellAmount, remaining, symbol: effectiveSymbol, price: sellPrice, date: requestedDate } };
      });
      return { result, isMutation: true };
    }

    case 'remove_position': {
      const symbol = String(args.symbol || '').toUpperCase();
      if (!symbol) return { result: { error: 'Symbol is required' }, isMutation: true };

      type RemoveResult = { error: string } | { removed: string };
      const result = await withDb<RemoveResult>(data => {
        const position = findPositionBySymbol(data.positions, symbol);
        if (!position) return { data, result: { error: `No position found for ${symbol}` } };
        return { data: { ...data, positions: data.positions.filter(p => p.id !== position.id) }, result: { removed: symbol } };
      });
      return { result, isMutation: true };
    }

    case 'update_position':
    case 'update_cash': {
      const mode: PositionUpdateMode = name === 'update_cash' ? 'cash' : 'position';
      type UpdateResult = { error: string } | { updated: string; changes: Partial<Position> };

      const result = await withDb<UpdateResult>((data) => {
        const target = resolvePositionUpdateTarget(data, args, mode);
        if (!target.position) {
          return { data, result: { error: target.error || 'No matching position found' } };
        }

        const patch = buildPositionUpdates(data, target.position, args, mode);
        if (!patch.updates) {
          return { data, result: { error: patch.error || 'No update fields provided' } };
        }

        const positions = data.positions.map((p) =>
          p.id === target.position!.id ? { ...p, ...patch.updates } : p
        );

        return {
          data: { ...data, positions },
          result: {
            updated: target.position.name,
            changes: patch.updates,
          },
        };
      });

      return { result, isMutation: true };
    }

    case 'set_price': {
      const symbol = String(args.symbol || '').toLowerCase();
      const price = Number(args.price);
      if (!symbol) return { result: { error: 'Symbol is required' }, isMutation: true };
      if (isNaN(price)) return { result: { error: 'Price is required' }, isMutation: true };

      const result = await withDb(data => ({
        data: { ...data, customPrices: { ...data.customPrices, [symbol]: { price, note: args.note as string | undefined, setAt: new Date().toISOString() } } },
        result: { symbol: symbol.toUpperCase(), price },
      }));
      return { result, isMutation: true };
    }

    case 'add_cash': {
      const currency = String(args.currency || 'USD').toUpperCase();
      const amount = Number(args.amount || 0);
      const accountInput = extractAccountInput(args);
      type AddCashResult =
        | { error: string }
        | { added: string; updated?: string; newBalance?: number; account?: string };

      if (!amount || amount <= 0) return { result: { error: 'Amount must be > 0' }, isMutation: true };

      const result = await withDb<AddCashResult>(data => {
        let accountId: string | undefined;
        let accountLabel: string | undefined = accountInput?.trim();
        const accountResolution = resolveAccountFromArgs(
          data.accounts,
          accountInput ? { account: accountInput } : {},
          { manualOnly: true },
        );
        if (accountInput) {
          if (!accountResolution.account) {
            const reason = accountResolution.status === 'ambiguous'
              ? `Multiple accounts match "${accountInput}"`
              : `No manual account match for "${accountInput}"`;
            return { data, result: { error: reason } };
          }
          accountId = accountResolution.account.id;
          accountLabel = accountResolution.account.name;
        }

        const existing = data.positions.find((position) => {
          if (position.type !== 'cash') return false;
          if (extractCurrencyCode(position.symbol).toUpperCase() !== currency) return false;
          if (accountId) return position.accountId === accountId;
          return !position.accountId;
        });

        if (existing) {
          const nextAmount = existing.amount + amount;
          const nextCostBasis = (existing.costBasis ?? existing.amount) + amount;
          const positions = data.positions.map((position) =>
            position.id === existing.id
              ? {
                  ...position,
                  amount: nextAmount,
                  costBasis: nextCostBasis,
                  name: accountLabel ? `${accountLabel} (${currency})` : position.name,
                  updatedAt: new Date().toISOString(),
                }
              : position
          );
          return {
            data: { ...data, positions },
            result: {
              added: `${amount} ${currency}`,
              updated: existing.name,
              newBalance: nextAmount,
              account: accountLabel,
            },
          };
        }

        const pos: Position = {
          id: crypto.randomUUID(),
          symbol: `CASH_${currency}_${Date.now()}`,
          name: accountLabel ? `${accountLabel} (${currency})` : `${currency} Cash`,
          amount, assetClass: 'cash', type: 'cash', costBasis: amount, accountId,
          addedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        return {
          data: { ...data, positions: [...data.positions, pos] },
          result: { added: `${amount} ${currency}`, account: accountLabel },
        };
      });
      return { result, isMutation: true };
    }

    case 'add_wallet': {
      const address = String(args.address || '');
      const walletName = String(args.name || `Wallet ${address.slice(0, 6)}`);
      const chains = typeof args.chains === 'string' ? args.chains.split(',').map((s: string) => s.trim()) : ['eth'];

      if (!address) return { result: { error: 'Address is required' }, isMutation: true };

      const isSolana = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
      const result = await withDb(data => {
        const account: Account = {
          id: crypto.randomUUID(), name: walletName, isActive: true,
          connection: { dataSource: isSolana ? 'helius' : 'debank', address, chains },
          addedAt: new Date().toISOString(),
        };
        return { data: { ...data, accounts: [...data.accounts, account] }, result: { added: walletName, address } };
      });
      return { result, isMutation: true };
    }

    case 'remove_wallet': {
      const identifier = String(args.identifier || '').toLowerCase();
      if (!identifier) return { result: { error: 'Wallet address or name is required' }, isMutation: true };

      type WalletRemoveResult = { error: string } | { removed: string };
      const result = await withDb<WalletRemoveResult>(data => {
        const wallet = data.accounts.find(a => {
          if (a.connection.dataSource !== 'debank' && a.connection.dataSource !== 'helius') return false;
          const conn = a.connection as { address: string };
          return conn.address.toLowerCase() === identifier || a.name.toLowerCase().includes(identifier);
        });
        if (!wallet) return { data, result: { error: `No wallet found matching "${identifier}"` } };
        return {
          data: { ...data, accounts: data.accounts.filter(a => a.id !== wallet.id), positions: data.positions.filter(p => p.accountId !== wallet.id) },
          result: { removed: wallet.name },
        };
      });
      return { result, isMutation: true };
    }

    case 'toggle_hide_balances': {
      const result = await withDb(data => ({
        data: { ...data, hideBalances: !data.hideBalances },
        result: { hideBalances: !data.hideBalances },
      }));
      return { result, isMutation: true };
    }

    case 'toggle_hide_dust': {
      const result = await withDb(data => ({
        data: { ...data, hideDust: !data.hideDust },
        result: { hideDust: !data.hideDust },
      }));
      return { result, isMutation: true };
    }

    case 'set_risk_free_rate': {
      const rate = Number(args.rate);
      if (isNaN(rate)) return { result: { error: 'Rate is required' }, isMutation: true };

      const result = await withDb(data => ({
        data: { ...data, riskFreeRate: rate },
        result: { riskFreeRate: rate },
      }));
      return { result, isMutation: true };
    }

    default:
      return { result: { error: `Unknown tool: ${name}` }, isMutation: false };
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatRequest;
    const { text, ollamaUrl, ollamaModel } = body;

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const baseUrl = ollamaUrl || 'http://localhost:11434';
    const model = ollamaModel || DEFAULT_MODEL;

    // Build context from db
    const db = readDb();

    // Intent-first routing: start with the classified tool slice when available.
    // Fall back to full toolset only if the first pass produces no tool call.
    const userText = text.trim();
    const regexFallback = classifyIntent(userText);
    const allTools = toOllamaTools();
    const slicedTools = regexFallback.toolIds.length > 0
      ? allTools.filter((tool) => regexFallback.toolIds.includes(tool.function.name))
      : [];
    const usingIntentSlice = slicedTools.length > 0 && slicedTools.length < allTools.length;
    let tools = usingIntentSlice ? slicedTools : allTools;
    let usedAllToolsFallback = !usingIntentSlice;
    const mutationIntents = new Set([
      'buy', 'sell', 'add_cash', 'remove', 'update', 'set_price',
      'toggle', 'add_wallet', 'remove_wallet', 'set_risk_free_rate',
    ]);
    const likelyMutation = mutationIntents.has(regexFallback.intent);

    // Keep runtime fast: avoid expensive priced-position calculations in system context.
    const systemContent = buildSystemContext(db, {
      includePositions: false,
      includeSymbolCatalog: false,
      includeAccounts: !likelyMutation,
    });

    // Initial messages
    const messages: OllamaMessage[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: userText },
    ];

    const allToolCalls: ToolCallResult[] = [];
    let hasMutations = false;

    // Tool-call loop (max rounds)
    for (let round = 0; round < MAX_ROUNDS; round++) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            tools,
            stream: false,
            keep_alive: '30m',
            options: {
              temperature: 0.1,
              top_p: 0.9,
              num_predict: 160,
            },
          }),
        });
      } catch (err) {
        if (err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('ECONNREFUSED'))) {
          return NextResponse.json({ error: 'Ollama not reachable. Make sure Ollama is running (ollama serve).' }, { status: 503 });
        }
        throw err;
      }

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 404) {
          return NextResponse.json({ error: `Model "${model}" not found. Run: ollama pull ${model}` }, { status: 404 });
        }
        return NextResponse.json({ error: `Ollama error: ${errorText}` }, { status: 502 });
      }

      let data: { message?: OllamaMessage };
      try {
        data = await response.json();
      } catch {
        return NextResponse.json({ error: 'Invalid response from LLM' }, { status: 502 });
      }

      const assistantMsg = data.message;
      if (!assistantMsg) {
        return NextResponse.json({ error: 'Invalid response from LLM' }, { status: 502 });
      }

      // Add assistant message to history
      messages.push(assistantMsg);

      // Check for tool calls
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        // Hard-fail fallback: no tool call on intent-sliced pass, retry once with all tools.
        if (!usedAllToolsFallback) {
          usedAllToolsFallback = true;
          tools = allTools;
          messages.length = 0;
          messages.push(
            { role: 'system', content: systemContent },
            { role: 'user', content: userText },
          );
          continue;
        }

        // Final text response
        return NextResponse.json({
          response: assistantMsg.content || '',
          toolCalls: allToolCalls,
          mutations: hasMutations,
        });
      }

      // Execute tool calls
      for (const toolCall of assistantMsg.tool_calls) {
        const { name: toolName } = toolCall.function;
        const rawToolArgs = toolCall.function.arguments || {};
        const currentDb = readDb();
        let toolArgs: Record<string, unknown>;
        if (toolName === 'buy_position') {
          toolArgs = await enrichBuyToolArgs(rawToolArgs, currentDb, userText);
        } else if (toolName === 'sell_partial' || toolName === 'sell_all') {
          toolArgs = await enrichSellToolArgs(rawToolArgs, currentDb, userText);
        } else if (toolName === 'remove_position' || toolName === 'update_position' || toolName === 'update_cash') {
          toolArgs = enrichExistingPositionToolArgs(rawToolArgs, currentDb);
        } else {
          toolArgs = enrichQueryToolArgs(toolName, rawToolArgs, currentDb);
        }

        // Check if this is a confirmable mutation — return pendingAction instead of executing
        if (CONFIRM_MUTATION_TOOLS.has(toolName) || toolName === 'update_cash') {
          const pendingAction = toolCallToAction(toolName, toolArgs || {}, currentDb);
          if (pendingAction) {
            return NextResponse.json({
              response: assistantMsg.content || '',
              toolCalls: allToolCalls,
              mutations: false,
              pendingAction,
            });
          }
        }

        const { result, isMutation } = await executeTool(toolName, toolArgs || {});

        if (isMutation) hasMutations = true;
        allToolCalls.push({ tool: toolName, args: toolArgs || {}, result, isMutation });

        // Add tool result to messages
        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
        });
      }
    }

    // Max rounds reached
    const lastAssistant = messages.filter(m => m.role === 'assistant').pop();
    return NextResponse.json({
      response: lastAssistant?.content || 'I performed the requested actions.',
      toolCalls: allToolCalls,
      mutations: hasMutations,
    });
  } catch (error) {
    if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('ECONNREFUSED'))) {
      return NextResponse.json({ error: 'Ollama not reachable. Make sure Ollama is running (ollama serve).' }, { status: 503 });
    }
    return NextResponse.json({ error: `Chat failed: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}
