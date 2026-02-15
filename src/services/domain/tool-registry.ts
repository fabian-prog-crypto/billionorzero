/**
 * Tool Registry
 *
 * Single source of truth for all 28 tools in the cmd-k system.
 * Organized by type: mutation (12), query (15), navigation (1).
 */

import type { ToolDefinition, ToolType } from './command-types';

// ─── Mutation Tools (12) ────────────────────────────────────────────────────

const mutationTools: ToolDefinition[] = [
  {
    id: 'buy_position',
    type: 'mutation',
    description: 'Buy a new position or add to existing. When user specifies a dollar amount to spend ("$50k worth"), use totalCost and leave amount empty.',
    fields: [
      { name: 'symbol', type: 'string', required: true, description: 'Ticker symbol (e.g. BTC, AAPL)' },
      { name: 'amount', type: 'number', required: false, description: 'Quantity to buy. Omit when totalCost is provided instead.' },
      { name: 'price', type: 'number', required: false, description: 'Price per unit (use when user says "at $X")' },
      { name: 'totalCost', type: 'number', required: false, description: 'Total dollar amount to spend (use when user says "$Xk worth of", "for $X", or specifies a dollar amount without per-unit price). When set, leave amount empty.' },
      { name: 'date', type: 'string', required: false, description: 'Trade date in YYYY-MM-DD format (default today if omitted).' },
      { name: 'assetType', type: 'string', required: false, description: 'Asset type', enum: ['crypto', 'stock', 'etf', 'manual'] },
      { name: 'name', type: 'string', required: false, description: 'Display name for the asset' },
      { name: 'account', type: 'string', required: false, description: 'Account to associate with' },
    ],
    examples: ['bought 10 AAPL at $185', 'buy 0.5 BTC', 'bought 123 MSFT for 50k', 'bought $50k worth of MSFT'],
  },
  {
    id: 'sell_partial',
    type: 'mutation',
    description: 'Sell part of a position',
    fields: [
      { name: 'symbol', type: 'string', required: true, description: 'Ticker symbol to sell' },
      { name: 'amount', type: 'number', required: false, description: 'Exact quantity to sell' },
      { name: 'percent', type: 'number', required: false, description: 'Percentage of position to sell (0-100)' },
      { name: 'price', type: 'number', required: false, description: 'Sale price per unit' },
      { name: 'date', type: 'string', required: false, description: 'Trade date in YYYY-MM-DD format (default today if omitted).' },
    ],
    examples: ['sell half my ETH', 'sold 5 AAPL at $190', 'sold 50% of GOOG today'],
  },
  {
    id: 'sell_all',
    type: 'mutation',
    description: 'Sell entire position',
    fields: [
      { name: 'symbol', type: 'string', required: true, description: 'Ticker symbol to sell entirely' },
      { name: 'price', type: 'number', required: false, description: 'Sale price per unit' },
      { name: 'date', type: 'string', required: false, description: 'Trade date in YYYY-MM-DD format (default today if omitted).' },
    ],
    examples: ['sell all my DOGE', 'sold all BTC at $70k', 'sold all of GOOG yesterday'],
  },
  {
    id: 'remove_position',
    type: 'mutation',
    description: 'Remove a position without recording a sale',
    fields: [
      { name: 'symbol', type: 'string', required: true, description: 'Ticker symbol to remove' },
    ],
    examples: ['remove DOGE', 'delete my SOL position'],
  },
  {
    id: 'update_position',
    type: 'mutation',
    description: 'Update position details',
    fields: [
      { name: 'symbol', type: 'string', required: true, description: 'Ticker symbol to update' },
      { name: 'amount', type: 'number', required: false, description: 'New amount' },
      { name: 'costBasis', type: 'number', required: false, description: 'New total cost basis' },
      { name: 'date', type: 'string', required: false, description: 'New purchase date (ISO format)' },
    ],
    examples: ['update BTC amount to 0.6', 'edit AAPL cost basis to $9000'],
  },
  {
    id: 'set_price',
    type: 'mutation',
    description: 'Override the price of an asset',
    fields: [
      { name: 'symbol', type: 'string', required: true, description: 'Ticker symbol' },
      { name: 'price', type: 'number', required: true, description: 'Custom price to set' },
    ],
    examples: ['set BTC price to $65000', 'price ETH at $3200'],
  },
  {
    id: 'add_cash',
    type: 'mutation',
    description: 'Add cash to an account',
    fields: [
      { name: 'currency', type: 'string', required: true, description: 'Currency code (e.g. USD, EUR)' },
      { name: 'amount', type: 'number', required: true, description: 'Amount to add' },
      { name: 'account', type: 'string', required: false, description: 'Account name (e.g. Revolut, IBKR)' },
    ],
    examples: ['5000 EUR to Revolut', 'add $10k to IBKR'],
  },
  {
    id: 'add_wallet',
    type: 'mutation',
    description: 'Connect a blockchain wallet',
    fields: [
      { name: 'address', type: 'string', required: true, description: 'Wallet address' },
      { name: 'name', type: 'string', required: false, description: 'Display name for the wallet' },
      { name: 'chains', type: 'string', required: false, description: 'Comma-separated chain list' },
    ],
    examples: ['add wallet 0xabc...', 'connect 0x123 as My ETH Wallet'],
  },
  {
    id: 'remove_wallet',
    type: 'mutation',
    description: 'Remove a connected wallet',
    fields: [
      { name: 'identifier', type: 'string', required: true, description: 'Wallet address or display name' },
    ],
    examples: ['remove wallet 0xabc', 'disconnect My ETH Wallet'],
  },
  {
    id: 'toggle_hide_balances',
    type: 'mutation',
    description: 'Toggle balance visibility',
    fields: [],
    examples: ['hide balances', 'show balances'],
  },
  {
    id: 'toggle_hide_dust',
    type: 'mutation',
    description: 'Toggle dust position hiding',
    fields: [],
    examples: ['hide dust', 'show small positions'],
  },
  {
    id: 'set_risk_free_rate',
    type: 'mutation',
    description: 'Set the risk-free rate for Sharpe ratio',
    fields: [
      { name: 'rate', type: 'number', required: true, description: 'Risk-free rate (e.g. 0.045 for 4.5%)' },
    ],
    examples: ['set risk-free rate to 4.5%', 'risk free rate 0.05'],
  },
];

// ─── Query Tools (34) ───────────────────────────────────────────────────────

const queryTools: ToolDefinition[] = [
  {
    id: 'query_net_worth',
    type: 'query',
    description: 'Get total portfolio net worth',
    fields: [],
    examples: ["what's my net worth?", 'total value'],
  },
  {
    id: 'query_portfolio_summary',
    type: 'query',
    description: 'Get portfolio summary with breakdown',
    fields: [],
    examples: ['portfolio summary', 'show me my portfolio'],
  },
  {
    id: 'query_top_positions',
    type: 'query',
    description: 'Get top positions by value',
    fields: [
      { name: 'count', type: 'number', required: false, description: 'Number of positions to return (default 5)' },
    ],
    examples: ['top 5 positions', 'biggest holdings'],
  },
  {
    id: 'query_position_details',
    type: 'query',
    description: 'Get details for a specific position',
    fields: [
      { name: 'symbol', type: 'string', required: true, description: 'Ticker symbol to look up' },
    ],
    examples: ['how much BTC do I have?', 'AAPL position details'],
  },
  {
    id: 'query_positions_by_type',
    type: 'query',
    description: 'List positions filtered by asset type',
    fields: [
      { name: 'assetType', type: 'string', required: true, description: 'Asset type to filter by', enum: ['crypto', 'stock', 'etf', 'metals', 'cash', 'manual'] },
    ],
    examples: ['show all my stocks', 'list crypto positions'],
  },
  {
    id: 'query_exposure',
    type: 'query',
    description: 'Get portfolio exposure breakdown',
    fields: [],
    examples: ["what's my exposure?", 'show exposure breakdown'],
  },
  {
    id: 'query_crypto_exposure',
    type: 'query',
    description: 'Get crypto-specific exposure',
    fields: [],
    examples: ['crypto exposure', "what's my crypto breakdown?"],
  },
  {
    id: 'query_currency_exposure',
    type: 'query',
    description: 'Get exposure to a specific fiat currency (includes stablecoins)',
    fields: [
      { name: 'currency', type: 'string', required: true, description: 'Currency code (e.g. USD, EUR, GBP)' },
    ],
    examples: ['usd exposure', "what's my % exposure to USD?", 'eur exposure'],
  },
  {
    id: 'query_stablecoin_exposure',
    type: 'query',
    description: 'Get exposure to stablecoins (value and % of net worth)',
    fields: [],
    examples: ['stablecoin exposure', 'how much stablecoins do I have?'],
  },
  {
    id: 'query_cash_vs_invested',
    type: 'query',
    description: 'Compare cash vs invested portion of the portfolio',
    fields: [],
    examples: ['cash vs invested', 'what percent is cash?'],
  },
  {
    id: 'query_top_gainers_24h',
    type: 'query',
    description: 'Top gainers by 24h change',
    fields: [
      { name: 'count', type: 'number', required: false, description: 'Number of positions to return (default 5)' },
    ],
    examples: ['top gainers 24h', 'biggest winners today'],
  },
  {
    id: 'query_top_losers_24h',
    type: 'query',
    description: 'Top losers by 24h change',
    fields: [
      { name: 'count', type: 'number', required: false, description: 'Number of positions to return (default 5)' },
    ],
    examples: ['top losers 24h', 'biggest losers today'],
  },
  {
    id: 'query_missing_prices',
    type: 'query',
    description: 'List positions missing price data',
    fields: [],
    examples: ['positions missing prices', 'unpriced assets'],
  },
  {
    id: 'query_largest_debts',
    type: 'query',
    description: 'Largest debt positions by absolute value',
    fields: [
      { name: 'count', type: 'number', required: false, description: 'Number of positions to return (default 5)' },
    ],
    examples: ['largest debts', 'biggest liabilities'],
  },
  {
    id: 'query_exposure_by_chain',
    type: 'query',
    description: 'Exposure breakdown by chain or exchange',
    fields: [],
    examples: ['exposure by chain', 'chain exposure'],
  },
  {
    id: 'query_exposure_by_custody',
    type: 'query',
    description: 'Exposure breakdown by custody type',
    fields: [],
    examples: ['exposure by custody', 'custody breakdown'],
  },
  {
    id: 'query_allocation_by_category',
    type: 'query',
    description: 'Allocation by major category (cash/crypto/equities/metals/other)',
    fields: [],
    examples: ['allocation by category', 'portfolio allocation'],
  },
  {
    id: 'query_perps_utilization',
    type: 'query',
    description: 'Perps utilization and margin usage',
    fields: [],
    examples: ['perps utilization', 'margin usage'],
  },
  {
    id: 'query_unrealized_pnl',
    type: 'query',
    description: 'Unrealized PnL by position (from cost basis)',
    fields: [
      { name: 'count', type: 'number', required: false, description: 'Number of positions to return (default 10)' },
    ],
    examples: ['unrealized pnl', 'pnl since cost basis'],
  },
  {
    id: 'query_risk_concentration',
    type: 'query',
    description: 'Risk concentration metrics (top positions, HHI)',
    fields: [],
    examples: ['concentration risk', 'top 3 concentration'],
  },
  {
    id: 'query_cash_breakdown',
    type: 'query',
    description: 'Cash breakdown by currency (fiat + stablecoins)',
    fields: [],
    examples: ['cash breakdown', 'cash by currency'],
  },
  {
    id: 'query_equities_exposure',
    type: 'query',
    description: 'Equities exposure as % of net worth',
    fields: [],
    examples: ['equity exposure', 'stocks exposure'],
  },
  {
    id: 'query_account_health',
    type: 'query',
    description: 'Accounts with negative net value or debts',
    fields: [],
    examples: ['account health', 'accounts with debt'],
  },
  {
    id: 'query_rebalance_targets',
    type: 'query',
    description: 'Rebalance to target allocations (categories or symbols)',
    fields: [
      { name: 'targets', type: 'string', required: true, description: 'Targets like "crypto=40, equities=30, cash=30" or "BTC=50, ETH=30, cash=20"' },
    ],
    examples: ['rebalance to crypto=50, equities=30, cash=20', 'target BTC=60, ETH=20, cash=20'],
  },
  {
    id: 'query_largest_price_overrides',
    type: 'query',
    description: 'Show custom price overrides and deltas',
    fields: [
      { name: 'count', type: 'number', required: false, description: 'Number of overrides to return (default 10)' },
    ],
    examples: ['price overrides', 'custom prices'],
  },
  {
    id: 'query_recent_changes',
    type: 'query',
    description: 'Recent changes since last snapshot',
    fields: [],
    examples: ['recent changes', 'change since last snapshot'],
  },
  {
    id: 'query_performance',
    type: 'query',
    description: 'Get performance metrics (Sharpe, CAGR, etc)',
    fields: [],
    examples: ["how's my performance?", 'show Sharpe ratio'],
  },
  {
    id: 'query_24h_change',
    type: 'query',
    description: 'Get 24-hour portfolio change',
    fields: [],
    examples: ['how much did I gain today?', '24h change'],
  },
  {
    id: 'query_category_value',
    type: 'query',
    description: 'Get value for a specific category',
    fields: [
      { name: 'category', type: 'string', required: true, description: 'Category to query', enum: ['crypto', 'stock', 'etf', 'metals', 'cash', 'manual'] },
    ],
    examples: ['how much crypto do I have?', 'total stock value'],
  },
  {
    id: 'query_position_count',
    type: 'query',
    description: 'Count total positions',
    fields: [],
    examples: ['how many positions do I have?', 'position count'],
  },
  {
    id: 'query_debt_summary',
    type: 'query',
    description: 'Summarize debt/borrowed positions',
    fields: [],
    examples: ['what are my debts?', 'show borrowed positions'],
  },
  {
    id: 'query_leverage',
    type: 'query',
    description: 'Calculate portfolio leverage',
    fields: [],
    examples: ["what's my leverage?", 'leverage ratio'],
  },
  {
    id: 'query_perps_summary',
    type: 'query',
    description: 'Summary of perpetual futures positions',
    fields: [],
    examples: ['perp positions', 'show my futures'],
  },
  {
    id: 'query_risk_profile',
    type: 'query',
    description: 'Get risk profile metrics',
    fields: [],
    examples: ['risk profile', 'how risky is my portfolio?'],
  },
];

// ─── Navigation Tool (1) ────────────────────────────────────────────────────

const navigationTools: ToolDefinition[] = [
  {
    id: 'navigate',
    type: 'navigation',
    description: 'Navigate to a page',
    fields: [
      {
        name: 'page',
        type: 'string',
        required: true,
        description: 'Page to navigate to',
        enum: ['dashboard', 'positions', 'crypto', 'equities', 'metals', 'cash', 'exposure', 'performance', 'settings', 'wallets', 'perps', 'other'],
      },
    ],
    examples: ['go to performance', 'open settings', 'show wallets'],
  },
];

// ─── Registry ───────────────────────────────────────────────────────────────

export const TOOL_REGISTRY: ToolDefinition[] = [
  ...mutationTools,
  ...queryTools,
  ...navigationTools,
];

/** Look up a single tool by its id. */
export function getToolById(id: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.id === id);
}

/** Return all tools of a given type. */
export function getToolsByType(type: ToolType): ToolDefinition[] {
  return TOOL_REGISTRY.filter((t) => t.type === type);
}

/**
 * Build a JSON schema suitable for Ollama structured output (legacy format).
 * @deprecated Use toOllamaTools() for native tool calling instead.
 */
export function buildToolSchema(): object {
  const toolIds = TOOL_REGISTRY.map((t) => t.id);

  const argsProperties: Record<string, object> = {};
  const seenFields = new Set<string>();

  for (const tool of TOOL_REGISTRY) {
    for (const field of tool.fields) {
      if (seenFields.has(field.name)) continue;
      seenFields.add(field.name);

      const prop: Record<string, unknown> = {
        type: field.type,
        description: field.description,
      };
      if (field.enum) {
        prop.enum = field.enum;
      }
      argsProperties[field.name] = prop;
    }
  }

  return {
    type: 'object',
    properties: {
      tool: {
        type: 'string',
        enum: toolIds,
        description: 'The tool to invoke',
      },
      args: {
        type: 'object',
        properties: argsProperties,
        additionalProperties: true,
        description: 'Arguments for the selected tool',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence score between 0 and 1',
      },
    },
    required: ['tool', 'args', 'confidence'],
    additionalProperties: false,
  };
}

// ─── Ollama Native Tool Format ───────────────────────────────────────────────

interface OllamaToolFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

interface OllamaTool {
  type: 'function';
  function: OllamaToolFunction;
}

/**
 * Convert the tool registry to Ollama's native tool calling format.
 * This is the correct format for Ollama's `tools` parameter (not `format`).
 *
 * Only includes tools usable server-side (excludes navigation).
 */
export function toOllamaTools(): OllamaTool[] {
  return TOOL_REGISTRY
    .filter((t) => t.type !== 'navigation')
    .map((tool) => {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const field of tool.fields) {
        const prop: Record<string, unknown> = {
          type: field.type,
          description: field.description,
        };
        if (field.enum) {
          prop.enum = field.enum;
        }
        properties[field.name] = prop;
        if (field.required) {
          required.push(field.name);
        }
      }

      return {
        type: 'function' as const,
        function: {
          name: tool.id,
          description: tool.description,
          parameters: {
            type: 'object' as const,
            properties,
            required,
          },
        },
      };
    });
}
