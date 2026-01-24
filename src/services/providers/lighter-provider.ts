/**
 * Lighter Provider
 * Fetches and transforms Lighter positions into portfolio positions
 */

import { Position } from '@/types';
import { getLighterApiClient, LighterAccount } from '../api/lighter-api';

export interface LighterPositionsResult {
  positions: Position[];
  prices: Record<string, { price: number; symbol: string }>;
  accountValue: number;
  error?: string;
}

export class LighterProvider {
  private client = getLighterApiClient();

  /**
   * Fetch all positions from Lighter for a wallet address
   * Returns perp positions, spot balances, and account value
   */
  async fetchPositions(walletAddress: string, walletId: string): Promise<LighterPositionsResult> {
    const positions: Position[] = [];
    const prices: Record<string, { price: number; symbol: string }> = {};
    let accountValue = 0;

    try {
      // Fetch asset details to get prices
      const assetDetails = await this.client.getAssetDetails().catch(() => []);
      const assetPrices = new Map<string, number>();
      for (const asset of assetDetails) {
        assetPrices.set(asset.symbol, parseFloat(asset.index_price) || 0);
      }

      // Fetch all accounts for this wallet (user may have multiple sub-accounts)
      const accounts = await this.client.getAccountsByL1Address(walletAddress);

      if (!accounts || accounts.length === 0) {
        // Try single account lookup as fallback
        const singleAccount = await this.client.getAccountByAddress(walletAddress);
        if (singleAccount) {
          return this.processAccount(singleAccount, walletAddress, walletId, assetPrices);
        }
        return { positions: [], prices: {}, accountValue: 0 };
      }

      // Process all accounts
      for (const account of accounts) {
        const result = await this.processAccount(account, walletAddress, walletId, assetPrices);
        positions.push(...result.positions);
        Object.assign(prices, result.prices);
        accountValue += result.accountValue;
      }

      return { positions, prices, accountValue };
    } catch (error) {
      console.error('LighterProvider: Error fetching positions', error);
      return {
        positions: [],
        prices: {},
        accountValue: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Process a single Lighter account into positions
   */
  private async processAccount(
    account: LighterAccount,
    walletAddress: string,
    walletId: string,
    assetPrices: Map<string, number>
  ): Promise<LighterPositionsResult> {
    const positions: Position[] = [];
    const prices: Record<string, { price: number; symbol: string }> = {};
    // Use total_asset_value from Lighter as the account value
    const accountValue = parseFloat(account.total_asset_value) || 0;

    // Process perp positions
    for (const pos of account.positions || []) {
      const size = parseFloat(pos.position);
      if (size === 0) continue;

      const isShort = pos.sign === -1;
      const absSize = Math.abs(size);
      const symbol = pos.symbol;

      // Extract base asset from symbol (e.g., "BTC-PERP" -> "BTC")
      const baseAsset = symbol.split('-')[0] || symbol;

      // Use index price from asset details, or entry price as fallback
      const price = assetPrices.get(baseAsset) || parseFloat(pos.avg_entry_price) || 0;
      const priceKey = `lighter-perp-${baseAsset.toLowerCase()}`;

      prices[priceKey] = {
        price,
        symbol: baseAsset,
      };

      positions.push({
        id: `${walletId}-lighter-perp-${symbol}-${isShort ? 'short' : 'long'}-${account.index}`,
        type: 'crypto',
        symbol: baseAsset,
        name: `${baseAsset} ${isShort ? 'Short' : 'Long'} (Lighter)`,
        amount: absSize,
        walletAddress,
        chain: 'lighter',
        protocol: 'Lighter',
        debankPriceKey: priceKey,
        isDebt: isShort,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Process spot/collateral balances
    for (const asset of account.assets || []) {
      const balance = parseFloat(asset.balance);
      if (balance <= 0) continue;

      const symbol = asset.symbol;
      const priceKey = `lighter-spot-${symbol.toLowerCase()}`;

      // Get price from asset details or default to 1 for stables
      const isStable = symbol === 'USDC' || symbol === 'USDT';
      const price = isStable ? 1 : (assetPrices.get(symbol) || 0);

      prices[priceKey] = {
        price,
        symbol,
      };

      positions.push({
        id: `${walletId}-lighter-spot-${symbol}-${account.index}`,
        type: 'crypto',
        symbol,
        name: `${symbol} (Lighter${isStable ? ' Margin' : ''})`,
        amount: balance,
        walletAddress,
        chain: 'lighter',
        protocol: 'Lighter',
        debankPriceKey: priceKey,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Note: The `collateral` field is the USD value of all assets, not separate USDC
    // We already process individual assets above, so no need to add collateral separately

    return { positions, prices, accountValue };
  }

  /**
   * Check if a wallet has any Lighter activity
   * Only checks if accounts exist - if they do, we'll fetch full data later
   */
  async hasActivity(walletAddress: string): Promise<boolean> {
    try {
      const accounts = await this.client.getAccountsByL1Address(walletAddress);
      if (accounts && accounts.length > 0) {
        // If any account has value or positions, there's activity
        return accounts.some(
          (a) => parseFloat(a.total_asset_value) > 0 || (a.positions && a.positions.length > 0)
        );
      }
      // Fallback to single account lookup
      const account = await this.client.getAccountByAddress(walletAddress);
      return account !== null && parseFloat(account.total_asset_value) > 0;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let instance: LighterProvider | null = null;

export function getLighterProvider(): LighterProvider {
  if (!instance) {
    instance = new LighterProvider();
  }
  return instance;
}
