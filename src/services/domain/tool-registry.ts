/**
 * Tool Registry
 *
 * Single source of truth for all 29 tools in the cmd-k system.
 * Organized by type: mutation (13), query (15), navigation (1).
 */

import type { ToolDefinition, ToolType } from './command-types';

// ─── Mutation Tools (13) ────────────────────────────────────────────────────

const mutationTools: ToolDefinition[] = [
  {
    id: 'buy_position',
    type: 'mutation',
    description: 'Buy a new position or add to existing',
    fields: [
      { name: 'symbol', type: 'string', required: true, description: 'Ticker symbol (e.g. BTC, AAPL)' },
      { name: 'amount', type: 'number', required: true, description: 'Quantity to buy' },
      { name: 'price', type: 'number', required: false, description: 'Purchase price per unit' },
      { name: 'assetType', type: 'string', required: false, description: 'Asset type', enum: ['crypto', 'stock', 'etf', 'manual'] },
      { name: 'name', type: 'string', required: false, description: 'Display name for the asset' },
      { name: 'account', type: 'string', required: false, description: 'Account to associate with' },
    ],
    examples: ['bought 10 AAPL at $185', 'buy 0.5 BTC'],
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
    ],
    examples: ['sell half my ETH', 'sold 5 AAPL at $190'],
  },
  {
    id: 'sell_all',
    type: 'mutation',
    description: 'Sell entire position',
    fields: [
      { name: 'symbol', type: 'string', required: true, description: 'Ticker symbol to sell entirely' },
      { name: 'price', type: 'number', required: false, description: 'Sale price per unit' },
    ],
    examples: ['sell all my DOGE', 'sold all BTC at $70k'],
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
    id: 'update_cash',
    type: 'mutation',
    description: 'Set cash balance to a specific amount',
    fields: [
      { name: 'currency', type: 'string', required: true, description: 'Currency code (e.g. USD, EUR)' },
      { name: 'amount', type: 'number', required: true, description: 'New balance amount' },
      { name: 'account', type: 'string', required: false, description: 'Account name' },
    ],
    examples: ['N26 EUR balance 4810', 'Revolut USD = 30000'],
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

// ─── Query Tools (15) ───────────────────────────────────────────────────────

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
      { name: 'assetType', type: 'string', required: true, description: 'Asset type to filter by', enum: ['crypto', 'stock', 'etf', 'cash', 'manual'] },
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
      { name: 'category', type: 'string', required: true, description: 'Category to query', enum: ['crypto', 'stock', 'etf', 'cash', 'manual'] },
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
        enum: ['dashboard', 'positions', 'crypto', 'equities', 'cash', 'exposure', 'performance', 'settings', 'wallets', 'perps', 'other'],
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
