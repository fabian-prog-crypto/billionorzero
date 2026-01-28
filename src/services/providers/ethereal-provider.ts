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
    let hasBalances = false;
    for (const balance of balances) {
      const amount = parseFloat(balance.amount);
      if (amount <= 0) continue;

      hasBalances = true;

      // Determine the actual token symbol from tokenAddress, tokenId, or tokenName
      const rawSymbol = balance.tokenName || '';
      const tokenAddr = (balance.tokenAddress || '').toLowerCase();
      const tokenId = (balance.tokenId || '').toLowerCase();

      // Known token addresses (lowercase for comparison)
      const KNOWN_TOKENS: Record<string, string> = {
        // USDe
        '0x4c9edd5852cd905f086c759e8383e09bff1e68b3': 'USDe', // Ethereum
        '0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34': 'USDe', // Arbitrum
        '0xb6fc4b1bff391e5f6b4a3d2c7bda1fee3524692d': 'USDe', // Ethereal
        // sUSDe
        '0x9d39a5de30e57443bff2a8307a4256c8797a3497': 'sUSDe', // Ethereum
        '0x211cc4dd073734da055fbf44a2b4667d5e5fe5d2': 'sUSDe', // Arbitrum
        // USDC
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC', // Ethereum
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 'USDC', // Arbitrum
        '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC', // Base
        // USDT
        '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT', // Ethereum
        '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 'USDT', // Arbitrum
      };

      // Resolve symbol: address lookup > tokenId pattern > tokenName pattern > raw
      let symbol = KNOWN_TOKENS[tokenAddr];
      if (!symbol) {
        // Check tokenId and tokenName for known patterns
        const lowerRaw = rawSymbol.toLowerCase();
        const combined = `${tokenId} ${lowerRaw}`;
        if (combined.includes('usde') && !combined.includes('susde')) {
          symbol = 'USDe';
        } else if (combined.includes('susde')) {
          symbol = 'sUSDe';
        } else if (combined.includes('usdc')) {
          symbol = 'USDC';
        } else if (combined.includes('usdt')) {
          symbol = 'USDT';
        } else if (rawSymbol.toUpperCase() === 'USD') {
          // Ethereal's primary margin asset is USDe - "USD" likely means USDe
          symbol = 'USDe';
        } else {
          symbol = rawSymbol || 'UNKNOWN';
        }
      }

      console.log(`[Ethereal] Balance: tokenId="${balance.tokenId}", tokenName="${rawSymbol}", addr="${tokenAddr.slice(0, 10)}...", resolved="${symbol}", amount=${amount}`);

      // If still "USD", keep it as "USD" (don't assume USDC)
      // The category service will classify it correctly as a stablecoin
      const priceKey = `ethereal-spot-${symbol.toLowerCase()}`;

      // Check if it's a stablecoin - include all USD variants
      const upperSymbol = symbol.toUpperCase();
      const isStable = upperSymbol === 'USD' ||
                       upperSymbol === 'USDC' ||
                       upperSymbol === 'USDT' ||
                       upperSymbol.includes('USDE') ||  // USDe, sUSDe, wUSDe, etc.
                       upperSymbol.includes('USD0');    // USD0, USD0++
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

    // Fallback: If no balances but there are perp positions, estimate margin
    // from position data (positions require margin to exist)
    if (!hasBalances && perpPositions.length > 0) {
      // Calculate estimated margin from total position notional (assume ~10x leverage typical)
      let totalNotional = 0;
      for (const pos of perpPositions) {
        if (pos.isLiquidated) continue;
        const size = Math.abs(parseFloat(pos.size));
        const price = parseFloat(pos.avgEntryPrice) || 0;
        totalNotional += size * price;
      }

      // Estimate margin as notional / 10 (assuming 10x average leverage)
      const estimatedMargin = totalNotional > 0 ? totalNotional / 10 : 0;

      if (estimatedMargin > 0) {
        const priceKey = 'ethereal-usdc';
        prices[priceKey] = { price: 1, symbol: 'USDC' };
        accountValue = estimatedMargin;

        positions.push({
          id: `${walletId}-ethereal-margin-usdc-${subaccount.id.slice(0, 8)}`,
          type: 'crypto',
          symbol: 'USDC',
          name: 'USDC Margin (Ethereal)',
          amount: estimatedMargin,
          walletAddress,
          chain: 'ethereal',
          protocol: 'Ethereal',
          debankPriceKey: priceKey,
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
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
