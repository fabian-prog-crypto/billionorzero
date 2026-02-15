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
    case 'query_currency_exposure': {
      const currency = String(data.currency || 'Currency');
      return {
        format: 'metric',
        title: `${currency} Exposure`,
        value: formatMaybeCurrency(data.value),
        subtitle: isNumber(data.percentage) ? `${formatPercent(data.percentage, 1)} of net worth` : undefined,
      };
    }
    case 'query_stablecoin_exposure': {
      return {
        format: 'metric',
        title: 'Stablecoin Exposure',
        value: formatMaybeCurrency(data.value),
        subtitle: isNumber(data.percentage) ? `${formatPercent(data.percentage, 1)} of net worth` : undefined,
      };
    }
    case 'query_cash_vs_invested': {
      return {
        format: 'table',
        title: 'Cash vs Invested',
        rows: [
          row('Cash', [formatMaybeCurrency(data.cash), formatMaybePercent(data.cashPercent)]),
          row('Invested', [formatMaybeCurrency(data.invested), formatMaybePercent(data.investedPercent)]),
          row('Net Worth', [formatMaybeCurrency(data.netWorth)]),
        ],
      };
    }
    case 'query_top_gainers_24h':
    case 'query_top_losers_24h': {
      const rows = Array.isArray(result)
        ? result.map((item) => {
            const r = item as Record<string, unknown>;
            const change = isNumber(r.changePercent24h) ? r.changePercent24h : null;
            return row(
              String(r.symbol || '—'),
              [
                formatMaybeCurrency(r.value),
                formatMaybeCurrency(r.change24h),
                isNumber(r.changePercent24h) ? formatPercent(r.changePercent24h) : '—',
              ],
              change == null ? undefined : change < 0 ? 'negative' : 'positive'
            );
          })
        : [];
      return {
        format: 'table',
        title: tool === 'query_top_gainers_24h' ? 'Top Gainers (24h)' : 'Top Losers (24h)',
        columns: ['Value', 'Δ$', 'Δ%'],
        rows,
      };
    }
    case 'query_missing_prices': {
      const rows = Array.isArray(result)
        ? result.map((item) => {
            const r = item as Record<string, unknown>;
            return row(
              String(r.symbol || '—'),
              [formatMaybeNumber(r.amount), formatMaybeCurrency(r.price)]
            );
          })
        : [];
      return {
        format: 'table',
        title: 'Missing Prices',
        columns: ['Amount', 'Price'],
        rows,
      };
    }
    case 'query_largest_debts': {
      const rows = Array.isArray(result)
        ? result.map((item) => {
            const r = item as Record<string, unknown>;
            return row(
              String(r.symbol || '—'),
              [formatMaybeCurrency(r.value), formatGenericValue(r.protocol)]
            );
          })
        : [];
      return {
        format: 'table',
        title: 'Largest Debts',
        columns: ['Value', 'Protocol'],
        rows,
      };
    }
    case 'query_exposure_by_chain': {
      const rows = Array.isArray(result)
        ? result.map((item) => {
            const r = item as Record<string, unknown>;
            return row(
              String(r.chain || '—'),
              [formatMaybeCurrency(r.value), formatMaybePercent(r.percentage)]
            );
          })
        : [];
      return {
        format: 'table',
        title: 'Exposure by Chain',
        columns: ['Value', 'Percent'],
        rows,
      };
    }
    case 'query_exposure_by_custody': {
      const rows = Array.isArray(result)
        ? result.map((item) => {
            const r = item as Record<string, unknown>;
            return row(
              String(r.custody || '—'),
              [formatMaybeCurrency(r.value), formatMaybePercent(r.percentage)]
            );
          })
        : [];
      return {
        format: 'table',
        title: 'Exposure by Custody',
        columns: ['Value', 'Percent'],
        rows,
      };
    }
    case 'query_allocation_by_category': {
      const rows = Array.isArray(result)
        ? result.map((item) => {
            const r = item as Record<string, unknown>;
            return row(
              String(r.category || '—'),
              [formatMaybeCurrency(r.value), formatMaybePercent(r.percentage)]
            );
          })
        : [];
      return {
        format: 'table',
        title: 'Allocation by Category',
        columns: ['Value', 'Percent'],
        rows,
      };
    }
    case 'query_perps_utilization': {
      return {
        format: 'table',
        title: 'Perps Utilization',
        rows: [
          row('Collateral', [formatMaybeCurrency(data.collateral)]),
          row('Margin Used', [formatMaybeCurrency(data.marginUsed)]),
          row('Available', [formatMaybeCurrency(data.marginAvailable)]),
          row('Utilization', [formatMaybePercent(data.utilizationRate)]),
          row('Gross Notional', [formatMaybeCurrency(data.grossNotional)]),
          row('Net Notional', [formatMaybeCurrency(data.netNotional)]),
        ],
      };
    }
    case 'query_unrealized_pnl': {
      const rows = Array.isArray(result)
        ? result.map((item) => {
            const r = item as Record<string, unknown>;
            const pnl = isNumber(r.pnl) ? r.pnl : null;
            return row(
              String(r.symbol || '—'),
              [
                formatMaybeCurrency(r.pnl),
                isNumber(r.pnlPercent) ? formatPercent(r.pnlPercent) : '—',
                formatMaybeCurrency(r.value),
              ],
              pnl == null ? undefined : pnl < 0 ? 'negative' : 'positive'
            );
          })
        : [];
      return {
        format: 'table',
        title: 'Unrealized PnL',
        columns: ['PnL', 'PnL %', 'Value'],
        rows,
      };
    }
    case 'query_risk_concentration': {
      return {
        format: 'table',
        title: 'Risk Concentration',
        rows: [
          row('Top 1', [formatMaybePercent(data.top1Percentage)]),
          row('Top 5', [formatMaybePercent(data.top5Percentage)]),
          row('Top 10', [formatMaybePercent(data.top10Percentage)]),
          row('HHI', [formatMaybeNumber(data.herfindahlIndex)]),
          row('Positions', [formatMaybeNumber(data.positionCount)]),
          row('Assets', [formatMaybeNumber(data.assetCount)]),
        ],
      };
    }
    case 'query_cash_breakdown': {
      const rows = Array.isArray(result)
        ? result.map((item) => {
            const r = item as Record<string, unknown>;
            return row(
              String(r.currency || '—'),
              [formatMaybeCurrency(r.value), formatMaybePercent(r.percentage)]
            );
          })
        : [];
      return {
        format: 'table',
        title: 'Cash Breakdown',
        columns: ['Value', 'Percent'],
        rows,
      };
    }
    case 'query_equities_exposure': {
      return {
        format: 'metric',
        title: 'Equities Exposure',
        value: formatMaybeCurrency(data.equityValue),
        subtitle: isNumber(data.percentage) ? `${formatPercent(data.percentage, 1)} of net worth` : undefined,
      };
    }
    case 'query_account_health': {
      const rows = Array.isArray(result)
        ? result.map((item) => {
            const r = item as Record<string, unknown>;
            return row(
              String(r.name || '—'),
              [formatMaybeCurrency(r.netValue), formatMaybeCurrency(r.debtValue), formatMaybeNumber(r.positions)]
            );
          })
        : [];
      return {
        format: 'table',
        title: 'Account Health',
        columns: ['Net', 'Debt', 'Positions'],
        rows,
      };
    }
    case 'query_rebalance_targets': {
      const rows = Array.isArray(data.targets)
        ? (data.targets as Array<Record<string, unknown>>).map((item) => row(
            String(item.target || '—'),
            [
              isNumber(item.percent) ? `${item.percent.toFixed(1)}%` : '—',
              formatMaybeCurrency(item.currentValue),
              formatMaybeCurrency(item.targetValue),
              formatMaybeCurrency(item.delta),
            ]
          ))
        : [];
      return {
        format: 'table',
        title: 'Rebalance Targets',
        subtitle: isNumber(data.totalTargetPercent) ? `Target total ${data.totalTargetPercent.toFixed(1)}%` : undefined,
        columns: ['Target %', 'Current', 'Target', 'Delta'],
        rows,
      };
    }
    case 'query_largest_price_overrides': {
      const rows = Array.isArray(result)
        ? result.map((item) => {
            const r = item as Record<string, unknown>;
            return row(
              String(r.symbol || '—'),
              [
                formatMaybeCurrency(r.customPrice),
                formatMaybeCurrency(r.marketPrice),
                isNumber(r.deltaPercent) ? formatPercent(r.deltaPercent) : '—',
              ]
            );
          })
        : [];
      return {
        format: 'table',
        title: 'Price Overrides',
        columns: ['Custom', 'Market', 'Δ%'],
        rows,
      };
    }
    case 'query_recent_changes': {
      return {
        format: 'table',
        title: 'Recent Changes',
        subtitle: data.from && data.to ? `${String(data.from)} → ${String(data.to)}` : undefined,
        rows: [
          row('Total', [formatMaybeCurrency(data.totalValue)]),
          row('Crypto', [formatMaybeCurrency(data.cryptoValue)]),
          row('Equities', [formatMaybeCurrency(data.equityValue)]),
          row('Metals', [formatMaybeCurrency(data.metalsValue)]),
          row('Cash', [formatMaybeCurrency(data.cashValue)]),
          row('Other', [formatMaybeCurrency(data.otherValue)]),
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
