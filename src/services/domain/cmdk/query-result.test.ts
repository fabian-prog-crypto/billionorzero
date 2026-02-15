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
});
