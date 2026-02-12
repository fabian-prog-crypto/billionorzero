import { describe, it, expect } from 'vitest';
import { getSuggestions, isPartialCommand } from './suggestions';

describe('suggestions', () => {
  describe('getSuggestions', () => {
    it('returns only TRADE and QUERY categories', () => {
      const groups = getSuggestions('/');
      const categories = groups.map(g => g.category);
      expect(categories).toEqual(['TRADE', 'QUERY']);
    });

    it('returns non-empty item lists', () => {
      const groups = getSuggestions('/');
      for (const group of groups) {
        expect(group.items.length).toBeGreaterThan(0);
      }
    });

    it('returns suggestions with required fields', () => {
      const groups = getSuggestions('/');
      for (const group of groups) {
        for (const item of group.items) {
          expect(item.id).toBeTruthy();
          expect(item.text).toBeTruthy();
          expect(item.label).toBeTruthy();
          expect(item.category).toBeTruthy();
          expect(item.icon).toBeDefined();
          expect(Array.isArray(item.keywords)).toBe(true);
        }
      }
    });

    it('boosts cash-related items on /cash page', () => {
      const groups = getSuggestions('/cash');
      const tradeGroup = groups.find(g => g.category === 'TRADE');
      expect(tradeGroup).toBeDefined();
      // "Add Cash" should be first in TRADE group on /cash page
      const addCashIndex = tradeGroup!.items.findIndex(i => i.id === 'add-cash');
      expect(addCashIndex).toBe(0);
    });

    it('boosts exposure items on /exposure page', () => {
      const groups = getSuggestions('/exposure');
      const queryGroup = groups.find(g => g.category === 'QUERY');
      expect(queryGroup).toBeDefined();
      // "Exposure Breakdown" and "Leverage & Risk" should be first
      const exposureIndex = queryGroup!.items.findIndex(i => i.id === 'exposure');
      const leverageIndex = queryGroup!.items.findIndex(i => i.id === 'leverage');
      expect(exposureIndex).toBeLessThan(2);
      expect(leverageIndex).toBeLessThan(2);
    });

    it('does not boost on unrecognized pages', () => {
      const homeGroups = getSuggestions('/');
      const unknownGroups = getSuggestions('/unknown-page');
      // Should return same order when no boosting applies
      expect(homeGroups.map(g => g.category)).toEqual(unknownGroups.map(g => g.category));
    });

    it('has unique IDs across all suggestions', () => {
      const groups = getSuggestions('/');
      const allIds = groups.flatMap(g => g.items.map(i => i.id));
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });

    it('has exactly 12 total suggestions (5 TRADE + 7 QUERY)', () => {
      const groups = getSuggestions('/');
      const total = groups.reduce((sum, g) => sum + g.items.length, 0);
      expect(total).toBe(12);

      const trade = groups.find(g => g.category === 'TRADE');
      const query = groups.find(g => g.category === 'QUERY');
      expect(trade!.items.length).toBe(5);
      expect(query!.items.length).toBe(7);
    });

    it('all suggestions have non-empty keywords arrays', () => {
      const groups = getSuggestions('/');
      for (const group of groups) {
        for (const item of group.items) {
          expect(item.keywords.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('isPartialCommand', () => {
    it('returns true for text ending with space', () => {
      expect(isPartialCommand('Buy ')).toBe(true);
      expect(isPartialCommand('Sell ')).toBe(true);
      expect(isPartialCommand('Update ')).toBe(true);
    });

    it('returns false for complete commands', () => {
      expect(isPartialCommand("What's my net worth?")).toBe(false);
      expect(isPartialCommand('Show exposure breakdown')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isPartialCommand('')).toBe(false);
    });

    it('every TRADE suggestion has isPartialCommand() === true', () => {
      const groups = getSuggestions('/');
      const trade = groups.find(g => g.category === 'TRADE')!;
      for (const item of trade.items) {
        expect(isPartialCommand(item.text)).toBe(true);
      }
    });

    it('every QUERY suggestion has isPartialCommand() === false', () => {
      const groups = getSuggestions('/');
      const query = groups.find(g => g.category === 'QUERY')!;
      for (const item of query.items) {
        expect(isPartialCommand(item.text)).toBe(false);
      }
    });
  });
});
