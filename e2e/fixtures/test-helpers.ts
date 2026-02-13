import { test as base, Page } from '@playwright/test';

/**
 * Seed data for localStorage to bootstrap the app with demo positions.
 * Uses store v13 with unified accounts[] and AccountConnection discriminated union.
 */

// ─── Accounts (v13 unified model) ────────────────────────────────────────────

const ACCOUNTS = [
  {
    id: 'test-brokerage-1',
    name: 'Revolut',
    isActive: true,
    connection: { dataSource: 'manual' },
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'test-bank-1',
    name: 'Test Bank',
    isActive: true,
    connection: { dataSource: 'manual' },
    addedAt: '2024-01-01T00:00:00.000Z',
  },
];

// ─── Positions ───────────────────────────────────────────────────────────────

const POSITIONS = [
  {
    id: 'test-btc-1',
    type: 'crypto',
    assetClass: 'crypto',
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
    assetClass: 'crypto',
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
    assetClass: 'equity',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    amount: 50,
    costBasis: 8500,
    accountId: 'test-brokerage-1',
    addedAt: '2024-03-01T00:00:00.000Z',
    updatedAt: '2024-03-01T00:00:00.000Z',
  },
  {
    id: 'test-msft-1',
    type: 'stock',
    assetClass: 'equity',
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    amount: 100,
    costBasis: 30000,
    purchaseDate: '2024-06-01',
    addedAt: '2024-06-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    accountId: 'test-brokerage-1',
  },
  {
    id: 'test-cash-usd-1',
    type: 'cash',
    assetClass: 'cash',
    symbol: 'CASH_USD_1000000',
    name: 'Test Bank (USD)',
    amount: 10000,
    costBasis: 10000,
    accountId: 'test-bank-1',
    addedAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'test-manual-gold',
    type: 'manual',
    assetClass: 'other',
    symbol: 'GOLD',
    name: 'Gold',
    amount: 5,
    costBasis: 9500,
    addedAt: '2024-04-01T00:00:00.000Z',
    updatedAt: '2024-04-01T00:00:00.000Z',
  },
];

// ─── Prices ──────────────────────────────────────────────────────────────────

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
  msft: {
    symbol: 'MSFT',
    price: 378.9,
    change24h: 5.2,
    changePercent24h: 1.39,
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

// ─── Storage Builders ────────────────────────────────────────────────────────

function buildPortfolioStorage() {
  return JSON.stringify({
    state: {
      positions: POSITIONS,
      accounts: ACCOUNTS,
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
    version: 13,
  });
}

async function mockDbStorage(page: Page, initialState: string) {
  let currentState = initialState;

  await page.route('**/api/db', async (route, request) => {
    const method = request.method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: currentState,
      });
      return;
    }

    if (method === 'PUT') {
      const nextState = request.postData() || currentState;
      currentState = nextState;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
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
 * Fetches a fresh API session token from the running dev server.
 */
async function seedApiToken(page: Page) {
  await page.evaluate(async () => {
    try {
      const res = await fetch('/api/auth/token', { method: 'POST' });
      const data = await res.json();
      if (data.token) localStorage.setItem('api-session-token', data.token);
    } catch {
      // Token seeding is best-effort for tests that don't hit protected routes
    }
  });
}

/**
 * Seeds localStorage with test data before the page loads.
 * Must be called before navigating to the app.
 */
export async function seedLocalStorage(page: Page, options?: { theme?: 'light' | 'dark' | 'system' }) {
  const portfolio = buildPortfolioStorage();
  await mockDbStorage(page, portfolio);

  await page.addInitScript((data) => {
    if (!localStorage.getItem('portfolio-storage')) {
      localStorage.setItem('portfolio-storage', data.portfolio);
    }
    if (!localStorage.getItem('theme-storage')) {
      localStorage.setItem('theme-storage', data.theme);
    }
    if (!localStorage.getItem('auth-storage')) {
      localStorage.setItem('auth-storage', data.auth);
    }
  }, {
    portfolio,
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
      accounts: [],
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
    version: 13,
  });

  await mockDbStorage(page, emptyPortfolio);

  await page.addInitScript((data) => {
    if (!localStorage.getItem('portfolio-storage')) {
      localStorage.setItem('portfolio-storage', data.portfolio);
    }
    if (!localStorage.getItem('theme-storage')) {
      localStorage.setItem('theme-storage', data.theme);
    }
    if (!localStorage.getItem('auth-storage')) {
      localStorage.setItem('auth-storage', data.auth);
    }
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
    await seedApiToken(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';
