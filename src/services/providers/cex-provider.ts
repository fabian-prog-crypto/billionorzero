/**
 * CEX Provider - Centralized Exchange Data Provider
 * Fetches balances from CEX accounts (Binance, etc.)
 */

import { CexAccount, Position } from '@/types';
import { v4 as uuidv4 } from 'uuid';

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

/**
 * Fetch balances from Binance account
 */
async function fetchBinanceBalances(account: CexAccount): Promise<Position[]> {
  try {
    const response = await fetch('/api/cex/binance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: account.apiKey,
        apiSecret: account.apiSecret,
        endpoint: 'account',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('Binance API error:', error);
      throw new Error(error.error || 'Failed to fetch Binance balances');
    }

    const data: BinanceAccountResponse = await response.json();

    // Transform balances to positions
    const positions: Position[] = [];
    const now = new Date().toISOString();

    for (const balance of data.balances) {
      const free = parseFloat(balance.free);
      const locked = parseFloat(balance.locked);
      const total = free + locked;

      // Skip zero balances
      if (total <= 0) continue;

      // Map common stablecoin names
      let symbol = balance.asset.toUpperCase();
      let name = balance.asset;

      // Common asset name mappings
      const nameMap: Record<string, string> = {
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
      };

      if (nameMap[symbol]) {
        name = nameMap[symbol];
      }

      positions.push({
        id: uuidv4(),
        type: 'crypto',
        symbol: symbol.toLowerCase(),
        name,
        amount: total,
        protocol: `cex:${account.exchange}:${account.id}`,
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
 * Fetch all positions from a CEX account
 */
export async function fetchCexAccountPositions(account: CexAccount): Promise<Position[]> {
  if (!account.isActive) {
    return [];
  }

  switch (account.exchange) {
    case 'binance':
      return fetchBinanceBalances(account);
    case 'coinbase':
    case 'kraken':
    case 'okx':
      // Not yet implemented
      console.warn(`${account.exchange} integration not yet implemented`);
      return [];
    default:
      console.warn(`Unknown exchange: ${account.exchange}`);
      return [];
  }
}

/**
 * Fetch positions from all CEX accounts
 */
export async function fetchAllCexPositions(accounts: CexAccount[]): Promise<Position[]> {
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
