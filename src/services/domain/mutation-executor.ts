/**
 * Mutation Executor
 *
 * Handles mutations by converting tool args into MutationPreview objects
 * for user confirmation, then executing them against the store.
 */

import { MutationPreview, MutationChange, MutationResult } from './command-types';
import { Position, ParsedPositionAction, AssetType, WalletConnection, assetClassFromType } from '@/types';
import { usePortfolioStore } from '@/store/portfolioStore';
import { formatCurrency, formatNumber } from '@/lib/utils';
import {
  executePartialSell,
  executeFullSell,
  executeBuy,
} from '@/services/domain/position-operations';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Find a position matching a symbol (case-insensitive).
 * If multiple matches, prefer the one without accountId (manual), else first.
 */
function findPosition(symbol: string): Position | undefined {
  const store = usePortfolioStore.getState();
  const symbolLower = symbol.toLowerCase();
  const matches = store.positions.filter(
    (p) => p.symbol.toLowerCase() === symbolLower
  );

  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];

  // Prefer manual position (no accountId)
  const manual = matches.find((p) => !p.accountId);
  return manual || matches[0];
}

/**
 * Find a position by ID.
 */
function findPositionById(id: string): Position | undefined {
  const store = usePortfolioStore.getState();
  return store.positions.find((p) => p.id === id);
}

/**
 * Resolve an account by name (case-insensitive partial match).
 * Returns { account, ambiguous, candidates } where ambiguous is true if 2+ matches.
 */
function resolveAccount(
  accountName: string,
  accountType?: string
): {
  accountId?: string;
  accountName?: string;
  ambiguous: boolean;
  candidates: { id: string; name: string }[];
} {
  const store = usePortfolioStore.getState();
  const nameLower = accountName.toLowerCase();

  let accounts = store.accounts;
  if (accountType) {
    if (accountType === 'wallet') {
      accounts = accounts.filter((a) => a.connection.dataSource === 'debank' || a.connection.dataSource === 'helius');
    } else if (accountType === 'cex') {
      accounts = accounts.filter((a) => a.connection.dataSource !== 'manual' && a.connection.dataSource !== 'debank' && a.connection.dataSource !== 'helius');
    } else if (accountType === 'cash') {
      accounts = accounts.filter((a) => a.connection.dataSource === 'manual' && a.slug);
    } else {
      // brokerage or other manual
      accounts = accounts.filter((a) => a.connection.dataSource === 'manual');
    }
  }

  const matches = accounts.filter(
    (a) => a.name.toLowerCase().includes(nameLower)
  );

  if (matches.length === 1) {
    return {
      accountId: matches[0].id,
      accountName: matches[0].name,
      ambiguous: false,
      candidates: [],
    };
  }

  if (matches.length === 0) {
    return { ambiguous: false, candidates: [] };
  }

  return {
    ambiguous: true,
    candidates: matches.map((a) => ({ id: a.id, name: a.name })),
  };
}

/**
 * Get the current price for a symbol from the store.
 */
function getCurrentPrice(symbol: string): number {
  const store = usePortfolioStore.getState();
  const symbolLower = symbol.toLowerCase();

  // Check custom prices first
  const custom = store.customPrices[symbolLower];
  if (custom) return custom.price;

  // Check market prices
  const price = store.prices[symbolLower];
  return price?.price || 0;
}

function errorPreview(tool: string, message: string): MutationPreview {
  return {
    tool,
    summary: message,
    changes: [{ label: 'Error', after: message }],
    resolvedArgs: { _error: true },
  };
}

// ─── Preview Handlers ───────────────────────────────────────────────────────

function previewBuyPosition(args: Record<string, unknown>): MutationPreview {
  const symbol = (args.symbol as string || '').toUpperCase();
  const amount = args.amount as number || 0;
  const pricePerUnit = args.price as number || getCurrentPrice(symbol);
  const assetType = (args.assetType as AssetType) || 'crypto';
  const accountName = args.account as string;
  const name = (args.name as string) || symbol;

  if (!symbol) return errorPreview('buy_position', 'No symbol provided');
  if (!amount || amount <= 0) return errorPreview('buy_position', 'Amount must be greater than zero');

  const existing = findPosition(symbol);
  const cost = amount * pricePerUnit;

  const changes: MutationChange[] = [
    { label: 'Symbol', after: symbol },
    { label: 'Amount', before: existing ? formatNumber(existing.amount) : 'New position', after: formatNumber(existing ? existing.amount + amount : amount) },
    { label: 'Cost', after: formatCurrency(cost) },
    { label: 'Price', after: formatCurrency(pricePerUnit) },
  ];

  const resolvedArgs: Record<string, unknown> = {
    symbol,
    name,
    amount,
    pricePerUnit,
    totalCost: cost,
    assetType,
    matchedPositionId: existing?.id,
  };

  // Resolve account if provided
  if (accountName) {
    const targetType = assetType === 'stock' || assetType === 'etf' ? 'brokerage' : undefined;
    const resolved = resolveAccount(accountName, targetType);
    if (resolved.ambiguous) {
      changes.push({
        label: 'Account',
        after: `Multiple matches: ${resolved.candidates.map((c) => c.name).join(', ')}`,
      });
    } else if (resolved.accountId) {
      resolvedArgs.accountId = resolved.accountId;
      changes.push({ label: 'Account', after: resolved.accountName || accountName });
    } else {
      changes.push({ label: 'Account', after: `"${accountName}" not found` });
    }
  }

  return {
    tool: 'buy_position',
    summary: `Buy ${formatNumber(amount)} ${symbol} at ${formatCurrency(pricePerUnit)}`,
    changes,
    resolvedArgs,
  };
}

function previewSellPartial(args: Record<string, unknown>): MutationPreview {
  const symbol = (args.symbol as string || '').toUpperCase();
  const sellPrice = args.price as number || getCurrentPrice(symbol);

  if (!symbol) return errorPreview('sell_partial', 'No symbol provided');

  const position = findPosition(symbol);
  if (!position) return errorPreview('sell_partial', `No position found for "${symbol}"`);

  // Resolve amount: either explicit amount or percentage of position
  let sellAmount = args.amount as number || 0;
  if (!sellAmount && args.percent) {
    sellAmount = position.amount * ((args.percent as number) / 100);
  }
  if (!sellAmount || sellAmount <= 0) return errorPreview('sell_partial', 'No sell amount or percent provided');

  const remainingAmount = position.amount - sellAmount;
  if (remainingAmount < 0) {
    return errorPreview('sell_partial', `Cannot sell ${formatNumber(sellAmount)} — only ${formatNumber(position.amount)} available`);
  }

  const changes: MutationChange[] = [
    { label: 'Symbol', after: symbol },
    { label: 'Sell Amount', after: formatNumber(sellAmount) },
    { label: 'Amount', before: formatNumber(position.amount), after: formatNumber(remainingAmount) },
    { label: 'Sell Price', after: formatCurrency(sellPrice) },
    { label: 'Proceeds', after: formatCurrency(sellAmount * sellPrice) },
  ];

  return {
    tool: 'sell_partial',
    summary: `Sell ${formatNumber(sellAmount)} ${symbol} at ${formatCurrency(sellPrice)}`,
    changes,
    resolvedArgs: {
      symbol,
      sellAmount,
      sellPrice,
      matchedPositionId: position.id,
    },
  };
}

function previewSellAll(args: Record<string, unknown>): MutationPreview {
  const symbol = (args.symbol as string || '').toUpperCase();
  const sellPrice = args.price as number || getCurrentPrice(symbol);

  if (!symbol) return errorPreview('sell_all', 'No symbol provided');

  const position = findPosition(symbol);
  if (!position) return errorPreview('sell_all', `No position found for "${symbol}"`);

  const proceeds = position.amount * sellPrice;
  const changes: MutationChange[] = [
    { label: 'Symbol', after: symbol },
    { label: 'Amount', before: formatNumber(position.amount), after: '0 (removed)' },
    { label: 'Sell Price', after: formatCurrency(sellPrice) },
    { label: 'Proceeds', after: formatCurrency(proceeds) },
  ];

  return {
    tool: 'sell_all',
    summary: `Sell all ${formatNumber(position.amount)} ${symbol} at ${formatCurrency(sellPrice)}`,
    changes,
    resolvedArgs: {
      symbol,
      sellPrice,
      matchedPositionId: position.id,
    },
  };
}

function previewRemovePosition(args: Record<string, unknown>): MutationPreview {
  const symbol = (args.symbol as string || '').toUpperCase();

  if (!symbol) return errorPreview('remove_position', 'No symbol provided');

  const position = findPosition(symbol);
  if (!position) return errorPreview('remove_position', `No position found for "${symbol}"`);

  const changes: MutationChange[] = [
    { label: 'Symbol', after: symbol },
    { label: 'Amount', before: formatNumber(position.amount), after: 'Removed' },
    { label: 'Action', after: 'Delete position (no transaction recorded)' },
  ];

  return {
    tool: 'remove_position',
    summary: `Remove ${symbol} position (${formatNumber(position.amount)})`,
    changes,
    resolvedArgs: {
      matchedPositionId: position.id,
    },
  };
}

function previewUpdatePosition(args: Record<string, unknown>): MutationPreview {
  const symbol = (args.symbol as string || '').toUpperCase();

  if (!symbol) return errorPreview('update_position', 'No symbol provided');

  const position = findPosition(symbol);
  if (!position) return errorPreview('update_position', `No position found for "${symbol}"`);

  const changes: MutationChange[] = [];

  if (args.amount !== undefined) {
    changes.push({
      label: 'Amount',
      before: formatNumber(position.amount),
      after: formatNumber(args.amount as number),
    });
  }
  if (args.costBasis !== undefined) {
    changes.push({
      label: 'Cost Basis',
      before: position.costBasis !== undefined ? formatCurrency(position.costBasis) : 'Not set',
      after: formatCurrency(args.costBasis as number),
    });
  }
  if (args.date !== undefined) {
    changes.push({
      label: 'Purchase Date',
      before: position.purchaseDate || 'Not set',
      after: args.date as string,
    });
  }

  if (changes.length === 0) {
    return errorPreview('update_position', 'No fields to update');
  }

  return {
    tool: 'update_position',
    summary: `Update ${symbol} position`,
    changes,
    resolvedArgs: {
      matchedPositionId: position.id,
      amount: args.amount,
      costBasis: args.costBasis,
      purchaseDate: args.date,
    },
  };
}

function previewSetPrice(args: Record<string, unknown>): MutationPreview {
  const symbol = (args.symbol as string || '').toUpperCase();
  const newPrice = args.price as number;

  if (!symbol) return errorPreview('set_price', 'No symbol provided');
  if (newPrice === undefined || newPrice === null) return errorPreview('set_price', 'No price provided');

  const oldPrice = getCurrentPrice(symbol);

  const changes: MutationChange[] = [
    { label: 'Symbol', after: symbol },
    { label: 'Price', before: formatCurrency(oldPrice), after: formatCurrency(newPrice) },
  ];

  if (args.note) {
    changes.push({ label: 'Note', after: args.note as string });
  }

  return {
    tool: 'set_price',
    summary: `Set custom price for ${symbol}: ${formatCurrency(newPrice)}`,
    changes,
    resolvedArgs: {
      symbol: symbol.toLowerCase(),
      price: newPrice,
      note: args.note,
    },
  };
}

function previewAddCash(args: Record<string, unknown>): MutationPreview {
  const amount = args.amount as number || 0;
  const currency = (args.currency as string || 'USD').toUpperCase();
  const accountName = args.account as string;

  if (!amount || amount <= 0) return errorPreview('add_cash', 'Amount must be greater than zero');

  const changes: MutationChange[] = [
    { label: 'Amount', after: `${formatNumber(amount)} ${currency}` },
  ];

  const resolvedArgs: Record<string, unknown> = { amount, currency };

  if (accountName) {
    const resolved = resolveAccount(accountName, 'cash');
    if (resolved.ambiguous) {
      changes.push({
        label: 'Account',
        after: `Multiple matches: ${resolved.candidates.map((c) => c.name).join(', ')}`,
      });
    } else if (resolved.accountId) {
      resolvedArgs.accountId = resolved.accountId;
      changes.push({ label: 'Account', after: resolved.accountName || accountName });
    } else {
      changes.push({ label: 'Account', after: `"${accountName}" not found — will create standalone` });
    }
  }

  return {
    tool: 'add_cash',
    summary: `Add ${formatNumber(amount)} ${currency} cash`,
    changes,
    resolvedArgs,
  };
}

function previewUpdateCash(args: Record<string, unknown>): MutationPreview {
  const currency = (args.currency as string || '').toUpperCase();
  const newAmount = args.amount as number;
  const accountName = args.account as string;

  if (!currency) return errorPreview('update_cash', 'No currency provided');
  if (newAmount === undefined) return errorPreview('update_cash', 'No amount provided');

  // Find matching cash position by currency and optional account
  const store = usePortfolioStore.getState();
  const cashPositions = store.positions.filter((p) => p.type === 'cash');

  let matched: Position | undefined;

  if (accountName) {
    // Resolve account first, then find cash position linked to it
    const resolved = resolveAccount(accountName, 'cash');
    if (resolved.accountId) {
      matched = cashPositions.find(
        (p) => p.accountId === resolved.accountId && p.name.includes(currency)
      );
    }
  }

  if (!matched) {
    // Fall back to matching by currency in name or symbol
    matched = cashPositions.find(
      (p) => p.name.toUpperCase().includes(currency) || p.symbol.toUpperCase().includes(currency)
    );
  }

  if (!matched) return errorPreview('update_cash', `No cash position found for "${currency}"`);

  const changes: MutationChange[] = [
    { label: 'Account', after: matched.name },
    { label: 'Balance', before: formatNumber(matched.amount), after: formatNumber(newAmount) },
  ];

  return {
    tool: 'update_cash',
    summary: `Update ${matched.name} balance to ${formatNumber(newAmount)}`,
    changes,
    resolvedArgs: {
      matchedPositionId: matched.id,
      amount: newAmount,
    },
  };
}

function previewAddWallet(args: Record<string, unknown>): MutationPreview {
  const address = args.address as string || '';
  const name = args.name as string || '';
  const chains = (args.chains as string[]) || ['eth'];

  if (!address) return errorPreview('add_wallet', 'No wallet address provided');

  const changes: MutationChange[] = [
    { label: 'Address', after: address },
    { label: 'Chains', after: chains.join(', ') },
  ];

  if (name) {
    changes.push({ label: 'Name', after: name });
  }

  return {
    tool: 'add_wallet',
    summary: `Connect wallet ${address.slice(0, 6)}...${address.slice(-4)}`,
    changes,
    resolvedArgs: { address, name: name || `Wallet ${address.slice(0, 6)}`, chains },
  };
}

function previewRemoveWallet(args: Record<string, unknown>): MutationPreview {
  const identifier = (args.identifier as string || '').toLowerCase();
  const address = identifier.startsWith('0x') ? identifier : '';
  const name = !address ? identifier : '';

  const store = usePortfolioStore.getState();
  const wallets = store.walletAccounts();

  const match = wallets.find((w) => {
    const conn = w.connection as WalletConnection;
    if (address && conn.address.toLowerCase() === address) return true;
    if (name && w.name.toLowerCase().includes(name)) return true;
    return false;
  });

  if (!match) {
    return errorPreview('remove_wallet', `No wallet found matching "${address || name}"`);
  }

  const walletConn = match.connection as WalletConnection;

  const changes: MutationChange[] = [
    { label: 'Wallet', before: match.name, after: 'Removed' },
    { label: 'Address', before: walletConn.address, after: 'Disconnected' },
  ];

  return {
    tool: 'remove_wallet',
    summary: `Remove wallet ${match.name}`,
    changes,
    resolvedArgs: { accountId: match.id },
  };
}

function previewToggleHideBalances(): MutationPreview {
  const store = usePortfolioStore.getState();
  const current = store.hideBalances;

  return {
    tool: 'toggle_hide_balances',
    summary: current ? 'Show balances' : 'Hide balances',
    changes: [
      { label: 'Hide Balances', before: current ? 'On' : 'Off', after: current ? 'Off' : 'On' },
    ],
    resolvedArgs: {},
  };
}

function previewToggleHideDust(): MutationPreview {
  const store = usePortfolioStore.getState();
  const current = store.hideDust;

  return {
    tool: 'toggle_hide_dust',
    summary: current ? 'Show dust positions' : 'Hide dust positions',
    changes: [
      { label: 'Hide Dust (<$100)', before: current ? 'On' : 'Off', after: current ? 'Off' : 'On' },
    ],
    resolvedArgs: {},
  };
}

function previewSetRiskFreeRate(args: Record<string, unknown>): MutationPreview {
  const rate = args.rate as number;
  if (rate === undefined || rate === null) return errorPreview('set_risk_free_rate', 'No rate provided');

  const store = usePortfolioStore.getState();
  const currentRate = store.riskFreeRate;

  return {
    tool: 'set_risk_free_rate',
    summary: `Set risk-free rate to ${(rate * 100).toFixed(1)}%`,
    changes: [
      {
        label: 'Risk-Free Rate',
        before: `${(currentRate * 100).toFixed(1)}%`,
        after: `${(rate * 100).toFixed(1)}%`,
      },
    ],
    resolvedArgs: { rate },
  };
}

// ─── Execute Handlers ───────────────────────────────────────────────────────

function execBuyPosition(resolvedArgs: Record<string, unknown>): MutationResult {
  if (resolvedArgs._error) return { success: false, summary: '', error: resolvedArgs._error as string };

  const store = usePortfolioStore.getState();
  const symbol = resolvedArgs.symbol as string;
  const amount = resolvedArgs.amount as number;
  const pricePerUnit = resolvedArgs.pricePerUnit as number;
  const assetType = (resolvedArgs.assetType as AssetType) || 'crypto';
  const name = (resolvedArgs.name as string) || symbol;
  const totalCost = resolvedArgs.totalCost as number | undefined;
  const accountId = resolvedArgs.accountId as string | undefined;
  const matchedPositionId = resolvedArgs.matchedPositionId as string | undefined;
  const date = new Date().toISOString().split('T')[0];

  const existingPosition = matchedPositionId
    ? findPositionById(matchedPositionId) ?? null
    : null;

  const action: ParsedPositionAction = {
    action: 'buy',
    symbol,
    name,
    assetType,
    amount,
    pricePerUnit,
    totalCost,
    confidence: 1,
    summary: `Buy ${amount} ${symbol}`,
  };

  try {
    const result = executeBuy(existingPosition, action, date);

    if (result.updatedPosition && existingPosition) {
      store.updatePosition(existingPosition.id, result.updatedPosition);
    } else if (result.newPosition) {
      store.addPosition({
        ...result.newPosition,
        accountId,
      });
    }

    store.addTransaction(result.transaction);

    return {
      success: true,
      summary: `Bought ${formatNumber(amount)} ${symbol} at ${formatCurrency(pricePerUnit)}`,
    };
  } catch (err) {
    return {
      success: false,
      summary: '',
      error: err instanceof Error ? err.message : 'Buy failed',
    };
  }
}

function execSellPartial(resolvedArgs: Record<string, unknown>): MutationResult {
  if (resolvedArgs._error) return { success: false, summary: '', error: resolvedArgs._error as string };

  const store = usePortfolioStore.getState();
  const matchedPositionId = resolvedArgs.matchedPositionId as string;
  const sellAmount = resolvedArgs.sellAmount as number;
  const sellPrice = resolvedArgs.sellPrice as number;
  const date = new Date().toISOString().split('T')[0];

  const position = findPositionById(matchedPositionId);
  if (!position) return { success: false, summary: '', error: 'Position not found' };

  try {
    const result = executePartialSell(position, sellAmount, sellPrice, date);

    if (result.removedPositionId) {
      store.removePosition(result.removedPositionId);
    } else if (result.updatedPosition) {
      store.updatePosition(position.id, result.updatedPosition);
    }

    store.addTransaction(result.transaction);

    return {
      success: true,
      summary: `Sold ${formatNumber(sellAmount)} ${position.symbol} at ${formatCurrency(sellPrice)}`,
    };
  } catch (err) {
    return {
      success: false,
      summary: '',
      error: err instanceof Error ? err.message : 'Sell failed',
    };
  }
}

function execSellAll(resolvedArgs: Record<string, unknown>): MutationResult {
  if (resolvedArgs._error) return { success: false, summary: '', error: resolvedArgs._error as string };

  const store = usePortfolioStore.getState();
  const matchedPositionId = resolvedArgs.matchedPositionId as string;
  const sellPrice = resolvedArgs.sellPrice as number;
  const date = new Date().toISOString().split('T')[0];

  const position = findPositionById(matchedPositionId);
  if (!position) return { success: false, summary: '', error: 'Position not found' };

  try {
    const result = executeFullSell(position, sellPrice, date);

    if (result.removedPositionId) {
      store.removePosition(result.removedPositionId);
    }

    store.addTransaction(result.transaction);

    return {
      success: true,
      summary: `Sold all ${formatNumber(position.amount)} ${position.symbol} at ${formatCurrency(sellPrice)}`,
    };
  } catch (err) {
    return {
      success: false,
      summary: '',
      error: err instanceof Error ? err.message : 'Sell failed',
    };
  }
}

function execRemovePosition(resolvedArgs: Record<string, unknown>): MutationResult {
  if (resolvedArgs._error) return { success: false, summary: '', error: resolvedArgs._error as string };

  const store = usePortfolioStore.getState();
  const matchedPositionId = resolvedArgs.matchedPositionId as string;

  const position = findPositionById(matchedPositionId);
  if (!position) return { success: false, summary: '', error: 'Position not found' };

  store.removePosition(matchedPositionId);

  return {
    success: true,
    summary: `Removed ${position.symbol} position`,
  };
}

function execUpdatePosition(resolvedArgs: Record<string, unknown>): MutationResult {
  if (resolvedArgs._error) return { success: false, summary: '', error: resolvedArgs._error as string };

  const store = usePortfolioStore.getState();
  const matchedPositionId = resolvedArgs.matchedPositionId as string;

  const position = findPositionById(matchedPositionId);
  if (!position) return { success: false, summary: '', error: 'Position not found' };

  const updates: Partial<Position> = {};
  if (resolvedArgs.amount !== undefined) updates.amount = resolvedArgs.amount as number;
  if (resolvedArgs.costBasis !== undefined) updates.costBasis = resolvedArgs.costBasis as number;
  if (resolvedArgs.purchaseDate !== undefined) updates.purchaseDate = resolvedArgs.purchaseDate as string;

  store.updatePosition(matchedPositionId, updates);

  return {
    success: true,
    summary: `Updated ${position.symbol} position`,
  };
}

function execSetPrice(resolvedArgs: Record<string, unknown>): MutationResult {
  if (resolvedArgs._error) return { success: false, summary: '', error: resolvedArgs._error as string };

  const store = usePortfolioStore.getState();
  const symbol = resolvedArgs.symbol as string;
  const price = resolvedArgs.price as number;
  const note = resolvedArgs.note as string | undefined;

  store.setCustomPrice(symbol, price, note);

  return {
    success: true,
    summary: `Set custom price for ${symbol.toUpperCase()}: ${formatCurrency(price)}`,
  };
}

function execAddCash(resolvedArgs: Record<string, unknown>): MutationResult {
  if (resolvedArgs._error) return { success: false, summary: '', error: resolvedArgs._error as string };

  const store = usePortfolioStore.getState();
  const amount = resolvedArgs.amount as number;
  const currency = (resolvedArgs.currency as string) || 'USD';
  const accountId = resolvedArgs.accountId as string | undefined;

  const symbol = `CASH_${currency}_${Date.now()}`;

  store.addPosition({
    assetClass: 'cash',
    type: 'cash',
    symbol,
    name: `${currency} Cash`,
    amount,
    accountId,
  });

  return {
    success: true,
    summary: `Added ${formatNumber(amount)} ${currency} cash`,
  };
}

function execUpdateCash(resolvedArgs: Record<string, unknown>): MutationResult {
  if (resolvedArgs._error) return { success: false, summary: '', error: resolvedArgs._error as string };

  const store = usePortfolioStore.getState();
  const matchedPositionId = resolvedArgs.matchedPositionId as string;
  const amount = resolvedArgs.amount as number;

  const position = findPositionById(matchedPositionId);
  if (!position) return { success: false, summary: '', error: 'Cash position not found' };

  store.updatePosition(matchedPositionId, { amount });

  return {
    success: true,
    summary: `Updated ${position.symbol} balance to ${formatNumber(amount)}`,
  };
}

function execAddWallet(resolvedArgs: Record<string, unknown>): MutationResult {
  if (resolvedArgs._error) return { success: false, summary: '', error: resolvedArgs._error as string };

  const store = usePortfolioStore.getState();
  const address = resolvedArgs.address as string;
  const name = resolvedArgs.name as string;
  const chains = (resolvedArgs.chains as string[]) || ['eth'];

  store.addAccount({
    name,
    isActive: true,
    connection: {
      dataSource: 'debank',
      address,
      chains,
    },
  });

  return {
    success: true,
    summary: `Connected wallet ${name}`,
  };
}

function execRemoveWallet(resolvedArgs: Record<string, unknown>): MutationResult {
  if (resolvedArgs._error) return { success: false, summary: '', error: resolvedArgs._error as string };

  const store = usePortfolioStore.getState();
  const accountId = resolvedArgs.accountId as string;

  store.removeAccount(accountId);

  return {
    success: true,
    summary: 'Wallet removed',
  };
}

function execToggleHideBalances(): MutationResult {
  const store = usePortfolioStore.getState();
  store.toggleHideBalances();

  const newState = usePortfolioStore.getState().hideBalances;
  return {
    success: true,
    summary: newState ? 'Balances hidden' : 'Balances visible',
  };
}

function execToggleHideDust(): MutationResult {
  const store = usePortfolioStore.getState();
  store.toggleHideDust();

  const newState = usePortfolioStore.getState().hideDust;
  return {
    success: true,
    summary: newState ? 'Dust positions hidden' : 'All positions visible',
  };
}

function execSetRiskFreeRate(resolvedArgs: Record<string, unknown>): MutationResult {
  if (resolvedArgs._error) return { success: false, summary: '', error: resolvedArgs._error as string };

  const store = usePortfolioStore.getState();
  const rate = resolvedArgs.rate as number;

  store.setRiskFreeRate(rate);

  return {
    success: true,
    summary: `Risk-free rate set to ${(rate * 100).toFixed(1)}%`,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function previewMutation(tool: string, args: Record<string, unknown>): MutationPreview {
  try {
    switch (tool) {
      case 'buy_position':
        return previewBuyPosition(args);
      case 'sell_partial':
        return previewSellPartial(args);
      case 'sell_all':
        return previewSellAll(args);
      case 'remove_position':
        return previewRemovePosition(args);
      case 'update_position':
        return previewUpdatePosition(args);
      case 'set_price':
        return previewSetPrice(args);
      case 'add_cash':
        return previewAddCash(args);
      case 'update_cash':
        return previewUpdateCash(args);
      case 'add_wallet':
        return previewAddWallet(args);
      case 'remove_wallet':
        return previewRemoveWallet(args);
      case 'toggle_hide_balances':
        return previewToggleHideBalances();
      case 'toggle_hide_dust':
        return previewToggleHideDust();
      case 'set_risk_free_rate':
        return previewSetRiskFreeRate(args);
      default:
        return errorPreview(tool, `No handler for mutation tool "${tool}"`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorPreview(tool, message);
  }
}

export function executeMutation(tool: string, resolvedArgs: Record<string, unknown>): MutationResult {
  try {
    switch (tool) {
      case 'buy_position':
        return execBuyPosition(resolvedArgs);
      case 'sell_partial':
        return execSellPartial(resolvedArgs);
      case 'sell_all':
        return execSellAll(resolvedArgs);
      case 'remove_position':
        return execRemovePosition(resolvedArgs);
      case 'update_position':
        return execUpdatePosition(resolvedArgs);
      case 'set_price':
        return execSetPrice(resolvedArgs);
      case 'add_cash':
        return execAddCash(resolvedArgs);
      case 'update_cash':
        return execUpdateCash(resolvedArgs);
      case 'add_wallet':
        return execAddWallet(resolvedArgs);
      case 'remove_wallet':
        return execRemoveWallet(resolvedArgs);
      case 'toggle_hide_balances':
        return execToggleHideBalances();
      case 'toggle_hide_dust':
        return execToggleHideDust();
      case 'set_risk_free_rate':
        return execSetRiskFreeRate(resolvedArgs);
      default:
        return { success: false, summary: '', error: `No handler for mutation tool "${tool}"` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, summary: '', error: message };
  }
}
