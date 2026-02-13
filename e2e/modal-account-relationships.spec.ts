import { test as base, Page, expect } from '@playwright/test';

const CMD_K = process.platform === 'darwin' ? 'Meta+k' : 'Control+k';

// ─── Custom seed data with wallet, CEX, brokerage, and cash accounts ─────────

const ACCOUNTS = [
  {
    id: 'wallet-1',
    name: 'Main Wallet',
    isActive: true,
    connection: { dataSource: 'debank', address: '0xabc123' },
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'cex-1',
    name: 'Binance',
    isActive: true,
    connection: { dataSource: 'binance', apiKey: 'k', apiSecret: 's' },
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'brokerage-1',
    name: 'IBKR',
    isActive: true,
    connection: { dataSource: 'manual' },
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'bank-1',
    name: 'Revolut',
    isActive: true,
    slug: 'revolut',
    connection: { dataSource: 'manual' },
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'bank-2',
    name: 'N26',
    isActive: true,
    slug: 'n26',
    connection: { dataSource: 'manual' },
    addedAt: '2024-01-01T00:00:00.000Z',
  },
];

const POSITIONS = [
  {
    id: 'pos-btc',
    type: 'crypto',
    assetClass: 'crypto',
    symbol: 'bitcoin',
    name: 'Bitcoin',
    amount: 2,
    costBasis: 50000,
    accountId: 'wallet-1',
    addedAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pos-eth',
    type: 'crypto',
    assetClass: 'crypto',
    symbol: 'ethereum',
    name: 'Ethereum',
    amount: 10,
    costBasis: 20000,
    accountId: 'cex-1',
    addedAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pos-aapl',
    type: 'stock',
    assetClass: 'equity',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    amount: 50,
    costBasis: 8500,
    accountId: 'brokerage-1',
    addedAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pos-cash-chf',
    type: 'cash',
    assetClass: 'cash',
    symbol: 'CASH_CHF_100',
    name: 'Revolut (CHF)',
    amount: 5000,
    costBasis: 5000,
    accountId: 'bank-1',
    addedAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pos-cash-eur',
    type: 'cash',
    assetClass: 'cash',
    symbol: 'CASH_EUR_200',
    name: 'N26 (EUR)',
    amount: 3000,
    costBasis: 3000,
    accountId: 'bank-2',
    addedAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
];

const PRICES: Record<string, object> = {
  bitcoin: { symbol: 'BTC', price: 65000, change24h: 0, changePercent24h: 0, lastUpdated: new Date().toISOString() },
  ethereum: { symbol: 'ETH', price: 3200, change24h: 0, changePercent24h: 0, lastUpdated: new Date().toISOString() },
  aapl: { symbol: 'AAPL', price: 190, change24h: 0, changePercent24h: 0, lastUpdated: new Date().toISOString() },
  cash_chf_100: { symbol: 'CHF', price: 1, change24h: 0, changePercent24h: 0, lastUpdated: new Date().toISOString() },
  cash_eur_200: { symbol: 'EUR', price: 1, change24h: 0, changePercent24h: 0, lastUpdated: new Date().toISOString() },
};

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

async function seedCustomStorage(page: Page) {
  // The store uses jsonFileStorage which reads from /api/db, so we must mock that route
  await page.route('**/api/db', async (route, request) => {
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: buildPortfolioStorage(),
      });
    } else {
      // PUT — accept writes silently
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
  });

  // Also seed localStorage for initial render before async hydration
  await page.addInitScript((data) => {
    localStorage.setItem('portfolio-storage', data.portfolio);
    localStorage.setItem('theme-storage', JSON.stringify({ state: { theme: 'dark' }, version: 0 }));
    localStorage.setItem('auth-storage', JSON.stringify({ state: { isAuthenticated: false, isPasskeyEnabled: false, loginTimestamp: null }, version: 0 }));
  }, { portfolio: buildPortfolioStorage() });
}

async function seedApiToken(page: Page) {
  await page.evaluate(async () => {
    try {
      const res = await fetch('/api/auth/token', { method: 'POST' });
      const data = await res.json();
      if (data.token) localStorage.setItem('api-session-token', data.token);
    } catch { /* best-effort */ }
  });
}

function mockChatSuccess(page: Page, response: object) {
  return page.route('**/api/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

/**
 * Helper: get the option texts from a select element inside the modal.
 */
async function getSelectOptionTexts(page: Page, selectIndex = 0): Promise<string[]> {
  return page.locator('.modal-content select').nth(selectIndex).evaluate((sel: HTMLSelectElement) => {
    return Array.from(sel.options).map(o => o.textContent || '');
  });
}

// Custom fixture with our account-rich seed data
const test = base.extend<{ seededPage: Page }>({
  seededPage: async ({ page }, use) => {
    await seedCustomStorage(page);
    await page.goto('/');
    await page.waitForSelector('text=billionorzero', { timeout: 30000 });
    await seedApiToken(page);
    await use(page);
  },
});

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Modal Account Relationships', () => {

  test('sell modal shows account context for crypto position', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'sell_partial',
        symbol: 'bitcoin',
        name: 'Bitcoin',
        assetType: 'crypto',
        sellAmount: 1,
        sellPrice: 65000,
        matchedPositionId: 'pos-btc',
        confidence: 0.95,
        summary: 'Sell 1 BTC at $65,000',
      },
    });

    await page.keyboard.press(CMD_K);
    await page.locator('.command-palette-input').fill('Sell 1 BTC at $65,000');
    await page.keyboard.press('Enter');

    // Modal opens
    await expect(page.locator('.modal-content')).toBeVisible({ timeout: 10000 });
    // Should show "Account: Main Wallet" as text
    await expect(page.locator('.modal-content').locator('text=Account: Main Wallet')).toBeVisible();
  });

  test('buy crypto modal shows wallet/CEX accounts, not cash accounts', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'ethereum',
        name: 'Ethereum',
        assetType: 'crypto',
        amount: 5,
        pricePerUnit: 3200,
        confidence: 0.9,
        summary: 'Buy 5 ETH at $3,200',
      },
    });

    await page.keyboard.press(CMD_K);
    await page.locator('.command-palette-input').fill('Buy 5 ETH at $3,200');
    await page.keyboard.press('Enter');

    await expect(page.locator('.modal-content')).toBeVisible({ timeout: 10000 });

    // Check the select options contain wallet + CEX but not cash accounts
    const options = await getSelectOptionTexts(page);
    expect(options).toContain('Main Wallet');
    expect(options).toContain('Binance');
    // Cash accounts should NOT appear in the dropdown
    expect(options.some(o => o === 'Revolut')).toBe(false);
    expect(options.some(o => o === 'N26')).toBe(false);
  });

  test('buy stock modal shows brokerage accounts only', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'AAPL',
        name: 'Apple',
        assetType: 'stock',
        amount: 10,
        pricePerUnit: 190,
        confidence: 0.9,
        summary: 'Buy 10 AAPL at $190',
      },
    });

    await page.keyboard.press(CMD_K);
    await page.locator('.command-palette-input').fill('Buy 10 AAPL at $190');
    await page.keyboard.press('Enter');

    await expect(page.locator('.modal-content')).toBeVisible({ timeout: 10000 });

    // Check select options — brokerage only
    const options = await getSelectOptionTexts(page);
    expect(options).toContain('IBKR');
    // Wallet/CEX/cash should NOT appear
    expect(options.some(o => o === 'Main Wallet')).toBe(false);
    expect(options.some(o => o === 'Binance')).toBe(false);
    expect(options.some(o => o === 'Revolut')).toBe(false);
  });

  test('update_position modal shows bank account dropdown', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'update_position',
        symbol: 'CASH_CHF_100',
        name: 'Revolut (CHF)',
        assetType: 'cash',
        amount: 6000,
        matchedPositionId: 'pos-cash-chf',
        currency: 'CHF',
        confidence: 0.95,
        summary: 'Update Revolut (CHF) balance to 6,000',
      },
    });

    await page.keyboard.press(CMD_K);
    await page.locator('.command-palette-input').fill('Set Revolut CHF to 6000');
    await page.keyboard.press('Enter');

    await expect(page.locator('.modal-content')).toBeVisible({ timeout: 10000 });

    // There are 2 selects: position selector (if multiple cash positions) and account selector
    // Find the account selector by checking which has bank account options
    const selects = page.locator('.modal-content select');
    const selectCount = await selects.count();

    let foundAccountSelect = false;
    for (let i = 0; i < selectCount; i++) {
      const options = await selects.nth(i).evaluate((sel: HTMLSelectElement) => {
        return Array.from(sel.options).map(o => o.textContent || '');
      });
      // The account selector has "Revolut" and "N26" as distinct options
      if (options.includes('Revolut') && options.includes('N26')) {
        foundAccountSelect = true;
        // Brokerage/manual accounts should be selectable for cash updates
        expect(options.some(o => o === 'IBKR')).toBe(true);
      }
    }
    expect(foundAccountSelect).toBe(true);
  });

  test('remove modal shows account name next to position', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'remove',
        symbol: 'ethereum',
        name: 'Ethereum',
        assetType: 'crypto',
        matchedPositionId: 'pos-eth',
        confidence: 0.9,
        summary: 'Remove Ethereum position',
      },
    });

    await page.keyboard.press(CMD_K);
    await page.locator('.command-palette-input').fill('Remove ETH');
    await page.keyboard.press('Enter');

    await expect(page.locator('.modal-content')).toBeVisible({ timeout: 10000 });
    // Should show "· Binance" next to the position
    await expect(page.locator('.modal-content').locator('text=Binance')).toBeVisible();
  });

  test('set_price modal shows account name on affected positions', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'set_price',
        symbol: 'bitcoin',
        name: 'Bitcoin',
        assetType: 'crypto',
        newPrice: 70000,
        confidence: 0.9,
        summary: 'Set BTC price to $70,000',
      },
    });

    await page.keyboard.press(CMD_K);
    await page.locator('.command-palette-input').fill('Set BTC price to 70000');
    await page.keyboard.press('Enter');

    await expect(page.locator('.modal-content')).toBeVisible({ timeout: 10000 });
    // Should show "Main Wallet" next to the affected BTC position
    await expect(page.locator('.modal-content').locator('text=Main Wallet')).toBeVisible();
  });
});
