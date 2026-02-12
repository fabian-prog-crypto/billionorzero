/**
 * Intent Router — Local keyword-based intent classification
 *
 * Classifies CMD-K commands locally (instant) so only 1-3 relevant tools
 * are sent to Ollama instead of all 29, reducing response time from >3min to ~3-5sec.
 */

export type Intent =
  | 'buy' | 'sell' | 'add_cash' | 'update_cash'
  | 'remove' | 'update' | 'set_price'
  | 'toggle' | 'query' | 'navigate'
  | 'add_wallet' | 'remove_wallet'
  | 'set_risk_free_rate'
  | 'unknown';

export interface ClassifiedIntent {
  intent: Intent;
  toolIds: string[];
}

export function classifyIntent(text: string): ClassifiedIntent {
  const t = text.toLowerCase().trim();

  // Buy patterns (exclude "buy cash" which is add_cash)
  if (/\b(bought|buy|purchased|purchase)\b/.test(t) && !/\bcash\b/.test(t)) {
    return { intent: 'buy', toolIds: ['buy_position'] };
  }

  // Sell patterns — distinguish partial vs all
  if (/\b(sold|sell|dump)\b/.test(t)) {
    if (/\b(all|everything|entire)\b/.test(t)) {
      return { intent: 'sell', toolIds: ['sell_all'] };
    }
    return { intent: 'sell', toolIds: ['sell_partial', 'sell_all'] };
  }

  // Add cash patterns — match currency codes or explicit "cash"
  if (/\b(add(ed)?)\b/.test(t) && /\b(cash|usd|eur|chf|gbp|jpy|cad|aud|nzd|sek|nok|dkk|pln|czk|huf|ron|bgn|hrk|isk|try|brl|mxn|inr|cny|krw|sgd|hkd|twd|thb|myr|idr|php)\b/i.test(t)) {
    return { intent: 'add_cash', toolIds: ['add_cash'] };
  }

  // Update cash (balance set)
  if (/\b(balance)\b/.test(t) || /\bset\s+cash\b/.test(t)) {
    return { intent: 'update_cash', toolIds: ['update_cash'] };
  }

  // Add wallet
  if (/\b(add|connect)\s+(wallet|address)\b/.test(t) || /\b(add|connect)\s+0x/i.test(t)) {
    return { intent: 'add_wallet', toolIds: ['add_wallet'] };
  }

  // Remove wallet
  if (/\b(remove|disconnect)\s+(wallet|address)\b/.test(t)) {
    return { intent: 'remove_wallet', toolIds: ['remove_wallet'] };
  }

  // Remove position
  if (/\b(remove|delete)\b/.test(t) && !/\bwallet\b/.test(t) && !/\baddress\b/.test(t)) {
    return { intent: 'remove', toolIds: ['remove_position'] };
  }

  // Set price — "set X price", "price X at", "override price"
  if (/\bset\b.*\bprice\b/.test(t) || /\bprice\b.*\bat\b/.test(t) || /\boverride\s+price\b/.test(t)) {
    return { intent: 'set_price', toolIds: ['set_price'] };
  }

  // Update position
  if (/\b(update|edit|change|modify)\b/.test(t) && !/\bcash\b/.test(t)) {
    return { intent: 'update', toolIds: ['update_position'] };
  }

  // Toggles
  if (/\b(hide|show)\s+(balances?|dust|small)\b/.test(t)) {
    return { intent: 'toggle', toolIds: ['toggle_hide_balances', 'toggle_hide_dust'] };
  }

  // Risk-free rate
  if (/\brisk.?free\s+rate\b/.test(t)) {
    return { intent: 'set_risk_free_rate', toolIds: ['set_risk_free_rate'] };
  }

  // Navigate
  if (/\b(go\s+to|open|navigate|show\s+page)\b/.test(t)) {
    return { intent: 'navigate', toolIds: ['navigate'] };
  }

  // Query patterns (questions, lookups)
  if (/\b(what|how\s+much|how\s+many|show|list|top|summary|exposure|performance|leverage|debt|risk|perp)\b/.test(t) ||
      t.endsWith('?')) {
    return { intent: 'query', toolIds: [
      'query_net_worth', 'query_portfolio_summary', 'query_top_positions',
      'query_position_details', 'query_positions_by_type', 'query_exposure',
      'query_crypto_exposure', 'query_performance', 'query_24h_change',
      'query_category_value', 'query_position_count', 'query_debt_summary',
      'query_leverage', 'query_perps_summary', 'query_risk_profile',
    ]};
  }

  // Unknown — fall back to all tools
  return { intent: 'unknown', toolIds: [] };
}
