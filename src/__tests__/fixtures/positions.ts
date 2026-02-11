import type { Position, AssetWithPrice } from '@/types'

let counter = 0
const nextId = () => `test-pos-${++counter}`

export function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: nextId(),
    assetClass: 'crypto',
    type: 'crypto',
    symbol: 'BTC',
    name: 'Bitcoin',
    amount: 1,
    chain: 'eth',
    addedAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

export function makeCryptoPosition(overrides: Partial<Position> = {}): Position {
  return makePosition({
    assetClass: 'crypto',
    type: 'crypto',
    symbol: 'ETH',
    name: 'Ethereum',
    amount: 10,
    chain: 'eth',
    ...overrides,
  })
}

export function makeDebtPosition(overrides: Partial<Position> = {}): Position {
  return makePosition({
    assetClass: 'crypto',
    type: 'crypto',
    symbol: 'USDC',
    name: 'USD Coin (Debt)',
    amount: 5000,
    isDebt: true,
    protocol: 'Morpho',
    ...overrides,
  })
}

export function makeCashPosition(overrides: Partial<Position> = {}): Position {
  return makePosition({
    assetClass: 'cash',
    type: 'cash',
    symbol: 'CASH_USD_revolut',
    name: 'Revolut (USD)',
    amount: 10000,
    chain: undefined,
    ...overrides,
  })
}

export function makeStockPosition(overrides: Partial<Position> = {}): Position {
  return makePosition({
    assetClass: 'equity',
    type: 'stock',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    amount: 50,
    equityType: 'stock',
    chain: undefined,
    ...overrides,
  })
}

export function makePerpPosition(overrides: Partial<Position> = {}): Position {
  return makePosition({
    assetClass: 'crypto',
    type: 'crypto',
    symbol: 'BTC',
    name: 'BTC-PERP Long',
    amount: 1,
    protocol: 'Hyperliquid',
    ...overrides,
  })
}

export function makeAssetWithPrice(overrides: Partial<AssetWithPrice> = {}): AssetWithPrice {
  return {
    id: nextId(),
    assetClass: 'crypto',
    type: 'crypto',
    symbol: 'BTC',
    name: 'Bitcoin',
    amount: 1,
    chain: 'eth',
    addedAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    currentPrice: 50000,
    value: 50000,
    change24h: 500,
    changePercent24h: 1.0,
    allocation: 50,
    ...overrides,
  }
}

export function resetPositionCounter() {
  counter = 0
}
