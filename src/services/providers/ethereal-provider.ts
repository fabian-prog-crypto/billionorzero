/**
 * Ethereal Provider
 * Fetches and transforms Ethereal positions into portfolio positions
 */

import { Position } from '@/types';
import { getEtherealApiClient, EtherealSubaccount } from '../api/ethereal-api';

export interface EtherealPositionsResult {
  positions: Position[];
  prices: Record<string, { price: number; symbol: string }>;
  accountValue: number;
  error?: string;
}

export class EtherealProvider {
  private client = getEtherealApiClient();

  /**
   * Fetch all positions from Ethereal for a wallet address
   * Returns perp positions, spot balances, and account value
   */
  async fetchPositions(walletAddress: string, walletId: string): Promise<EtherealPositionsResult> {
    const positions: Position[] = [];
    const prices: Record<string, { price: number; symbol: string }> = {};
    let accountValue = 0;

    try {
      // Get all subaccounts for this wallet
      const subaccounts = await this.client.getSubaccounts(walletAddress);

      if (!subaccounts || subaccounts.length === 0) {
        return { positions: [], prices: {}, accountValue: 0 };
      }

      // Fetch products for price data
      const products = await this.client.getProducts();
      const productPrices = new Map<number, { markPrice: number; symbol: string }>();
      for (const product of products) {
        productPrices.set(product.id, {
          markPrice: parseFloat(product.markPrice) || 0,
          symbol: product.baseAsset,
        });
      }

      // Process each subaccount
      for (const subaccount of subaccounts) {
        const result = await this.processSubaccount(
          subaccount,
          walletAddress,
          walletId,
          productPrices
        );
        positions.push(...result.positions);
        Object.assign(prices, result.prices);
        accountValue += result.accountValue;
      }

      return { positions, prices, accountValue };
    } catch (error) {
      console.error('EtherealProvider: Error fetching positions', error);
      return {
        positions: [],
        prices: {},
        accountValue: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Process a single Ethereal subaccount into positions
   */
  private async processSubaccount(
    subaccount: EtherealSubaccount,
    walletAddress: string,
    walletId: string,
    productPrices: Map<number, { markPrice: number; symbol: string }>
  ): Promise<EtherealPositionsResult> {
    const positions: Position[] = [];
    const prices: Record<string, { price: number; symbol: string }> = {};
    let accountValue = 0;

    // Fetch positions and balances in parallel
    const [perpPositions, balances] = await Promise.all([
      this.client.getPositions(subaccount.id, true).catch(() => []),
      this.client.getSubaccountBalances(subaccount.id).catch(() => []),
    ]);

    // Process perp positions
    for (const pos of perpPositions) {
      if (pos.isLiquidated) continue;

      const size = parseFloat(pos.size);
      if (size === 0) continue;

      const isShort = pos.side === 'short';
      const absSize = Math.abs(size);
      const symbol = pos.symbol;

      // Extract base asset from symbol (e.g., "ETH-PERP" -> "ETH")
      const baseAsset = symbol.split('-')[0] || symbol;

      // Get price from products or entry price
      const productInfo = productPrices.get(pos.productId);
      const price = productInfo?.markPrice || parseFloat(pos.avgEntryPrice) || 0;
      const priceKey = `ethereal-perp-${baseAsset.toLowerCase()}`;

      prices[priceKey] = {
        price,
        symbol: baseAsset,
      };

      positions.push({
        id: `${walletId}-ethereal-perp-${symbol}-${isShort ? 'short' : 'long'}-${subaccount.id.slice(0, 8)}`,
        type: 'crypto',
        symbol: baseAsset,
        name: `${baseAsset} ${isShort ? 'Short' : 'Long'} (Ethereal)`,
        amount: absSize,
        walletAddress,
        chain: 'ethereal',
        protocol: 'Ethereal',
        debankPriceKey: priceKey,
        isDebt: isShort,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Process balances
    for (const balance of balances) {
      const amount = parseFloat(balance.amount);
      if (amount <= 0) continue;

      const symbol = balance.tokenName;
      const priceKey = `ethereal-spot-${symbol.toLowerCase()}`;

      // USD/USDe/USDC/USDT are stablecoins
      const isStable = ['USD', 'USDE', 'USDC', 'USDT'].includes(symbol.toUpperCase());
      prices[priceKey] = {
        price: isStable ? 1 : 0,
        symbol,
      };

      // Track account value from stables
      if (isStable) {
        accountValue += amount;
      }

      positions.push({
        id: `${walletId}-ethereal-spot-${symbol}-${subaccount.id.slice(0, 8)}`,
        type: 'crypto',
        symbol,
        name: `${symbol} (Ethereal${isStable ? ' Margin' : ' Spot'})`,
        amount,
        walletAddress,
        chain: 'ethereal',
        protocol: 'Ethereal',
        debankPriceKey: priceKey,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return { positions, prices, accountValue };
  }

  /**
   * Check if a wallet has any Ethereal activity
   * Only checks if subaccounts exist - if they do, we'll fetch full data later
   */
  async hasActivity(walletAddress: string): Promise<boolean> {
    try {
      const subaccounts = await this.client.getSubaccounts(walletAddress);
      // If any subaccounts exist, assume there might be activity
      return subaccounts && subaccounts.length > 0;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let instance: EtherealProvider | null = null;

export function getEtherealProvider(): EtherealProvider {
  if (!instance) {
    instance = new EtherealProvider();
  }
  return instance;
}
