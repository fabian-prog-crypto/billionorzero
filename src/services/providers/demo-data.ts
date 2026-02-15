/**
 * Demo Data Generator
 * Generates consistent demo/mock data for testing without API keys
 */

import { WalletBalance, DefiPosition } from '@/types';

/**
 * Supported blockchain networks
 */
export const SUPPORTED_CHAINS = [
  { id: 'eth', name: 'Ethereum' },
  { id: 'bsc', name: 'BNB Chain' },
  { id: 'matic', name: 'Polygon' },
  { id: 'arb', name: 'Arbitrum' },
  { id: 'op', name: 'Optimism' },
  { id: 'avax', name: 'Avalanche' },
  { id: 'base', name: 'Base' },
  { id: 'sol', name: 'Solana' },
] as const;

/**
 * Generate a seed number from a wallet address for consistent random data
 */
function getSeedFromAddress(address: string): number {
  const seed = address.slice(2, 10);
  return (parseInt(seed, 16) % 100) + 10;
}

/**
 * Generate demo wallet tokens based on address
 */
export function generateDemoWalletTokens(address: string): WalletBalance[] {
  const multiplier = getSeedFromAddress(address);

  return [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      amount: (2.5 * multiplier) / 50,
      price: 3200,
      value: ((2.5 * multiplier) / 50) * 3200,
      chain: 'eth',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      amount: (5000 * multiplier) / 30,
      price: 1,
      value: (5000 * multiplier) / 30,
      chain: 'eth',
    },
    {
      symbol: 'WBTC',
      name: 'Wrapped Bitcoin',
      amount: (0.15 * multiplier) / 50,
      price: 95000,
      value: ((0.15 * multiplier) / 50) * 95000,
      chain: 'eth',
    },
    {
      symbol: 'AAVE',
      name: 'Aave',
      amount: (25 * multiplier) / 30,
      price: 280,
      value: ((25 * multiplier) / 30) * 280,
      chain: 'eth',
    },
    {
      symbol: 'UNI',
      name: 'Uniswap',
      amount: (100 * multiplier) / 25,
      price: 12.5,
      value: ((100 * multiplier) / 25) * 12.5,
      chain: 'eth',
    },
  ].sort((a, b) => b.value - a.value);
}

/**
 * Generate demo DeFi positions based on address
 */
export function generateDemoDefiPositions(address: string): DefiPosition[] {
  const multiplier = getSeedFromAddress(address);

  return [
    {
      protocol: 'Aave V3',
      chain: 'eth',
      type: 'Lending',
      value: (15000 * multiplier) / 50,
      tokens: [
        { symbol: 'USDC', amount: (15000 * multiplier) / 50, price: 1 },
      ],
    },
    {
      protocol: 'Lido',
      chain: 'eth',
      type: 'Staking',
      value: (5000 * multiplier) / 30,
      tokens: [
        { symbol: 'stETH', amount: (1.5 * multiplier) / 30, price: 3200 },
      ],
    },
    {
      protocol: 'Uniswap V3',
      chain: 'eth',
      type: 'Liquidity Pool',
      value: (8000 * multiplier) / 40,
      tokens: [
        { symbol: 'ETH', amount: 1.2, price: 3200 },
        { symbol: 'USDC', amount: 4000, price: 1 },
      ],
    },
  ];
}

/**
 * Calculate total balance from demo data
 */
export function getDemoTotalBalance(address: string): number {
  const tokens = generateDemoWalletTokens(address);
  const positions = generateDemoDefiPositions(address);

  const tokenValue = tokens.reduce((sum, t) => sum + t.value, 0);
  const positionValue = positions.reduce((sum, p) => sum + p.value, 0);

  return tokenValue + positionValue;
}

/**
 * Demo stock prices for common tickers
 */
export const DEMO_STOCK_PRICES: Record<string, { price: number; change: number; changePercent: number }> = {
  aapl: { price: 178.50, change: 2.35, changePercent: 1.33 },
  googl: { price: 141.80, change: -0.92, changePercent: -0.64 },
  msft: { price: 378.90, change: 4.20, changePercent: 1.12 },
  amzn: { price: 178.25, change: 1.85, changePercent: 1.05 },
  tsla: { price: 248.50, change: -3.20, changePercent: -1.27 },
  nvda: { price: 875.30, change: 12.45, changePercent: 1.44 },
  meta: { price: 505.75, change: 8.30, changePercent: 1.67 },
  nflx: { price: 485.20, change: 5.60, changePercent: 1.17 },
  amd: { price: 142.30, change: 3.15, changePercent: 2.26 },
  intc: { price: 31.45, change: -0.28, changePercent: -0.88 },
};

/**
 * Demo crypto prices for common tokens
 */
export const DEMO_CRYPTO_PRICES: Record<string, { price: number; change24h: number }> = {
  bitcoin: { price: 95000, change24h: 2.5 },
  ethereum: { price: 3200, change24h: 1.8 },
  'usd-coin': { price: 1, change24h: 0.01 },
  tether: { price: 1, change24h: 0.02 },
  'tether-gold': { price: 2300, change24h: 0.6 },
  'pax-gold': { price: 2300, change24h: 0.6 },
  'wrapped-bitcoin': { price: 95000, change24h: 2.5 },
  weth: { price: 3200, change24h: 1.8 },
  'staked-ether': { price: 3200, change24h: 1.8 },
  'wrapped-steth': { price: 3600, change24h: 1.9 },
  aave: { price: 280, change24h: 3.2 },
  uniswap: { price: 12.5, change24h: -1.5 },
  solana: { price: 180, change24h: 4.2 },
  cardano: { price: 0.65, change24h: 2.1 },
  'matic-network': { price: 0.85, change24h: 1.9 },
  chainlink: { price: 18.50, change24h: 2.8 },
  dai: { price: 1, change24h: 0.01 },
  binancecoin: { price: 580, change24h: 1.2 },
  ripple: { price: 2.15, change24h: 3.5 },
  dogecoin: { price: 0.32, change24h: 5.1 },
  polkadot: { price: 7.80, change24h: 2.3 },
  'avalanche-2': { price: 38.50, change24h: 3.8 },
  arbitrum: { price: 1.85, change24h: 2.1 },
  optimism: { price: 2.40, change24h: 1.7 },
  maker: { price: 1850, change24h: 1.4 },
  'curve-dao-token': { price: 0.95, change24h: 2.2 },
  'lido-dao': { price: 2.80, change24h: 3.1 },
  cosmos: { price: 9.50, change24h: 2.6 },
  litecoin: { price: 105, change24h: 1.9 },
  pepe: { price: 0.000018, change24h: 8.5 },
  'shiba-inu': { price: 0.000024, change24h: 4.2 },
};
