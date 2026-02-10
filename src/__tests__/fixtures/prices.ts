import type { PriceData } from '@/types'

export function makePrice(overrides: Partial<PriceData> = {}): PriceData {
  return {
    symbol: 'BTC',
    price: 50000,
    change24h: 500,
    changePercent24h: 1.0,
    lastUpdated: new Date().toISOString(),
    ...overrides,
  }
}

export function makePriceMap(entries: Record<string, number>): Record<string, PriceData> {
  const map: Record<string, PriceData> = {}
  for (const [symbol, price] of Object.entries(entries)) {
    map[symbol.toLowerCase()] = makePrice({
      symbol: symbol.toUpperCase(),
      price,
      change24h: price * 0.01,
      changePercent24h: 1.0,
    })
  }
  return map
}

export function makeBasicPrices(): Record<string, PriceData> {
  return makePriceMap({
    btc: 50000,
    eth: 3000,
    sol: 100,
    usdc: 1,
    usdt: 1,
    aapl: 180,
    googl: 140,
  })
}
