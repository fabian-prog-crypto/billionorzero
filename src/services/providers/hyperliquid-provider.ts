/**
 * Hyperliquid Provider
 * Fetches and transforms Hyperliquid positions into portfolio positions
 */

import { Position } from '@/types';
import { getCategoryService } from '@/services/domain/category-service';
import {
  getHyperliquidApiClient,
  HyperliquidClearinghouseState,
  HyperliquidSpotState,
} from '../api/hyperliquid-api';

export interface HyperliquidPositionsResult {
  positions: Position[];
  prices: Record<string, { price: number; symbol: string }>;
  accountValue: number;
  error?: string;
}

export class HyperliquidProvider {
  private client = getHyperliquidApiClient();

  /**
   * Fetch all positions from Hyperliquid for a wallet address
   * Returns perp positions, spot balances, and account value
   */
  async fetchPositions(walletAddress: string, walletId: string): Promise<HyperliquidPositionsResult> {
    const positions: Position[] = [];
    const prices: Record<string, { price: number; symbol: string }> = {};
    let accountValue = 0;

    try {
      // Fetch perp state, spot state, and prices in parallel
      const [perpState, spotState, allMids] = await Promise.all([
        this.client.getClearinghouseState(walletAddress).catch(() => null),
        this.client.getSpotClearinghouseState(walletAddress).catch(() => null),
        this.client.getAllMids().catch(() => ({})),
      ]);

      // Process perp positions
      if (perpState) {
        accountValue = parseFloat(perpState.marginSummary.accountValue) || 0;
        const perpPositions = this.processPerpPositions(perpState, walletAddress, walletId, allMids);
        positions.push(...perpPositions.positions);
        Object.assign(prices, perpPositions.prices);
      }

      // Process spot balances
      if (spotState) {
        const spotPositions = this.processSpotBalances(spotState, walletAddress, walletId, allMids);
        positions.push(...spotPositions.positions);
        Object.assign(prices, spotPositions.prices);
      }

      return { positions, prices, accountValue };
    } catch (error) {
      console.error('HyperliquidProvider: Error fetching positions', error);
      return {
        positions: [],
        prices: {},
        accountValue: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Process perpetual positions from clearinghouse state
   */
  private processPerpPositions(
    state: HyperliquidClearinghouseState,
    walletAddress: string,
    walletId: string,
    allMids: Record<string, string>
  ): { positions: Position[]; prices: Record<string, { price: number; symbol: string }> } {
    const positions: Position[] = [];
    const prices: Record<string, { price: number; symbol: string }> = {};
    const categoryService = getCategoryService();

    for (const assetPos of state.assetPositions) {
      const pos = assetPos.position;
      const size = parseFloat(pos.szi);

      // Skip zero positions
      if (size === 0) continue;

      const coin = pos.coin;
      const isShort = size < 0;
      const absSize = Math.abs(size);

      // Get current price from allMids
      const midPrice = parseFloat(allMids[coin] || '0');
      const priceKey = `hyperliquid-perp-${coin.toLowerCase()}`;

      prices[priceKey] = {
        price: midPrice,
        symbol: coin,
      };

      positions.push({
        id: `${walletId}-hyperliquid-perp-${coin}-${isShort ? 'short' : 'long'}`,
        assetClass: categoryService.getAssetClass(coin, 'crypto'),
        type: 'crypto' as const,
        symbol: coin,
        name: `${coin} ${isShort ? 'Short' : 'Long'} (Hyperliquid)`,
        amount: absSize,
        accountId: walletId,
        chain: 'hyperliquid',
        protocol: 'Hyperliquid',
        debankPriceKey: priceKey,
        // Short positions are represented as negative exposure
        // But for our model, we track them as positive amounts with context in the name
        isDebt: isShort, // Shorts are like debt - you owe the asset
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Add the margin/collateral as a USDC position based on account value
    // accountValue = total equity (deposited USDC + unrealized PnL)
    // This represents the actual collateral value on the exchange
    const accountValue = parseFloat(state.marginSummary.accountValue) || 0;
    if (accountValue > 0) {
      const priceKey = 'hyperliquid-usdc';
      prices[priceKey] = { price: 1, symbol: 'USDC' };

      positions.push({
        id: `${walletId}-hyperliquid-margin-usdc`,
        assetClass: categoryService.getAssetClass('USDC', 'crypto'),
        type: 'crypto' as const,
        symbol: 'USDC',
        name: 'USDC Margin (Hyperliquid)',
        amount: accountValue,
        accountId: walletId,
        chain: 'hyperliquid',
        protocol: 'Hyperliquid',
        debankPriceKey: priceKey,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return { positions, prices };
  }

  /**
   * Process spot token balances
   */
  private processSpotBalances(
    state: HyperliquidSpotState,
    walletAddress: string,
    walletId: string,
    allMids: Record<string, string>
  ): { positions: Position[]; prices: Record<string, { price: number; symbol: string }> } {
    const positions: Position[] = [];
    const prices: Record<string, { price: number; symbol: string }> = {};
    const categoryService = getCategoryService();

    for (const balance of state.balances) {
      const total = parseFloat(balance.total);
      if (total <= 0) continue;

      const coin = balance.coin;
      const upperCoin = coin.toUpperCase();

      // Check if it's a stablecoin - include all USD variants
      // USDC, USDT, USDe, sUSDe, DAI, FRAX, etc.
      const isStable = upperCoin === 'USDC' ||
                       upperCoin === 'USDT' ||
                       upperCoin === 'DAI' ||
                       upperCoin === 'FRAX' ||
                       upperCoin.includes('USDE') ||  // USDe, sUSDe, wUSDe
                       upperCoin.includes('USD0');    // USD0, USD0++

      // Get price - for stables it's $1, for others check allMids
      let price = 1;
      if (!isStable) {
        // For spot tokens, the mid price might be in format "TOKEN/USDC"
        const spotMid = allMids[`${coin}/USDC`] || allMids[coin];
        if (spotMid) {
          price = parseFloat(spotMid);
        }
      }

      const priceKey = `hyperliquid-spot-${coin.toLowerCase()}`;
      prices[priceKey] = { price, symbol: coin };

      positions.push({
        id: `${walletId}-hyperliquid-spot-${coin}`,
        assetClass: categoryService.getAssetClass(coin, 'crypto'),
        type: 'crypto' as const,
        symbol: coin,
        name: `${coin} (Hyperliquid${isStable ? ' Spot Margin' : ' Spot'})`,
        amount: total,
        accountId: walletId,
        chain: 'hyperliquid',
        protocol: 'Hyperliquid',
        debankPriceKey: priceKey,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return { positions, prices };
  }

  /**
   * Check if a wallet has any Hyperliquid activity
   * Only checks perp state first (single API call) since accountValue includes all value
   */
  async hasActivity(walletAddress: string): Promise<boolean> {
    try {
      // Only fetch perp state - accountValue includes spot balances too
      const perpState = await this.client.getClearinghouseState(walletAddress).catch(() => null);
      if (!perpState) return false;

      // Check if there's any value or positions
      const hasValue = parseFloat(perpState.marginSummary.accountValue) > 0;
      const hasPerps = perpState.assetPositions.length > 0;

      return hasValue || hasPerps;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let instance: HyperliquidProvider | null = null;

export function getHyperliquidProvider(): HyperliquidProvider {
  if (!instance) {
    instance = new HyperliquidProvider();
  }
  return instance;
}
