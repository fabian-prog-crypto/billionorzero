import { FIAT_CURRENCIES, FIAT_CURRENCY_MAP, COMMON_CURRENCY_CODES } from './currencies';

describe('currencies', () => {
  describe('FIAT_CURRENCIES', () => {
    it('has 36 entries', () => {
      expect(FIAT_CURRENCIES).toHaveLength(36);
    });

    it('all entries have code, name, symbol, and flag', () => {
      for (const currency of FIAT_CURRENCIES) {
        expect(currency.code).toBeTruthy();
        expect(currency.name).toBeTruthy();
        expect(currency.symbol).toBeTruthy();
        expect(currency.flag).toBeTruthy();
      }
    });

    it('has no duplicate codes', () => {
      const codes = FIAT_CURRENCIES.map(c => c.code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it('all codes are 3 uppercase letters', () => {
      for (const currency of FIAT_CURRENCIES) {
        expect(currency.code).toMatch(/^[A-Z]{3}$/);
      }
    });
  });

  describe('FIAT_CURRENCY_MAP', () => {
    it('has same count as FIAT_CURRENCIES array', () => {
      expect(Object.keys(FIAT_CURRENCY_MAP).length).toBe(FIAT_CURRENCIES.length);
    });

    it('contains common currencies (USD, EUR, GBP)', () => {
      expect(FIAT_CURRENCY_MAP.USD).toBeDefined();
      expect(FIAT_CURRENCY_MAP.EUR).toBeDefined();
      expect(FIAT_CURRENCY_MAP.GBP).toBeDefined();
    });

    it('USD lookup returns correct data', () => {
      const usd = FIAT_CURRENCY_MAP.USD;
      expect(usd.code).toBe('USD');
      expect(usd.name).toBe('US Dollar');
      expect(usd.symbol).toBe('$');
    });
  });

  describe('COMMON_CURRENCY_CODES', () => {
    it('has 8 entries', () => {
      expect(COMMON_CURRENCY_CODES).toHaveLength(8);
    });
  });
});
