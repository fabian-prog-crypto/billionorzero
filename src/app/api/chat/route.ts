/**
 * /api/chat — Ollama Native Tool Calling
 *
 * Replaces the broken /api/command endpoint. Uses Ollama's native `tools`
 * parameter instead of `format` for reliable tool calling with Qwen 2.5.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readDb, withDb, type PortfolioData } from '../portfolio/db-store';
import { toOllamaTools, getToolById } from '@/services/domain/tool-registry';
import { calculatePortfolioSummary, calculateAllPositionsWithPrices, calculateExposureData, calculateRiskProfile, calculatePerpPageData } from '@/services/domain/portfolio-calculator';
import { calculatePerformanceMetrics } from '@/services/domain/performance-metrics';
import { assetClassFromType, typeFromAssetClass } from '@/types';
import type { Position, Transaction, Account, ParsedPositionAction, PositionActionType } from '@/types';
import { toSlug } from '@/services/domain/cash-account-service';

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

const MAX_ROUNDS = 5;
const DEFAULT_MODEL = 'llama3.2:latest';

// ─── Portfolio Context Builder ────────────────────────────────────────────────

function buildSystemContext(db: PortfolioData): string {
  const lines: string[] = [
    'You are a portfolio assistant. ALWAYS respond in English.',
    '',
    '## Rules',
    '- ALWAYS call a tool before answering. NEVER answer from context alone.',
    '- For any question about portfolio data (net worth, positions, exposure, etc.), call the appropriate query tool FIRST, then summarize the result.',
    '- For mutations, call the tool directly.',
    '- Keep answers concise — 1-3 sentences max.',
    '- Do NOT refuse to call tools. Do NOT ask for confirmation before querying.',
    '',
    '## Portfolio Context (for reference only — always use tools for accurate data)',
  ];

  // Accounts summary
  if (db.accounts.length > 0) {
    lines.push(`\nAccounts (${db.accounts.length}):`);
    for (const a of db.accounts) {
      const ds = a.connection.dataSource;
      lines.push(`  - ${a.name} (${ds}, id: ${a.id.slice(0, 8)})`);
    }
  }

  // Top positions by value (limit to ~20 for context size)
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

  return lines.join('\n');
}

// ─── Tool Executor ────────────────────────────────────────────────────────────

function findPositionBySymbol(positions: Position[], symbol: string): Position | undefined {
  const s = symbol.toLowerCase();
  const matches = positions.filter(p => p.symbol.toLowerCase() === s);
  if (matches.length === 0) return undefined;
  // Prefer manual position
  return matches.find(p => !p.accountId) || matches[0];
}

// Mutation tools that require confirmation via the modal
const CONFIRM_MUTATION_TOOLS = new Set([
  'buy_position', 'sell_partial', 'sell_all', 'remove_position',
  'update_position', 'set_price', 'add_cash', 'update_cash',
]);

/**
 * Map an Ollama tool call to a ParsedPositionAction for the confirmation modal.
 * Returns null if the tool is not a confirmable mutation.
 */
function toolCallToAction(toolName: string, args: Record<string, unknown>, db: PortfolioData): ParsedPositionAction | null {
  if (!CONFIRM_MUTATION_TOOLS.has(toolName)) return null;

  const symbol = String(args.symbol || args.currency || '').toUpperCase();
  const amount = args.amount ? Number(args.amount) : undefined;
  const price = args.price ? Number(args.price) : undefined;

  // Resolve position by symbol for sell/update/remove actions
  const matchedPosition = symbol ? findPositionBySymbol(db.positions, symbol) : undefined;

  // Resolve account by name
  const accountArg = args.account as string | undefined;
  let matchedAccountId: string | undefined;
  let accountName: string | undefined;
  if (accountArg) {
    const match = db.accounts.find(a => a.name.toLowerCase().includes(accountArg.toLowerCase()));
    if (match) {
      matchedAccountId = match.id;
      accountName = match.name;
    } else {
      accountName = accountArg;
    }
  }

  switch (toolName) {
    case 'buy_position': {
      const assetType = String(args.assetType || 'crypto') as 'crypto' | 'stock' | 'etf' | 'cash' | 'manual';
      const name = String(args.name || symbol);
      return {
        action: 'buy',
        symbol,
        name,
        assetType,
        amount,
        pricePerUnit: price,
        totalCost: amount && price ? amount * price : undefined,
        matchedPositionId: matchedPosition?.id,
        matchedAccountId,
        accountName,
        confidence: 0.9,
        summary: `Buy ${amount ?? '?'} ${symbol}${price ? ` at $${price}` : ''}`,
      };
    }
    case 'sell_partial': {
      const sellAmount = args.amount ? Number(args.amount) : undefined;
      const sellPercent = args.percent ? Number(args.percent) : undefined;
      return {
        action: 'sell_partial',
        symbol,
        assetType: matchedPosition?.type || 'crypto',
        sellAmount,
        sellPercent,
        sellPrice: price,
        matchedPositionId: matchedPosition?.id,
        confidence: 0.9,
        summary: `Sell ${sellAmount ? sellAmount + ' ' : sellPercent ? sellPercent + '% of ' : ''}${symbol}`,
      };
    }
    case 'sell_all': {
      return {
        action: 'sell_all',
        symbol,
        assetType: matchedPosition?.type || 'crypto',
        sellPrice: price,
        matchedPositionId: matchedPosition?.id,
        confidence: 0.9,
        summary: `Sell all ${symbol}`,
      };
    }
    case 'remove_position': {
      return {
        action: 'remove',
        symbol,
        assetType: matchedPosition?.type || 'crypto',
        matchedPositionId: matchedPosition?.id,
        confidence: 0.9,
        summary: `Remove ${symbol} from portfolio`,
      };
    }
    case 'update_position': {
      return {
        action: 'update_position',
        symbol,
        assetType: matchedPosition?.type || 'crypto',
        amount,
        costBasis: args.costBasis ? Number(args.costBasis) : undefined,
        date: args.date ? String(args.date) : undefined,
        matchedPositionId: matchedPosition?.id,
        confidence: 0.9,
        summary: `Update ${symbol} position`,
      };
    }
    case 'set_price': {
      const setSymbol = String(args.symbol || '').toUpperCase();
      return {
        action: 'set_price',
        symbol: setSymbol,
        assetType: 'crypto',
        newPrice: price,
        confidence: 0.9,
        summary: `Set ${setSymbol} price to $${price ?? '?'}`,
      };
    }
    case 'add_cash': {
      const currency = String(args.currency || 'USD').toUpperCase();
      // Try to find an existing cash position for this account+currency combo
      let matchedPosId: string | undefined;
      if (matchedAccountId) {
        const cashPos = db.positions.find(p =>
          p.type === 'cash' && p.accountId === matchedAccountId &&
          (p.symbol.includes(currency) || p.name.toUpperCase().includes(currency))
        );
        if (cashPos) matchedPosId = cashPos.id;
      }
      return {
        action: 'add_cash',
        symbol: currency,
        assetType: 'cash',
        amount,
        currency,
        accountName: accountName || accountArg,
        matchedPositionId: matchedPosId,
        matchedAccountId,
        confidence: 0.9,
        summary: `Add ${amount ?? '?'} ${currency}${accountName ? ` to ${accountName}` : ''}`,
      };
    }
    case 'update_cash': {
      const currency = String(args.currency || '').toUpperCase();
      // Find matching cash position
      const cashPositions = db.positions.filter(p => p.type === 'cash');
      let matchedCash: Position | undefined;
      if (accountArg) {
        const account = db.accounts.find(a => a.name.toLowerCase().includes(accountArg.toLowerCase()));
        if (account) {
          matchedCash = cashPositions.find(p => p.accountId === account.id && p.name.toUpperCase().includes(currency));
        }
      }
      if (!matchedCash) {
        matchedCash = cashPositions.find(p => p.name.toUpperCase().includes(currency) || p.symbol.toUpperCase().includes(currency));
      }
      return {
        action: 'update_cash',
        symbol: currency,
        assetType: 'cash',
        amount,
        currency,
        accountName: accountName || accountArg,
        matchedPositionId: matchedCash?.id,
        matchedAccountId,
        confidence: 0.9,
        summary: `Update ${currency} balance to ${amount ?? '?'}${accountName ? ` in ${accountName}` : ''}`,
      };
    }
    default:
      return null;
  }
}

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
      const assetType = String(args.assetType || '');
      const assets = calculateAllPositionsWithPrices(db.positions, db.prices, db.customPrices, db.fxRates);
      const filtered = assets.filter(a => a.type === assetType);
      return { result: filtered.map(a => ({ symbol: a.symbol, amount: a.amount, value: Math.round(a.value) })), isMutation: false };
    }

    case 'query_exposure':
    case 'query_crypto_exposure': {
      const db = readDb();
      const assets = calculateAllPositionsWithPrices(db.positions, db.prices, db.customPrices, db.fxRates);
      const target = name === 'query_crypto_exposure' ? assets.filter(a => a.type === 'crypto') : assets;
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
      const amount = Number(args.amount || 0);
      const price = args.price ? Number(args.price) : 0;
      const assetType = String(args.assetType || 'crypto');
      const name = String(args.name || symbol);
      const account = args.account as string | undefined;

      if (!symbol) return { result: { error: 'Symbol is required' }, isMutation: true };
      if (!amount || amount <= 0) return { result: { error: 'Amount must be > 0' }, isMutation: true };

      const effectiveAssetClass = assetClassFromType(assetType as 'crypto' | 'stock' | 'etf' | 'cash' | 'manual');
      const effectiveType = assetType as 'crypto' | 'stock' | 'etf' | 'cash' | 'manual';

      const result = await withDb(data => {
        // Resolve account by name
        let accountId: string | undefined;
        if (account) {
          const match = data.accounts.find(a => a.name.toLowerCase().includes(account.toLowerCase()));
          if (match) accountId = match.id;
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
      const symbol = String(args.symbol || '').toUpperCase();
      const sellPrice = args.price ? Number(args.price) : 0;

      if (!symbol) return { result: { error: 'Symbol is required' }, isMutation: true };

      type SellResult = { error: string } | { sold: number; remaining: number; symbol: string };
      const result = await withDb<SellResult>(data => {
        const position = findPositionBySymbol(data.positions, symbol);
        if (!position) return { data, result: { error: `No position found for ${symbol}` } };

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
          id: crypto.randomUUID(), type: 'sell', symbol, name: position.name, assetType: position.type,
          amount: sellAmount, pricePerUnit: sellPrice, totalValue: sellAmount * sellPrice,
          costBasisAtExecution: position.costBasis, positionId: position.id,
          date: new Date().toISOString().split('T')[0], createdAt: new Date().toISOString(),
        };

        const positions = remaining <= 0
          ? data.positions.filter(p => p.id !== position.id)
          : data.positions.map(p => p.id === position.id ? { ...p, amount: remaining, updatedAt: new Date().toISOString() } : p);

        return { data: { ...data, positions, transactions: [...data.transactions, tx] }, result: { sold: sellAmount, remaining, symbol } };
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

    case 'update_position': {
      const symbol = String(args.symbol || '').toUpperCase();
      if (!symbol) return { result: { error: 'Symbol is required' }, isMutation: true };

      type UpdateResult = { error: string } | { updated: string; changes: Partial<Position> };
      const result = await withDb<UpdateResult>(data => {
        const position = findPositionBySymbol(data.positions, symbol);
        if (!position) return { data, result: { error: `No position found for ${symbol}` } };

        const updates: Partial<Position> = {};
        if (args.amount !== undefined) updates.amount = Number(args.amount);
        if (args.costBasis !== undefined) updates.costBasis = Number(args.costBasis);
        if (args.date !== undefined) updates.purchaseDate = String(args.date);
        updates.updatedAt = new Date().toISOString();

        const positions = data.positions.map(p => p.id === position.id ? { ...p, ...updates } : p);
        return { data: { ...data, positions }, result: { updated: symbol, changes: updates } };
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
      const accountName = args.account as string | undefined;

      if (!amount || amount <= 0) return { result: { error: 'Amount must be > 0' }, isMutation: true };

      const result = await withDb(data => {
        let accountId: string | undefined;
        if (accountName) {
          const match = data.accounts.find(a => a.name.toLowerCase().includes(accountName.toLowerCase()) && a.connection.dataSource === 'manual');
          if (match) accountId = match.id;
        }

        const pos: Position = {
          id: crypto.randomUUID(), symbol: `CASH_${currency}_${Date.now()}`, name: `${currency} Cash`,
          amount, assetClass: 'cash', type: 'cash', costBasis: amount, accountId,
          addedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        return { data: { ...data, positions: [...data.positions, pos] }, result: { added: `${amount} ${currency}` } };
      });
      return { result, isMutation: true };
    }

    case 'update_cash': {
      const currency = String(args.currency || '').toUpperCase();
      const newAmount = Number(args.amount);
      const accountName = args.account as string | undefined;

      if (!currency) return { result: { error: 'Currency is required' }, isMutation: true };

      type CashUpdateResult = { error: string } | { updated: string; newBalance: number };
      const result = await withDb<CashUpdateResult>(data => {
        const cashPositions = data.positions.filter(p => p.type === 'cash');
        let matched: Position | undefined;

        if (accountName) {
          const account = data.accounts.find(a => a.name.toLowerCase().includes(accountName.toLowerCase()));
          if (account) matched = cashPositions.find(p => p.accountId === account.id && p.name.toUpperCase().includes(currency));
        }
        if (!matched) {
          matched = cashPositions.find(p => p.name.toUpperCase().includes(currency) || p.symbol.toUpperCase().includes(currency));
        }
        if (!matched) return { data, result: { error: `No cash position found for ${currency}` } };

        const positions = data.positions.map(p => p.id === matched!.id ? { ...p, amount: newAmount, updatedAt: new Date().toISOString() } : p);
        return { data: { ...data, positions }, result: { updated: matched.name, newBalance: newAmount } };
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
    const systemContent = buildSystemContext(db);

    // Get tools in Ollama native format
    const tools = toOllamaTools();

    // Initial messages
    const messages: OllamaMessage[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: text.trim() },
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
          body: JSON.stringify({ model, messages, tools, stream: false }),
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
        // Final text response
        return NextResponse.json({
          response: assistantMsg.content || '',
          toolCalls: allToolCalls,
          mutations: hasMutations,
        });
      }

      // Execute tool calls
      for (const toolCall of assistantMsg.tool_calls) {
        const { name: toolName, arguments: toolArgs } = toolCall.function;

        // Check if this is a confirmable mutation — return pendingAction instead of executing
        if (CONFIRM_MUTATION_TOOLS.has(toolName)) {
          const currentDb = readDb();
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
