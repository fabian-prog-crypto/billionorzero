import type { LucideIcon } from 'lucide-react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Edit2,
  Trash2,
  BarChart3,
  PieChart,
  Scale,
  Landmark,
  Activity,
} from 'lucide-react';

export interface CommandSuggestion {
  id: string;
  text: string;       // Text sent to LLM when selected
  label: string;      // Display label
  category: string;   // Group heading
  icon: LucideIcon;
  keywords: string[]; // Extra terms for fuzzy matching
  contextPages?: string[];
}

const SUGGESTIONS: CommandSuggestion[] = [
  // ─── TRADE ──────────────────────────────────────────────────────────────────
  {
    id: 'buy',
    text: 'Buy ',
    label: 'Buy Position',
    category: 'TRADE',
    icon: TrendingUp,
    keywords: ['purchase', 'add', 'long', 'bought'],
  },
  {
    id: 'sell',
    text: 'Sell ',
    label: 'Sell Position',
    category: 'TRADE',
    icon: TrendingDown,
    keywords: ['sold', 'exit', 'close', 'reduce'],
  },
  {
    id: 'add-cash',
    text: 'Add cash ',
    label: 'Add Cash',
    category: 'TRADE',
    icon: DollarSign,
    keywords: ['deposit', 'transfer', 'fiat', 'usd', 'eur', 'bank'],
    contextPages: ['/cash'],
  },
  {
    id: 'update',
    text: 'Update ',
    label: 'Update Position',
    category: 'TRADE',
    icon: Edit2,
    keywords: ['change', 'modify', 'edit', 'adjust', 'amount'],
  },
  {
    id: 'remove',
    text: 'Remove ',
    label: 'Remove Position',
    category: 'TRADE',
    icon: Trash2,
    keywords: ['delete', 'drop'],
  },

  // ─── QUERY ──────────────────────────────────────────────────────────────────
  {
    id: 'net-worth',
    text: "What's my net worth?",
    label: 'Net Worth',
    category: 'QUERY',
    icon: DollarSign,
    keywords: ['total', 'balance', 'value', 'portfolio'],
  },
  {
    id: 'top-positions',
    text: 'Top 5 positions',
    label: 'Top Positions',
    category: 'QUERY',
    icon: BarChart3,
    keywords: ['biggest', 'largest', 'holdings', 'ranking'],
  },
  {
    id: 'exposure',
    text: 'Show exposure breakdown',
    label: 'Exposure Breakdown',
    category: 'QUERY',
    icon: PieChart,
    keywords: ['allocation', 'distribution', 'long', 'short'],
    contextPages: ['/exposure'],
  },
  {
    id: '24h-change',
    text: "What's my 24h change?",
    label: '24h Change',
    category: 'QUERY',
    icon: TrendingUp,
    keywords: ['today', 'daily', 'gain', 'loss', 'pnl'],
  },
  {
    id: 'leverage',
    text: "What's my leverage ratio?",
    label: 'Leverage & Risk',
    category: 'QUERY',
    icon: Scale,
    keywords: ['risk', 'margin', 'ratio'],
    contextPages: ['/exposure'],
  },
  {
    id: 'debt',
    text: 'Show my debt summary',
    label: 'Debt Summary',
    category: 'QUERY',
    icon: Landmark,
    keywords: ['borrow', 'borrowed', 'loans', 'owed'],
  },
  {
    id: 'perps',
    text: 'Show perps summary',
    label: 'Perps Summary',
    category: 'QUERY',
    icon: Activity,
    keywords: ['futures', 'perpetual', 'derivatives', 'hyperliquid'],
    contextPages: ['/perps'],
  },
];

/**
 * Category display order.
 */
const CATEGORY_ORDER = ['TRADE', 'QUERY'];

/**
 * Map pages to suggestion IDs that should be boosted when on that page.
 */
const PAGE_BOOSTS: Record<string, string[]> = {
  '/cash': ['add-cash', 'net-worth'],
  '/equities': ['top-positions'],
  '/exposure': ['exposure', 'leverage'],
  '/performance': ['24h-change'],
  '/perps': ['perps'],
};

export interface SuggestionGroup {
  category: string;
  items: CommandSuggestion[];
}

/**
 * Returns suggestions grouped by category, with contextual items boosted for the current page.
 */
export function getSuggestions(pathname: string): SuggestionGroup[] {
  const boostedIds = new Set(PAGE_BOOSTS[pathname] || []);

  // Sort: contextual items first within their category
  const sorted = [...SUGGESTIONS].sort((a, b) => {
    const aBoost = boostedIds.has(a.id) ? 0 : 1;
    const bBoost = boostedIds.has(b.id) ? 0 : 1;
    if (aBoost !== bBoost) return aBoost - bBoost;
    return 0; // stable sort preserves original order
  });

  // Group by category in display order
  const groups: SuggestionGroup[] = [];
  for (const cat of CATEGORY_ORDER) {
    const items = sorted.filter(s => s.category === cat);
    if (items.length > 0) {
      groups.push({ category: cat, items });
    }
  }

  return groups;
}

/**
 * Returns true if the suggestion text is a partial command (user needs to type more).
 * Partial commands end with a space -- the user selects them and then types the rest.
 */
export function isPartialCommand(text: string): boolean {
  return text.endsWith(' ');
}
