/**
 * Intent Router — Local keyword-based intent classification
 *
 * Classifies CMD-K commands locally (instant) so only 1-3 relevant tools
 * are sent to Ollama instead of all 29, reducing response time from >3min to ~3-5sec.
 */

export type Intent =
  | 'buy' | 'sell' | 'add_cash'
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

  // Update cash (balance set) -> canonical update_position
  if (/\b(balance)\b/.test(t) || /\bset\s+cash\b/.test(t)) {
    return { intent: 'update', toolIds: ['update_position'] };
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

  // Query patterns (questions, lookups) -> keep tool budget tight (1-3)
  if (/\b(what|how\s+much|how\s+many|show|list|top|summary|exposure|performance|leverage|debt|risk|perp)\b/.test(t) ||
      t.endsWith('?')) {
    const symbolMatch = t.toUpperCase().match(/\b[A-Z][A-Z0-9.\-]{1,9}\b/);
    if (symbolMatch && /\b(position|holding|details|amount|value)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_position_details'] };
    }
    if (/\b(rebalance|target\s+allocation|targets?)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_rebalance_targets'] };
    }
    if (/\b(stablecoin|stable\s+coin)\b.*\bexposure\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_stablecoin_exposure'] };
    }
    if (/\bcash\b.*\bvs\b.*\b(invested|investment)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_cash_vs_invested'] };
    }
    if (/\b(gainers|winners|top\s+movers)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_top_gainers_24h'] };
    }
    if (/\b(losers|worst|biggest\s+losers)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_top_losers_24h'] };
    }
    if (/\b(missing|unpriced|no)\b.*\bprice\b/.test(t) || /\bmissing\s+prices?\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_missing_prices'] };
    }
    if (/\b(debt|liabilit)\w*\b/.test(t) && /\b(top|largest|biggest)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_largest_debts'] };
    }
    if (/\b(exposure|allocation)\b.*\b(chain|chains)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_exposure_by_chain'] };
    }
    if (/\b(exposure|allocation)\b.*\b(custody|custodian)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_exposure_by_custody'] };
    }
    if (/\ballocation\b.*\b(category|categories|breakdown)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_allocation_by_category'] };
    }
    if (/\b(perps?|margin)\b.*\b(utilization|usage)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_perps_utilization'] };
    }
    if (/\bunrealized\b.*\b(pnl|p&l|profit|loss)\b/.test(t) || /\bpnl\b.*\bcost\s+basis\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_unrealized_pnl'] };
    }
    if (/\b(concentration|concentrated)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_risk_concentration'] };
    }
    if (/\bcash\b.*\b(breakdown|by\s+currency|currencies)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_cash_breakdown'] };
    }
    if (/\b(equity|equities|stocks)\b.*\bexposure\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_equities_exposure'] };
    }
    if (/\b(account\s+health|accounts?\s+with\s+debt|negative\s+cash)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_account_health'] };
    }
    if (/\b(price\s+overrides?|custom\s+prices?)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_largest_price_overrides'] };
    }
    if (/\b(recent\s+changes|last\s+snapshot)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_recent_changes'] };
    }
    if (/\bnet\s+worth|total\s+value\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_net_worth'] };
    }
    if (/\bsummary|overview\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_portfolio_summary'] };
    }
    if (/\btop|biggest|largest\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_top_positions'] };
    }
    if (/\b24h|today|daily\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_24h_change'] };
    }
    if (/\bperformance|return|sharpe|cagr\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_performance'] };
    }
    if (/\bexposure\b/.test(t) && /\b(usd|eur|gbp|chf|jpy|cad|aud|nzd|sek|nok|dkk|pln|czk|huf|ron|bgn|hrk|isk|try|brl|mxn|inr|cny|krw|sgd|hkd|twd|thb|myr|idr|php|usdc|usdt|dai|usde|fdusd|busd|tusd|usdp|usdd|frax|lusd|gusd|susd|rai|pyusd|usdm|gho|crvusd|mkusd|usds|usd0|usd0\\+\\+|euroc|eurt|ceur|ageur|jeur|eurc|eure|eura|gbpt|gbpc)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_currency_exposure'] };
    }
    if (/\bexposure\b/.test(t)) {
      if (/\bcrypto\b/.test(t)) return { intent: 'query', toolIds: ['query_crypto_exposure'] };
      return { intent: 'query', toolIds: ['query_exposure'] };
    }
    if (/\bdebt|borrow\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_debt_summary'] };
    }
    if (/\bleverage\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_leverage'] };
    }
    if (/\bperp|futures\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_perps_summary'] };
    }
    if (/\brisk\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_risk_profile'] };
    }
    if (/\bcount|how\s+many\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_position_count'] };
    }
    if (/\b(list|show)\b.*\b(crypto|stock|etf|cash|manual)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_positions_by_type'] };
    }
    if (/\b(how\s+much|total)\b.*\b(crypto|stock|etf|cash|manual)\b/.test(t)) {
      return { intent: 'query', toolIds: ['query_category_value'] };
    }
    return { intent: 'query', toolIds: ['query_net_worth', 'query_portfolio_summary', 'query_top_positions'] };
  }

  // Unknown — fall back to all tools
  return { intent: 'unknown', toolIds: [] };
}
