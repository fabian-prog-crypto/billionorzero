import { describe, it, expect } from 'vitest';
import { mapQueryToolResult } from './query-result';

describe('mapQueryToolResult', () => {
  it('maps net worth metric', () => {
    const result = mapQueryToolResult('query_net_worth', {
      netWorth: 100000,
      change24h: 500,
      changePercent24h: 0.5,
    });
    expect(result?.format).toBe('metric');
    expect(result?.title).toBe('Net Worth');
  });

  it('maps top positions to table', () => {
    const result = mapQueryToolResult('query_top_positions', [
      { symbol: 'BTC', value: 1000, allocation: 50, change24h: 1 },
    ]);
    expect(result?.format).toBe('table');
    expect(result?.title).toBe('Top Positions');
  });

  it('maps error payload', () => {
    const result = mapQueryToolResult('query_position_details', { error: 'No position found' });
    expect(result?.title).toBe('Query Error');
  });

  it('maps currency exposure metric', () => {
    const result = mapQueryToolResult('query_currency_exposure', {
      currency: 'USD',
      value: 25000,
      percentage: 25,
    });
    expect(result?.format).toBe('metric');
    expect(result?.title).toBe('USD Exposure');
  });

  it('maps top gainers table', () => {
    const result = mapQueryToolResult('query_top_gainers_24h', [
      { symbol: 'BTC', value: 50000, change24h: 1000, changePercent24h: 2 },
    ]);
    expect(result?.format).toBe('table');
    expect(result?.title).toBe('Top Gainers (24h)');
  });
});
