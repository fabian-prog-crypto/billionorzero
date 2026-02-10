import { test as base, Page } from '@playwright/test';

/**
 * Seed data for localStorage to bootstrap the app with demo positions.
 * This bypasses the need for API keys or a running backend.
 */

const MANUAL_POSITIONS = [
  {
    id: 'test-btc-1',
    type: 'crypto',
    symbol: 'bitcoin',
    name: 'Bitcoin',
    amount: 1.5,
    costBasis: 45000,
    purchaseDate: '2024-01-15',
    addedAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-15T00:00:00.000Z',
  },
  {
    id: 'test-eth-1',
    type: 'crypto',
    symbol: 'ethereum',
    name: 'Ethereum',
    amount: 10,
    costBasis: 20000,
    purchaseDate: '2024-02-01',
    addedAt: '2024-02-01T00:00:00.000Z',
    updatedAt: '2024-02-01T00:00:00.000Z',
  },
  {
    id: 'test-aapl-1',
    type: 'stock',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    amount: 50,
    costBasis: 8500,
    protocol: 'brokerage:test-brokerage-1',
    addedAt: '2024-03-01T00:00:00.000Z',
    updatedAt: '2024-03-01T00:00:00.000Z',
  },
  {
    id: 'test-cash-usd-1',
    type: 'cash',
    symbol: 'CASH_USD_1000000',
    name: 'Test Bank (USD)',
    amount: 10000,
    costBasis: 10000,
    protocol: 'cash-account:test-cash-account-1',
    addedAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'test-manual-gold',
    type: 'manual',
    symbol: 'GOLD',
    name: 'Gold',
    amount: 5,
    costBasis: 9500,
    addedAt: '2024-04-01T00:00:00.000Z',
    updatedAt: '2024-04-01T00:00:00.000Z',
  },
];

const PRICES: Record<string, object> = {
  bitcoin: {
    symbol: 'BTC',
    price: 65000,
    change24h: 1200,
    changePercent24h: 1.88,
    lastUpdated: new Date().toISOString(),
  },
  ethereum: {
    symbol: 'ETH',
    price: 3200,
    change24h: -50,
    changePercent24h: -1.54,
    lastUpdated: new Date().toISOString(),
  },
  aapl: {
    symbol: 'AAPL',
    price: 190,
    change24h: 2.5,
    changePercent24h: 1.33,
    lastUpdated: new Date().toISOString(),
  },
  cash_usd_1000000: {
    symbol: 'USD',
    price: 1,
    change24h: 0,
    changePercent24h: 0,
    lastUpdated: new Date().toISOString(),
  },
  gold: {
    symbol: 'GOLD',
    price: 2300,
    change24h: 15,
    changePercent24h: 0.66,
    lastUpdated: new Date().toISOString(),
  },
};

const BROKERAGE_ACCOUNTS = [
  {
    id: 'test-brokerage-1',
    name: 'Revolut',
    isActive: true,
    addedAt: '2024-01-01T00:00:00.000Z',
  },
];

const CASH_ACCOUNTS = [
  {
    id: 'test-cash-account-1',
    slug: 'test-bank',
    name: 'Test Bank',
    isActive: true,
    addedAt: '2024-01-01T00:00:00.000Z',
  },
];

function buildPortfolioStorage() {
  return JSON.stringify({
    state: {
      positions: MANUAL_POSITIONS,
      wallets: [],
      accounts: [],
      brokerageAccounts: BROKERAGE_ACCOUNTS,
      cashAccounts: CASH_ACCOUNTS,
      prices: PRICES,
      customPrices: {},
      fxRates: {},
      transactions: [],
      snapshots: [],
      lastRefresh: new Date().toISOString(),
      hideBalances: false,
      hideDust: false,
      riskFreeRate: 0.05,
    },
    version: 7,
  });
}

function buildThemeStorage(theme: 'light' | 'dark' | 'system' = 'dark') {
  return JSON.stringify({
    state: { theme },
    version: 0,
  });
}

function buildAuthStorage() {
  return JSON.stringify({
    state: {
      isAuthenticated: false,
      isPasskeyEnabled: false,
      loginTimestamp: null,
    },
    version: 0,
  });
}

/**
 * Seeds localStorage with test data before the page loads.
 * Must be called before navigating to the app.
 */
export async function seedLocalStorage(page: Page, options?: { theme?: 'light' | 'dark' | 'system' }) {
  await page.addInitScript((data) => {
    localStorage.setItem('portfolio-storage', data.portfolio);
    localStorage.setItem('theme-storage', data.theme);
    localStorage.setItem('auth-storage', data.auth);
  }, {
    portfolio: buildPortfolioStorage(),
    theme: buildThemeStorage(options?.theme ?? 'dark'),
    auth: buildAuthStorage(),
  });
}

/**
 * Seeds localStorage with an empty portfolio (no positions).
 */
export async function seedEmptyPortfolio(page: Page) {
  const emptyPortfolio = JSON.stringify({
    state: {
      positions: [],
      wallets: [],
      accounts: [],
      brokerageAccounts: [],
      cashAccounts: [],
      prices: {},
      customPrices: {},
      fxRates: {},
      transactions: [],
      snapshots: [],
      lastRefresh: null,
      hideBalances: false,
      hideDust: false,
      riskFreeRate: 0.05,
    },
    version: 7,
  });

  await page.addInitScript((data) => {
    localStorage.setItem('portfolio-storage', data.portfolio);
    localStorage.setItem('theme-storage', data.theme);
    localStorage.setItem('auth-storage', data.auth);
  }, {
    portfolio: emptyPortfolio,
    theme: buildThemeStorage('dark'),
    auth: buildAuthStorage(),
  });
}

/**
 * Waits for the app shell to be rendered (header + sidebar visible).
 */
export async function waitForAppLoad(page: Page) {
  // Wait for the logo text to appear, indicating the app shell rendered
  await page.waitForSelector('text=billionorzero', { timeout: 30000 });
}

/**
 * Extended test fixture that seeds the app with test data.
 */
export const test = base.extend<{ seededPage: Page }>({
  seededPage: async ({ page }, use) => {
    await seedLocalStorage(page);
    await page.goto('/');
    await waitForAppLoad(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';
