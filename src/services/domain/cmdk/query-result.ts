import type { QueryResult, QueryRow } from '../command-types';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils';

function row(label: string, values: string[], color?: QueryRow['color']): QueryRow {
  return { label, values, color };
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatMaybePercent(value: unknown): string {
  return isNumber(value) ? formatPercent(value) : '—';
}

function formatMaybeCurrency(value: unknown): string {
  return isNumber(value) ? formatCurrency(value) : '—';
}

function formatMaybeNumber(value: unknown): string {
  return isNumber(value) ? formatNumber(value) : '—';
}

function formatGenericValue(value: unknown): string {
  if (isNumber(value)) return formatNumber(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value == null) return '—';
  return String(value);
}

function toTitleCase(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function mapArrayResult(title: string, rowsData: Array<Record<string, unknown>>): QueryResult {
  if (rowsData.length === 0) {
    return { format: 'table', title, rows: [] };
  }
  const columns = Object.keys(rowsData[0]).map(toTitleCase);
  const keys = Object.keys(rowsData[0]);
  const rows = rowsData.map((item) => row(
    String(item[keys[0]] ?? '—'),
    keys.slice(1).map((key) => formatGenericValue(item[key]))
  ));
  return { format: 'table', title, columns, rows };
}

function mapObjectResult(title: string, data: Record<string, unknown>): QueryResult {
  const entries = Object.entries(data).filter(([key]) => key !== 'error');
  const rows = entries.map(([key, value]) => row(toTitleCase(key), [formatGenericValue(value)]));
  return { format: 'table', title, rows };
}

export function mapQueryToolResult(tool: string, result: unknown): QueryResult | null {
  if (!result || typeof result !== 'object') return null;
  const data = result as Record<string, unknown>;

  if (typeof data.error === 'string') {
    return {
      format: 'metric',
      title: 'Query Error',
      value: data.error,
    };
  }

  switch (tool) {
    case 'query_net_worth': {
      return {
        format: 'metric',
        title: 'Net Worth',
        value: formatMaybeCurrency(data.netWorth),
        subtitle: `24h ${formatMaybeCurrency(data.change24h)} (${formatMaybePercent(data.changePercent24h)})`,
      };
    }
    case 'query_portfolio_summary': {
      return {
        format: 'table',
        title: 'Portfolio Summary',
        rows: [
          row('Net Worth', [formatMaybeCurrency(data.netWorth)]),
          row('Gross Assets', [formatMaybeCurrency(data.grossAssets)]),
          row('Total Debts', [formatMaybeCurrency(data.totalDebts)]),
          row('Crypto', [formatMaybeCurrency(data.cryptoValue)]),
          row('Equity', [formatMaybeCurrency(data.equityValue)]),
          row('Cash', [formatMaybeCurrency(data.cashValue)]),
          row('Other', [formatMaybeCurrency(data.otherValue)]),
          row('24h Change', [formatMaybeCurrency(data.change24h), formatMaybePercent(data.changePercent24h)], (isNumber(data.change24h) && data.change24h < 0) ? 'negative' : 'positive'),
          row('Positions', [formatMaybeNumber(data.positionCount)]),
          row('Assets', [formatMaybeNumber(data.assetCount)]),
        ],
      };
    }
    case 'query_top_positions': {
      const rows = Array.isArray(result)
        ? result.map((item) => {
            const r = item as Record<string, unknown>;
            const change = isNumber(r.change24h) ? r.change24h : null;
            return row(
              String(r.symbol || '—'),
              [
                formatMaybeCurrency(r.value),
                isNumber(r.allocation) ? formatPercent(r.allocation) : '—',
                isNumber(r.change24h) ? formatPercent(r.change24h) : '—',
              ],
              change == null ? undefined : change < 0 ? 'negative' : 'positive'
            );
          })
        : [];
      return {
        format: 'table',
        title: 'Top Positions',
        columns: ['Value', 'Alloc', '24h'],
        rows,
      };
    }
    case 'query_position_details': {
      return {
        format: 'table',
        title: String(data.symbol || 'Position'),
        rows: [
          row('Total Amount', [formatMaybeNumber(data.totalAmount)]),
          row('Total Value', [formatMaybeCurrency(data.totalValue)]),
          row('Price', [formatMaybeCurrency(data.price)]),
          row('Positions', [formatMaybeNumber(data.positions)]),
        ],
      };
    }
    case 'query_positions_by_type': {
      const rows = Array.isArray(result)
        ? result.map((item) => {
            const r = item as Record<string, unknown>;
            return row(
              String(r.symbol || '—'),
              [formatMaybeNumber(r.amount), formatMaybeCurrency(r.value)]
            );
          })
        : [];
      return {
        format: 'table',
        title: 'Positions',
        columns: ['Amount', 'Value'],
        rows,
      };
    }
    case 'query_exposure':
    case 'query_crypto_exposure': {
      return {
        format: 'table',
        title: tool === 'query_crypto_exposure' ? 'Crypto Exposure' : 'Exposure',
        rows: [
          row('Long', [formatMaybeCurrency(data.longExposure)]),
          row('Short', [formatMaybeCurrency(data.shortExposure)]),
          row('Gross', [formatMaybeCurrency(data.grossExposure)]),
          row('Net', [formatMaybeCurrency(data.netExposure)]),
          row('Leverage', [formatMaybeNumber(data.leverage)]),
          row('Cash', [formatMaybeCurrency(data.cashPosition)]),
        ],
      };
    }
    case 'query_performance': {
      return {
        format: 'table',
        title: 'Performance',
        rows: [
          row('Total Return', [formatMaybePercent(data.totalReturn), formatMaybeCurrency(data.totalReturnAbsolute)]),
          row('CAGR', [formatMaybePercent(data.cagr)]),
          row('Sharpe', [formatMaybeNumber(data.sharpeRatio)]),
          row('Volatility', [formatMaybePercent(data.volatility)]),
          row('Max Drawdown', [formatMaybePercent(data.maxDrawdown), formatMaybeCurrency(data.maxDrawdownAbsolute)]),
          row('Current Drawdown', [formatMaybePercent(data.currentDrawdown)]),
          row('Period Days', [formatMaybeNumber(data.periodDays)]),
        ],
      };
    }
    case 'query_24h_change': {
      return {
        format: 'metric',
        title: '24h Change',
        value: formatMaybeCurrency(data.change24h),
        subtitle: formatMaybePercent(data.changePercent24h),
      };
    }
    case 'query_category_value': {
      const categoryLabel = toTitleCase(String(data.type || 'Category'));
      return {
        format: 'metric',
        title: `${categoryLabel} Value`,
        value: formatMaybeCurrency(data.value),
        subtitle: isNumber(data.allocation) ? `Alloc ${formatPercent(data.allocation)}` : undefined,
      };
    }
    case 'query_position_count': {
      return {
        format: 'metric',
        title: 'Positions',
        value: formatMaybeNumber(data.count),
      };
    }
    case 'query_debt_summary': {
      const rows = Array.isArray(data.positions)
        ? (data.positions as Array<Record<string, unknown>>).map((item) => row(
            String(item.symbol || '—'),
            [formatMaybeCurrency(item.value)]
          ))
        : [];
      return {
        format: 'table',
        title: 'Debt Summary',
        subtitle: `Total ${formatMaybeCurrency(data.totalDebt)}`,
        rows,
      };
    }
    case 'query_leverage': {
      return {
        format: 'metric',
        title: 'Leverage',
        value: formatMaybeNumber(data.leverage),
      };
    }
    case 'query_perps_summary': {
      const rows = Array.isArray(data.exchanges)
        ? (data.exchanges as Array<Record<string, unknown>>).map((item) => row(
            String(item.exchange || item.name || '—'),
            [formatMaybeCurrency(item.notional), formatMaybeCurrency(item.pnl)]
          ))
        : [];
      return {
        format: 'table',
        title: 'Perps Summary',
        rows,
      };
    }
    case 'query_risk_profile': {
      return {
        format: 'table',
        title: 'Risk Profile',
        rows: Object.entries(data)
          .filter(([key]) => key !== 'error')
          .map(([key, value]) => row(
            key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
            [isNumber(value) ? formatMaybeNumber(value) : String(value ?? '—')]
          )),
      };
    }
    default:
      if (tool.startsWith('query_')) {
        if (Array.isArray(result)) {
          const rowsData = (result as Array<unknown>).filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
          return mapArrayResult(toTitleCase(tool.replace(/^query_/, '')), rowsData);
        }
        return mapObjectResult(toTitleCase(tool.replace(/^query_/, '')), data);
      }
      return null;
  }
}
