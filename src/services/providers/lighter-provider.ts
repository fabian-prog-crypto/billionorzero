/**
 * Lighter Provider
 * Fetches and transforms Lighter positions into portfolio positions
 */

import { Position } from '@/types';
import { toChecksumAddress } from '@/lib/eip55';
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
    // Lighter API is case-sensitive — requires EIP-55 checksummed addresses
    const checksummed = toChecksumAddress(walletAddress);

    try {
      // Fetch asset details to get prices
      const assetDetails = await this.client.getAssetDetails().catch(() => []);
      const assetPrices = new Map<string, number>();
      for (const asset of assetDetails) {
        assetPrices.set(asset.symbol, parseFloat(asset.index_price) || 0);
      }

      // Fetch all accounts for this wallet (user may have multiple sub-accounts)
      const accounts = await this.client.getAccountsByL1Address(checksummed);

      if (!accounts || accounts.length === 0) {
        // Try single account lookup as fallback
        const singleAccount = await this.client.getAccountByAddress(checksummed);
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
    const collateralValue = parseFloat(account.collateral) || 0;

    // Debug logging
    console.log(`[Lighter] Account ${account.index}:`);
    console.log(`  - total_asset_value: ${account.total_asset_value}`);
    console.log(`  - collateral: ${account.collateral}`);
    console.log(`  - available_balance: ${account.available_balance}`);
    console.log(`  - assets: ${JSON.stringify(account.assets)}`);
    console.log(`  - positions: ${account.positions?.length || 0}`);

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
        assetClass: 'crypto' as const,
        type: 'crypto' as const,
        symbol: baseAsset,
        name: `${baseAsset} ${isShort ? 'Short' : 'Long'} (Lighter)`,
        amount: absSize,
        accountId: walletId,
        chain: 'lighter',
        protocol: 'Lighter',
        debankPriceKey: priceKey,
        isDebt: isShort,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Use total_asset_value as the margin amount - this is the true account value
    // including unrealized PnL. Individual asset balances may not reflect this accurately.
    // Lighter's total_asset_value is the single source of truth for account equity.
    if (accountValue > 0) {
      const priceKey = 'lighter-usdc';
      prices[priceKey] = { price: 1, symbol: 'USDC' };

      positions.push({
        id: `${walletId}-lighter-margin-usdc-${account.index}`,
        assetClass: 'crypto' as const,
        type: 'crypto' as const,
        symbol: 'USDC',
        name: 'USDC Margin (Lighter)',
        amount: accountValue,  // Use total_asset_value, not individual asset balances
        accountId: walletId,
        chain: 'lighter',
        protocol: 'Lighter',
        debankPriceKey: priceKey,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Process non-stablecoin spot assets (if any)
    for (const asset of account.assets || []) {
      const balance = parseFloat(asset.balance);
      if (balance <= 0) continue;

      const symbol = asset.symbol;
      const upperSymbol = symbol.toUpperCase();

      // Skip stablecoins - we already accounted for them via total_asset_value
      const isStable = upperSymbol === 'USDC' ||
                       upperSymbol === 'USDT' ||
                       upperSymbol === 'DAI' ||
                       upperSymbol === 'FRAX' ||
                       upperSymbol.includes('USDE') ||
                       upperSymbol.includes('USD0');

      if (!isStable) {
        // Non-stablecoin spot asset
        const priceKey = `lighter-spot-${symbol.toLowerCase()}`;
        const price = assetPrices.get(symbol) || 0;

        prices[priceKey] = {
          price,
          symbol,
        };

        positions.push({
          id: `${walletId}-lighter-spot-${symbol}-${account.index}`,
          assetClass: 'crypto' as const,
          type: 'crypto' as const,
          symbol,
          name: `${symbol} (Lighter Spot)`,
          amount: balance,
          accountId: walletId,
          chain: 'lighter',
          protocol: 'Lighter',
          debankPriceKey: priceKey,
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return { positions, prices, accountValue };
  }

  /**
   * Check if a wallet has any Lighter activity
   * Only checks if accounts exist - if they do, we'll fetch full data later
   */
  async hasActivity(walletAddress: string): Promise<boolean> {
    try {
      // Lighter API is case-sensitive — requires EIP-55 checksummed addresses
      const checksummed = toChecksumAddress(walletAddress);
      const accounts = await this.client.getAccountsByL1Address(checksummed);
      if (accounts && accounts.length > 0) {
        // If any account has value or positions, there's activity
        return accounts.some(
          (a) => parseFloat(a.total_asset_value) > 0 || (a.positions && a.positions.length > 0)
        );
      }
      // Fallback to single account lookup
      const account = await this.client.getAccountByAddress(checksummed);
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
