export interface FiatCurrency {
  code: string;
  name: string;
  symbol: string;
  flag: string;
}

export const FIAT_CURRENCIES: FiatCurrency[] = [
  // Major currencies (shown first in picker)
  { code: 'USD', name: 'US Dollar',         symbol: '$',   flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'EUR', name: 'Euro',              symbol: '\u20AC',   flag: '\u{1F1EA}\u{1F1FA}' },
  { code: 'GBP', name: 'British Pound',     symbol: '\u00A3',   flag: '\u{1F1EC}\u{1F1E7}' },
  { code: 'CHF', name: 'Swiss Franc',       symbol: 'CHF', flag: '\u{1F1E8}\u{1F1ED}' },
  { code: 'JPY', name: 'Japanese Yen',      symbol: '\u00A5',   flag: '\u{1F1EF}\u{1F1F5}' },
  { code: 'CAD', name: 'Canadian Dollar',   symbol: 'C$',  flag: '\u{1F1E8}\u{1F1E6}' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$',  flag: '\u{1F1E6}\u{1F1FA}' },
  { code: 'PLN', name: 'Polish Zloty',      symbol: 'z\u0142',  flag: '\u{1F1F5}\u{1F1F1}' },
  // Remaining currencies (alphabetical by code)
  { code: 'AED', name: 'UAE Dirham',           symbol: 'AED', flag: '\u{1F1E6}\u{1F1EA}' },
  { code: 'BGN', name: 'Bulgarian Lev',        symbol: '\u043B\u0432',  flag: '\u{1F1E7}\u{1F1EC}' },
  { code: 'BRL', name: 'Brazilian Real',       symbol: 'R$',  flag: '\u{1F1E7}\u{1F1F7}' },
  { code: 'CNY', name: 'Chinese Yuan',         symbol: '\u00A5',   flag: '\u{1F1E8}\u{1F1F3}' },
  { code: 'CZK', name: 'Czech Koruna',         symbol: 'K\u010D',  flag: '\u{1F1E8}\u{1F1FF}' },
  { code: 'DKK', name: 'Danish Krone',         symbol: 'kr',  flag: '\u{1F1E9}\u{1F1F0}' },
  { code: 'HKD', name: 'Hong Kong Dollar',     symbol: 'HK$', flag: '\u{1F1ED}\u{1F1F0}' },
  { code: 'HRK', name: 'Croatian Kuna',        symbol: 'kn',  flag: '\u{1F1ED}\u{1F1F7}' },
  { code: 'HUF', name: 'Hungarian Forint',     symbol: 'Ft',  flag: '\u{1F1ED}\u{1F1FA}' },
  { code: 'IDR', name: 'Indonesian Rupiah',    symbol: 'Rp',  flag: '\u{1F1EE}\u{1F1E9}' },
  { code: 'ILS', name: 'Israeli Shekel',       symbol: '\u20AA',   flag: '\u{1F1EE}\u{1F1F1}' },
  { code: 'INR', name: 'Indian Rupee',         symbol: '\u20B9',   flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'ISK', name: 'Icelandic Krona',      symbol: 'kr',  flag: '\u{1F1EE}\u{1F1F8}' },
  { code: 'KRW', name: 'South Korean Won',     symbol: '\u20A9',   flag: '\u{1F1F0}\u{1F1F7}' },
  { code: 'MXN', name: 'Mexican Peso',         symbol: 'MX$', flag: '\u{1F1F2}\u{1F1FD}' },
  { code: 'MYR', name: 'Malaysian Ringgit',    symbol: 'RM',  flag: '\u{1F1F2}\u{1F1FE}' },
  { code: 'NOK', name: 'Norwegian Krone',      symbol: 'kr',  flag: '\u{1F1F3}\u{1F1F4}' },
  { code: 'NZD', name: 'New Zealand Dollar',   symbol: 'NZ$', flag: '\u{1F1F3}\u{1F1FF}' },
  { code: 'PHP', name: 'Philippine Peso',      symbol: '\u20B1',   flag: '\u{1F1F5}\u{1F1ED}' },
  { code: 'RON', name: 'Romanian Leu',         symbol: 'lei', flag: '\u{1F1F7}\u{1F1F4}' },
  { code: 'RUB', name: 'Russian Ruble',        symbol: '\u20BD',   flag: '\u{1F1F7}\u{1F1FA}' },
  { code: 'SEK', name: 'Swedish Krona',        symbol: 'kr',  flag: '\u{1F1F8}\u{1F1EA}' },
  { code: 'SGD', name: 'Singapore Dollar',     symbol: 'S$',  flag: '\u{1F1F8}\u{1F1EC}' },
  { code: 'THB', name: 'Thai Baht',            symbol: '\u0E3F',   flag: '\u{1F1F9}\u{1F1ED}' },
  { code: 'TRY', name: 'Turkish Lira',         symbol: '\u20BA',   flag: '\u{1F1F9}\u{1F1F7}' },
  { code: 'TWD', name: 'Taiwan Dollar',        symbol: 'NT$', flag: '\u{1F1F9}\u{1F1FC}' },
  { code: 'VND', name: 'Vietnamese Dong',      symbol: '\u20AB',   flag: '\u{1F1FB}\u{1F1F3}' },
  { code: 'ZAR', name: 'South African Rand',   symbol: 'R',   flag: '\u{1F1FF}\u{1F1E6}' },
];

export const FIAT_CURRENCY_MAP: Record<string, FiatCurrency> = Object.fromEntries(
  FIAT_CURRENCIES.map(c => [c.code, c])
);

// Common currencies shown at top of picker (before separator)
export const COMMON_CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'PLN'];
