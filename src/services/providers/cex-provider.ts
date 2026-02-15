/**
 * CEX Provider - Centralized Exchange Data Provider
 * Fetches balances from CEX accounts (Binance, etc.)
 * Prices are fetched via the centralized CoinGecko price provider
 */

import { Account, CexConnection, Position } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { getCategoryService } from '@/services/domain/category-service';

interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

interface BinanceAccountResponse {
  balances: BinanceBalance[];
  canTrade: boolean;
  accountType: string;
}

interface CoinbaseAdvancedTradeAccount {
  uuid?: string;
  name?: string;
  currency: string;
  available_balance?: { value: string; currency: string };
  hold?: { value: string; currency: string };
  balance?: { value: string; currency: string };
}

interface CoinbaseAdvancedTradeAccountsResponse {
  accounts: CoinbaseAdvancedTradeAccount[];
}

// Common asset name mappings
const ASSET_NAME_MAP: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  USDT: 'Tether USD',
  USDC: 'USD Coin',
  BNB: 'BNB',
  SOL: 'Solana',
  XRP: 'XRP',
  ADA: 'Cardano',
  DOGE: 'Dogecoin',
  DOT: 'Polkadot',
  MATIC: 'Polygon',
  POL: 'Polygon',
  LINK: 'Chainlink',
  UNI: 'Uniswap',
  AVAX: 'Avalanche',
  ATOM: 'Cosmos',
  LTC: 'Litecoin',
  SHIB: 'Shiba Inu',
  TRX: 'TRON',
  ETC: 'Ethereum Classic',
  XLM: 'Stellar',
  NEAR: 'NEAR Protocol',
  APT: 'Aptos',
  ARB: 'Arbitrum',
  OP: 'Optimism',
  INJ: 'Injective',
  SUI: 'Sui',
  SEI: 'Sei',
  TIA: 'Celestia',
  JUP: 'Jupiter',
  WIF: 'dogwifhat',
  PEPE: 'Pepe',
  BONK: 'Bonk',
  SYRUP: 'Maple Finance',
  CAKE: 'PancakeSwap',
  FDUSD: 'First Digital USD',
  AAVE: 'Aave',
  MKR: 'Maker',
  CRV: 'Curve DAO',
  LDO: 'Lido DAO',
  ENS: 'Ethereum Name Service',
  GRT: 'The Graph',
  FET: 'Fetch.ai',
  RNDR: 'Render Token',
  PENDLE: 'Pendle',
  GMX: 'GMX',
  DYDX: 'dYdX',
  ZRO: 'LayerZero',
  ENA: 'Ethena',
  EIGEN: 'EigenLayer',
  XAUT: 'Tether Gold',
  PAXG: 'Pax Gold',
};

/**
 * Fetch balances from Binance account
 */
async function fetchBinanceBalances(account: Account): Promise<Position[]> {
  const conn = account.connection as CexConnection;
  try {
    const response = await fetch('/api/cex/binance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: conn.apiKey,
        apiSecret: conn.apiSecret,
        endpoint: 'account',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('Binance API error:', error);
      throw new Error(error.error || 'Failed to fetch Binance balances');
    }

    const data: BinanceAccountResponse = await response.json();
    const positions: Position[] = [];
    const now = new Date().toISOString();
    const categoryService = getCategoryService();

    for (const balance of data.balances) {
      const free = parseFloat(balance.free);
      const locked = parseFloat(balance.locked);
      const total = free + locked;

      // Skip zero balances
      if (total <= 0) continue;

      const symbol = balance.asset.toUpperCase();
      const symbolLower = symbol.toLowerCase();
      const name = ASSET_NAME_MAP[symbol] || symbol;

      positions.push({
        id: uuidv4(),
        assetClass: categoryService.getAssetClass(symbolLower, 'crypto'),
        type: 'crypto' as const,
        symbol: symbolLower,
        name,
        amount: total,
        accountId: account.id,
        chain: 'binance',
        addedAt: now,
        updatedAt: now,
      });
    }

    return positions;
  } catch (error) {
    console.error('Failed to fetch Binance balances:', error);
    throw error;
  }
}

/**
 * Fetch balances from Coinbase Exchange account
 */
async function fetchCoinbaseBalances(account: Account): Promise<Position[]> {
  const conn = account.connection as CexConnection;
  if (!conn.apiSecret) {
    throw new Error('Missing Coinbase private key');
  }
  try {
    const response = await fetch('/api/cex/coinbase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: conn.apiKey,
        apiSecret: conn.apiSecret,
        endpoint: 'accounts',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('Coinbase API error:', error);
      throw new Error(error.error || 'Failed to fetch Coinbase balances');
    }

    const data: CoinbaseAdvancedTradeAccountsResponse = await response.json();
    const positions: Position[] = [];
    const now = new Date().toISOString();
    const categoryService = getCategoryService();

    const accounts = Array.isArray(data.accounts) ? data.accounts : [];

    for (const accountBalance of accounts) {
      const symbol = accountBalance.currency?.toUpperCase();
      if (!symbol) continue;
      const symbolLower = symbol.toLowerCase();
      const availableValue = accountBalance.available_balance?.value || accountBalance.balance?.value || '0';
      const holdValue = accountBalance.hold?.value || '0';
      const balanceValue = parseFloat(availableValue) + parseFloat(holdValue);

      if (!balanceValue || balanceValue <= 0) continue;

      const name = ASSET_NAME_MAP[symbol] || symbol;

      positions.push({
        id: uuidv4(),
        assetClass: categoryService.getAssetClass(symbolLower, 'crypto'),
        type: 'crypto' as const,
        symbol: symbolLower,
        name,
        amount: balanceValue,
        accountId: account.id,
        chain: 'coinbase',
        addedAt: now,
        updatedAt: now,
      });
    }

    return positions;
  } catch (error) {
    console.error('Failed to fetch Coinbase balances:', error);
    throw error;
  }
}

/**
 * Fetch all positions from a CEX account
 */
export async function fetchCexAccountPositions(account: Account): Promise<Position[]> {
  if (!account.isActive) {
    return [];
  }

  const conn = account.connection as CexConnection;
  switch (conn.dataSource) {
    case 'binance':
      return fetchBinanceBalances(account);
    case 'coinbase':
      return fetchCoinbaseBalances(account);
    case 'kraken':
    case 'okx':
      // Not yet implemented
      console.warn(`${conn.dataSource} integration not yet implemented`);
      return [];
    default:
      console.warn(`Unknown exchange: ${conn.dataSource}`);
      return [];
  }
}

/**
 * Fetch positions from all CEX accounts
 */
export async function fetchAllCexPositions(accounts: Account[]): Promise<Position[]> {
  const activeAccounts = accounts.filter((a) => a.isActive);

  if (activeAccounts.length === 0) {
    return [];
  }

  const results = await Promise.allSettled(
    activeAccounts.map((account) => fetchCexAccountPositions(account))
  );

  const positions: Position[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      positions.push(...result.value);
    } else {
      console.error(
        `Failed to fetch positions from ${activeAccounts[index].name}:`,
        result.reason
      );
    }
  });

  return positions;
}
