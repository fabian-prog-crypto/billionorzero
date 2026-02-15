import { describe, it, expect } from 'vitest';
import { classifyIntent } from './intent-router';

describe('classifyIntent', () => {
  // ─── Buy ───────────────────────────────────────────────────────────────────
  describe('buy intent', () => {
    it('classifies "bought X of Y"', () => {
      const r = classifyIntent('bought 50k USD worth of AAPL');
      expect(r.intent).toBe('buy');
      expect(r.toolIds).toEqual(['buy_position']);
    });

    it('classifies "buy X"', () => {
      expect(classifyIntent('buy 0.5 BTC').intent).toBe('buy');
    });

    it('classifies "purchased X at $Y"', () => {
      expect(classifyIntent('purchased 100 MSFT at $400').intent).toBe('buy');
    });

    it('does not classify "buy cash" as buy', () => {
      expect(classifyIntent('buy cash EUR').intent).not.toBe('buy');
    });
  });

  // ─── Sell ──────────────────────────────────────────────────────────────────
  describe('sell intent', () => {
    it('classifies partial sell', () => {
      const r = classifyIntent('sold 50% of AAPL');
      expect(r.intent).toBe('sell');
      expect(r.toolIds).toContain('sell_partial');
    });

    it('classifies sell half', () => {
      const r = classifyIntent('sell half my ETH');
      expect(r.intent).toBe('sell');
      expect(r.toolIds).toContain('sell_partial');
    });

    it('classifies sell all', () => {
      const r = classifyIntent('sell all DOGE');
      expect(r.intent).toBe('sell');
      expect(r.toolIds).toEqual(['sell_all']);
    });

    it('classifies sell everything', () => {
      const r = classifyIntent('sold everything of BTC');
      expect(r.intent).toBe('sell');
      expect(r.toolIds).toEqual(['sell_all']);
    });

    it('classifies "dump" as sell', () => {
      expect(classifyIntent('dump my SOL').intent).toBe('sell');
    });
  });

  // ─── Add Cash ──────────────────────────────────────────────────────────────
  describe('add_cash intent', () => {
    it('classifies "added 100k of CHF"', () => {
      const r = classifyIntent('added 100k of CHF');
      expect(r.intent).toBe('add_cash');
      expect(r.toolIds).toEqual(['add_cash']);
    });

    it('classifies "add 5000 EUR to Revolut"', () => {
      expect(classifyIntent('add 5000 EUR to Revolut').intent).toBe('add_cash');
    });

    it('classifies "add cash USD"', () => {
      expect(classifyIntent('add cash USD').intent).toBe('add_cash');
    });

    it('classifies "added 10k USD"', () => {
      expect(classifyIntent('added 10k USD').intent).toBe('add_cash');
    });
  });

  // ─── Cash Balance Updates (canonical update_position) ────────────────────
  describe('cash balance update intent', () => {
    it('classifies "balance" commands', () => {
      const r = classifyIntent('N26 EUR balance 4810');
      expect(r.intent).toBe('update');
      expect(r.toolIds).toEqual(['update_position']);
    });

    it('classifies "set cash"', () => {
      const r = classifyIntent('set cash EUR to 5000');
      expect(r.intent).toBe('update');
      expect(r.toolIds).toEqual(['update_position']);
    });
  });

  // ─── Remove ────────────────────────────────────────────────────────────────
  describe('remove intent', () => {
    it('classifies "remove DOGE"', () => {
      const r = classifyIntent('remove DOGE');
      expect(r.intent).toBe('remove');
      expect(r.toolIds).toEqual(['remove_position']);
    });

    it('classifies "delete my SOL position"', () => {
      expect(classifyIntent('delete my SOL position').intent).toBe('remove');
    });

    it('does not classify "remove wallet" as remove position', () => {
      expect(classifyIntent('remove wallet 0xabc').intent).toBe('remove_wallet');
    });
  });

  // ─── Update Position ──────────────────────────────────────────────────────
  describe('update intent', () => {
    it('classifies "update BTC amount"', () => {
      const r = classifyIntent('update BTC amount to 0.6');
      expect(r.intent).toBe('update');
      expect(r.toolIds).toEqual(['update_position']);
    });

    it('classifies "edit AAPL cost basis"', () => {
      expect(classifyIntent('edit AAPL cost basis to $9000').intent).toBe('update');
    });
  });

  // ─── Set Price ─────────────────────────────────────────────────────────────
  describe('set_price intent', () => {
    it('classifies "set price"', () => {
      const r = classifyIntent('set BTC price to $65000');
      expect(r.intent).toBe('set_price');
      expect(r.toolIds).toEqual(['set_price']);
    });

    it('classifies "price at"', () => {
      expect(classifyIntent('price ETH at $3200').intent).toBe('set_price');
    });
  });

  // ─── Toggles ──────────────────────────────────────────────────────────────
  describe('toggle intent', () => {
    it('classifies "hide balances"', () => {
      const r = classifyIntent('hide balances');
      expect(r.intent).toBe('toggle');
      expect(r.toolIds).toContain('toggle_hide_balances');
    });

    it('classifies "show dust"', () => {
      expect(classifyIntent('show dust').intent).toBe('toggle');
    });

    it('classifies "hide small"', () => {
      expect(classifyIntent('hide small positions').intent).toBe('toggle');
    });
  });

  // ─── Wallet ────────────────────────────────────────────────────────────────
  describe('wallet intents', () => {
    it('classifies "add wallet"', () => {
      const r = classifyIntent('add wallet 0xabc123');
      expect(r.intent).toBe('add_wallet');
      expect(r.toolIds).toEqual(['add_wallet']);
    });

    it('classifies "connect 0x..."', () => {
      expect(classifyIntent('connect 0x1234abcd').intent).toBe('add_wallet');
    });

    it('classifies "disconnect wallet"', () => {
      const r = classifyIntent('disconnect wallet My ETH');
      expect(r.intent).toBe('remove_wallet');
      expect(r.toolIds).toEqual(['remove_wallet']);
    });
  });

  // ─── Risk Free Rate ───────────────────────────────────────────────────────
  describe('set_risk_free_rate intent', () => {
    it('classifies "risk-free rate"', () => {
      const r = classifyIntent('set risk-free rate to 4.5%');
      expect(r.intent).toBe('set_risk_free_rate');
      expect(r.toolIds).toEqual(['set_risk_free_rate']);
    });

    it('classifies "risk free rate"', () => {
      expect(classifyIntent('risk free rate 0.05').intent).toBe('set_risk_free_rate');
    });
  });

  // ─── Navigate ──────────────────────────────────────────────────────────────
  describe('navigate intent', () => {
    it('classifies "go to performance"', () => {
      const r = classifyIntent('go to performance');
      expect(r.intent).toBe('navigate');
      expect(r.toolIds).toEqual(['navigate']);
    });

    it('classifies "open settings"', () => {
      expect(classifyIntent('open settings').intent).toBe('navigate');
    });
  });

  // ─── Query ─────────────────────────────────────────────────────────────────
  describe('query intent', () => {
    it('classifies questions', () => {
      const r = classifyIntent("what's my net worth?");
      expect(r.intent).toBe('query');
      expect(r.toolIds).toEqual(['query_net_worth']);
    });

    it('classifies "top 5 positions"', () => {
      const r = classifyIntent('top 5 positions');
      expect(r.intent).toBe('query');
      expect(r.toolIds).toEqual(['query_top_positions']);
    });

    it('classifies "show exposure"', () => {
      const r = classifyIntent('show exposure');
      expect(r.intent).toBe('query');
      expect(r.toolIds).toEqual(['query_exposure']);
    });

    it('classifies "how much crypto"', () => {
      const r = classifyIntent('how much crypto do I have?');
      expect(r.intent).toBe('query');
      expect(r.toolIds).toEqual(['query_category_value']);
    });

    it('classifies "performance"', () => {
      const r = classifyIntent('performance');
      expect(r.intent).toBe('query');
      expect(r.toolIds).toEqual(['query_performance']);
    });

    it('classifies any question ending with ?', () => {
      const r = classifyIntent('what is BTC allocation?');
      expect(r.intent).toBe('query');
      expect(r.toolIds.length).toBeLessThanOrEqual(3);
    });

    it('classifies "leverage"', () => {
      const r = classifyIntent('leverage');
      expect(r.intent).toBe('query');
      expect(r.toolIds).toEqual(['query_leverage']);
    });

    it('classifies "debt"', () => {
      const r = classifyIntent('debt');
      expect(r.intent).toBe('query');
      expect(r.toolIds).toEqual(['query_debt_summary']);
    });
  });

  // ─── Unknown ───────────────────────────────────────────────────────────────
  describe('unknown intent', () => {
    it('falls back to unknown for bare symbol', () => {
      const r = classifyIntent('AAPL');
      expect(r.intent).toBe('unknown');
      expect(r.toolIds).toEqual([]);
    });

    it('falls back to unknown for ambiguous input', () => {
      expect(classifyIntent('hello there').intent).toBe('unknown');
    });

    it('falls back to unknown for empty-ish input', () => {
      expect(classifyIntent('   ').intent).toBe('unknown');
    });
  });
});
