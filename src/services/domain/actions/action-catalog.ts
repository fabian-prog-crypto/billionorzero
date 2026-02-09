import { ParsedPositionAction } from '@/types';
import { MenuItem, LLMMenuResponse, PositionContext } from './types';
import { ALL_HANDLERS } from './handlers';
import { getFiatCurrencies } from '../category-service';

const MIN_FILTERED_ITEMS = 3;
const MAX_FILTERED_ITEMS = 20;

/**
 * ActionCatalog — singleton registry that generates concrete menus
 * from current positions, and resolves LLM menu picks into
 * ParsedPositionAction objects.
 */
class ActionCatalog {
  /**
   * Generate the full menu from all handlers for the given positions.
   */
  generateMenu(positions: PositionContext[]): MenuItem[] {
    const items: MenuItem[] = [];
    for (const handler of ALL_HANDLERS) {
      items.push(...handler.generateMenuItems(positions));
    }
    return items;
  }

  /**
   * Generate a filtered menu based on user text.
   * Scores items by token overlap and returns the top N + generic fallbacks.
   */
  generateFilteredMenu(positions: PositionContext[], userText: string): MenuItem[] {
    const allItems = this.generateMenu(positions);
    const tokens = userText.toLowerCase().split(/\s+/).filter(t => t.length > 0);

    // Score items by token overlap
    const scored = allItems.map(item => {
      const haystack = (item.id + ' ' + item.label + ' ' + item.description).toLowerCase();
      const score = tokens.filter(t => haystack.includes(t)).length;
      return { item, score };
    });

    // Filter and sort by score
    const matched = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_FILTERED_ITEMS)
      .map(s => s.item);

    // For "{NUM} {FIAT} to/in {account}" patterns, remove per-account add_cash
    // items whose account name doesn't match the user's target account.
    // This prevents the 3B model from picking a wrong account just because
    // the currency matched.
    const fiatSet = getFiatCurrencies();
    const addCashPatternMatch = userText.match(
      /^(?:add\s+)?(\d+(?:[.,]\d+)?[kmb]?)\s+([a-z]{3})\s+(?:to|in|into|at)\s+(.+)$/i
    );
    if (addCashPatternMatch && fiatSet.has(addCashPatternMatch[2].toLowerCase())) {
      const targetAccount = addCashPatternMatch[3].trim().toLowerCase();
      // Remove per-account add_cash items that don't match the target account
      const toRemove = new Set<string>();
      for (const item of matched) {
        if (item._handler === 'add-cash' && item.id !== 'add_cash_generic') {
          const ctxAccount = (item._context.accountName as string || '').toLowerCase();
          if (ctxAccount !== targetAccount) {
            toRemove.add(item.id);
          }
        }
      }
      if (toRemove.size > 0) {
        matched.splice(0, matched.length, ...matched.filter(i => !toRemove.has(i.id)));
      }
    }

    // Always include generic fallbacks
    const genericIds = new Set(['buy_new', 'add_cash_generic']);
    const generics = allItems.filter(i => genericIds.has(i.id));

    // Merge, dedup by id
    const seen = new Set<string>();
    const result: MenuItem[] = [];
    for (const item of [...matched, ...generics]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        result.push(item);
      }
    }

    // If too few items survived filtering, send the full menu
    if (matched.length < MIN_FILTERED_ITEMS) {
      return allItems;
    }

    return result;
  }

  /**
   * Resolve an LLM menu response into a ParsedPositionAction.
   */
  resolve(
    response: LLMMenuResponse,
    positions: PositionContext[],
  ): ParsedPositionAction {
    const allItems = this.generateMenu(positions);
    const item = allItems.find(i => i.id === response.menuId);

    if (!item) {
      // Fallback: try to match partially
      const partial = allItems.find(i => response.menuId.startsWith(i.id) || i.id.startsWith(response.menuId));
      if (!partial) {
        return {
          action: 'buy',
          symbol: 'UNKNOWN',
          assetType: 'crypto',
          confidence: 0,
          summary: `Unknown menu item: ${response.menuId}`,
          missingFields: ['symbol', 'amount'],
        };
      }
      return this.resolveItem(partial, response.values, positions, response.confidence);
    }

    return this.resolveItem(item, response.values, positions, response.confidence);
  }

  private resolveItem(
    item: MenuItem,
    values: Record<string, string>,
    positions: PositionContext[],
    confidence: number,
  ): ParsedPositionAction {
    const handler = ALL_HANDLERS.find(h => h.id === item._handler);
    if (!handler) {
      return {
        action: 'buy',
        symbol: 'UNKNOWN',
        assetType: 'crypto',
        confidence: 0,
        summary: `No handler for: ${item._handler}`,
        missingFields: ['symbol', 'amount'],
      };
    }

    const result = handler.resolve(item, values, positions);
    // Override confidence if LLM provided one
    if (confidence > 0) {
      result.confidence = confidence;
    }
    return result;
  }
}

// Singleton
let instance: ActionCatalog | null = null;

export function getActionCatalog(): ActionCatalog {
  if (!instance) {
    instance = new ActionCatalog();
  }
  return instance;
}
