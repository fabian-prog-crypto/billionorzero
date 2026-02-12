import { test, expect } from './fixtures/test-helpers';

const CMD_K = process.platform === 'darwin' ? 'Meta+k' : 'Control+k';

/**
 * Mock a successful /api/chat response.
 */
function mockChatSuccess(page: import('@playwright/test').Page, response: object) {
  return page.route('**/api/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

test.describe('Command Palette', () => {
  test('opens with Cmd/Ctrl+K and closes with Escape', async ({ seededPage: page }) => {
    // Palette should not be visible initially
    await expect(page.locator('.command-palette-panel')).not.toBeVisible();

    // Open with keyboard shortcut
    await page.keyboard.press(CMD_K);
    await expect(page.locator('.command-palette-panel')).toBeVisible();

    // Input should be focused
    const input = page.locator('.command-palette-input');
    await expect(input).toBeFocused();

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(page.locator('.command-palette-panel')).not.toBeVisible();
  });

  test('shows example command groups when empty', async ({ seededPage: page }) => {
    await page.keyboard.press(CMD_K);
    await expect(page.locator('.command-palette-panel')).toBeVisible();

    // Check example groups are visible
    await expect(page.locator('text=TRADE')).toBeVisible();
    await expect(page.locator('text=QUERY')).toBeVisible();
    await expect(page.locator('text=NAVIGATE')).toBeVisible();
  });

  test('clicking example populates input', async ({ seededPage: page }) => {
    await page.keyboard.press(CMD_K);
    await expect(page.locator('.command-palette-panel')).toBeVisible();

    // Click one of the example commands (rendered with smart quotes)
    const example = page.locator('button', { hasText: 'Bought 10 AAPL at $185' });
    await expect(example).toBeVisible();
    await example.click();

    // Input should now contain the example text
    const input = page.locator('.command-palette-input');
    await expect(input).toHaveValue('Bought 10 AAPL at $185');
  });

  test('submits query and shows mocked LLM response', async ({ seededPage: page }) => {
    // Mock the chat API
    await mockChatSuccess(page, {
      response: 'Your net worth is $120,000.',
      toolCalls: [],
      mutations: false,
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('.command-palette-input');
    await input.fill("What's my net worth?");
    await page.keyboard.press('Enter');

    // Wait for response to appear
    await expect(page.locator('text=Your net worth is $120,000.')).toBeVisible({ timeout: 10000 });
  });

  test('handles 401 with auto-retry (token refresh)', async ({ seededPage: page }) => {
    let callCount = 0;

    // Mock /api/auth/token to return a fresh token
    await page.route('**/api/auth/token', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'fresh-test-token' }),
      });
    });

    // First call returns 401, second succeeds
    await page.route('**/api/chat', async (route) => {
      callCount++;
      if (callCount === 1) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Unauthorized' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: 'Retry succeeded! Your portfolio has 5 positions.',
            toolCalls: [],
            mutations: false,
          }),
        });
      }
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('.command-palette-input');
    await input.fill('How many positions?');
    await page.keyboard.press('Enter');

    // Should see the retry response, not "Unauthorized"
    await expect(page.locator('text=Retry succeeded!')).toBeVisible({ timeout: 10000 });
    expect(callCount).toBe(2);
  });

  test('shows Ollama connection error with Settings link', async ({ seededPage: page }) => {
    // Mock chat API returning Ollama not reachable
    await page.route('**/api/chat', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Ollama not reachable. Make sure Ollama is running (ollama serve).' }),
      });
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('.command-palette-input');
    await input.fill('test query');
    await page.keyboard.press('Enter');

    // Error should mention Ollama
    await expect(page.locator('text=Ollama').first()).toBeVisible({ timeout: 10000 });

    // Settings link should be present
    const settingsLink = page.locator('a[href="/settings"]', { hasText: 'Settings' });
    await expect(settingsLink).toBeVisible();
  });

  test('closes on backdrop click', async ({ seededPage: page }) => {
    await page.keyboard.press(CMD_K);
    await expect(page.locator('.command-palette-panel')).toBeVisible();

    // Click the backdrop at bottom-left corner (away from the centered panel)
    await page.locator('.command-palette-backdrop').click({ position: { x: 10, y: 10 } });

    // Palette should close after animation
    await expect(page.locator('.command-palette-panel')).not.toBeVisible({ timeout: 2000 });
  });

  test('mutation response opens confirmation modal', async ({ seededPage: page }) => {
    // Mock a mutation response with pendingAction (new flow)
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'AAPL',
        name: 'AAPL',
        assetType: 'stock',
        amount: 10,
        pricePerUnit: 185,
        confidence: 0.9,
        summary: 'Buy 10 AAPL at $185',
      },
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('.command-palette-input');
    await input.fill('Buy 10 AAPL at $185');
    await page.keyboard.press('Enter');

    // Confirmation modal should appear (not success checkmark)
    await expect(page.locator('.modal-content')).toBeVisible({ timeout: 10000 });
    // Modal should show the action summary
    await expect(page.locator('text=Buy 10 AAPL at $185')).toBeVisible();
  });

  test('non-confirmable mutation (toggle) still shows success', async ({ seededPage: page }) => {
    // Mock a non-confirmable mutation (toggle) — no pendingAction
    await mockChatSuccess(page, {
      response: 'Balances are now hidden.',
      toolCalls: [{ tool: 'toggle_hide_balances', args: {}, result: { hideBalances: true }, isMutation: true }],
      mutations: true,
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('.command-palette-input');
    await input.fill('Hide balances');
    await page.keyboard.press('Enter');

    // Success checkmark should appear (old flow for non-confirmable mutations)
    await expect(page.locator('.command-palette-success')).toBeVisible({ timeout: 10000 });

    // Palette should auto-close after ~1.2s
    await expect(page.locator('.command-palette-panel')).not.toBeVisible({ timeout: 3000 });
  });
});

// ─── 20 CMD-K Commands E2E ───────────────────────────────────────────────────
// Tests that the 20 most important CMD-K commands are handled correctly
// through the full pipeline: input → submit → response display.

/**
 * Helper: open CMD-K, type a command, submit, and verify the response text appears.
 */
async function submitAndExpect(
  page: import('@playwright/test').Page,
  command: string,
  expectedText: string,
) {
  await page.keyboard.press(CMD_K);
  const input = page.locator('.command-palette-input');
  await input.fill(command);
  await page.keyboard.press('Enter');
  await expect(page.locator(`text=${expectedText}`)).toBeVisible({ timeout: 10000 });
}

/**
 * Helper: open CMD-K, type a mutation command, submit, and verify the confirmation modal opens.
 */
async function submitMutationAndExpectModal(
  page: import('@playwright/test').Page,
  command: string,
) {
  await page.keyboard.press(CMD_K);
  const input = page.locator('.command-palette-input');
  await input.fill(command);
  await page.keyboard.press('Enter');
  // Confirmation modal should appear
  await expect(page.locator('.modal-content')).toBeVisible({ timeout: 10000 });
}

/**
 * Helper: open CMD-K, type a non-confirmable mutation, submit, and verify success.
 */
async function submitMutationAndExpectSuccess(
  page: import('@playwright/test').Page,
  command: string,
) {
  await page.keyboard.press(CMD_K);
  const input = page.locator('.command-palette-input');
  await input.fill(command);
  await page.keyboard.press('Enter');
  await expect(page.locator('.command-palette-success')).toBeVisible({ timeout: 10000 });
}

test.describe('CMD-K Commands — Queries', () => {
  // 1. Net worth
  test('query: net worth', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'Your net worth is $120,500. Gross assets: $135,000, debts: $14,500.',
      toolCalls: [{ tool: 'query_net_worth', args: {}, result: { netWorth: 120500, grossAssets: 135000, totalDebts: 14500 }, isMutation: false }],
      mutations: false,
    });
    await submitAndExpect(page, "What's my net worth?", 'Your net worth is $120,500');
  });

  // 2. Portfolio summary
  test('query: portfolio summary', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'Portfolio: $120,500 net worth. Crypto: $97,500, Equities: $9,500, Cash: $10,000, Other: $11,500.',
      toolCalls: [{ tool: 'query_portfolio_summary', args: {}, result: { netWorth: 120500, cryptoValue: 97500, equityValue: 9500, cashValue: 10000, otherValue: 11500, positionCount: 5, assetCount: 5 }, isMutation: false }],
      mutations: false,
    });
    await submitAndExpect(page, 'Show me my portfolio', 'Portfolio: $120,500 net worth');
  });

  // 3. Top positions
  test('query: top 5 positions', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'Top 5 positions:\n1. BTC: $97,500 (80.7%)\n2. ETH: $32,000 (26.5%)\n3. GOLD: $11,500 (9.5%)\n4. Cash: $10,000 (8.3%)\n5. AAPL: $9,500 (7.9%)',
      toolCalls: [{ tool: 'query_top_positions', args: { count: 5 }, result: [
        { symbol: 'bitcoin', amount: 1.5, value: 97500, allocation: 80.7 },
        { symbol: 'ethereum', amount: 10, value: 32000, allocation: 26.5 },
        { symbol: 'GOLD', amount: 5, value: 11500, allocation: 9.5 },
        { symbol: 'CASH_USD', amount: 10000, value: 10000, allocation: 8.3 },
        { symbol: 'AAPL', amount: 50, value: 9500, allocation: 7.9 },
      ], isMutation: false }],
      mutations: false,
    });
    await submitAndExpect(page, 'Top 5 positions', 'Top 5 positions');
  });

  // 4. Position details
  test('query: BTC position details', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'You hold 1.5 BTC worth $97,500 at $65,000/BTC.',
      toolCalls: [{ tool: 'query_position_details', args: { symbol: 'bitcoin' }, result: { symbol: 'BTC', totalAmount: 1.5, totalValue: 97500, price: 65000, positions: 1 }, isMutation: false }],
      mutations: false,
    });
    await submitAndExpect(page, 'How much BTC do I have?', 'You hold 1.5 BTC worth $97,500');
  });

  // 5. 24h change
  test('query: 24h change', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'Your portfolio changed by +$1,425 (+1.18%) in the last 24 hours.',
      toolCalls: [{ tool: 'query_24h_change', args: {}, result: { change24h: 1425, changePercent24h: 1.18 }, isMutation: false }],
      mutations: false,
    });
    await submitAndExpect(page, 'How much did I gain today?', '+$1,425');
  });

  // 6. Exposure
  test('query: exposure breakdown', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'Exposure: Long $110,500, Short $0, Net $110,500, Leverage 1.0x.',
      toolCalls: [{ tool: 'query_exposure', args: {}, result: { longExposure: 110500, shortExposure: 0, grossExposure: 110500, netExposure: 110500, leverage: 1.0, cashPosition: 10000 }, isMutation: false }],
      mutations: false,
    });
    await submitAndExpect(page, "What's my exposure?", 'Long $110,500');
  });

  // 7. Leverage
  test('query: leverage ratio', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'Your current leverage ratio is 1.0x.',
      toolCalls: [{ tool: 'query_leverage', args: {}, result: { leverage: 1.0 }, isMutation: false }],
      mutations: false,
    });
    await submitAndExpect(page, "What's my leverage?", 'leverage ratio is 1.0x');
  });

  // 8. Debt summary
  test('query: debt summary', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'You have $14,500 in total debts across 2 positions.',
      toolCalls: [{ tool: 'query_debt_summary', args: {}, result: { totalDebt: 14500, positions: [{ symbol: 'USDC', value: -10000, protocol: 'Morpho' }, { symbol: 'DAI', value: -4500, protocol: 'Aave' }] }, isMutation: false }],
      mutations: false,
    });
    await submitAndExpect(page, 'What are my debts?', '$14,500 in total debts');
  });

  // 9. Perps summary
  test('query: perps summary', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'No perpetual futures positions found.',
      toolCalls: [{ tool: 'query_perps_summary', args: {}, result: { hasPerps: false, exchanges: [] }, isMutation: false }],
      mutations: false,
    });
    await submitAndExpect(page, 'Show my futures', 'No perpetual futures');
  });

  // 10. Risk profile
  test('query: risk profile', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'Risk profile: Concentration risk is HIGH (BTC is 80.7% of portfolio). Leverage is LOW at 1.0x.',
      toolCalls: [{ tool: 'query_risk_profile', args: {}, result: { concentrationRisk: 'high', topPosition: { symbol: 'BTC', allocation: 80.7 }, leverage: 1.0 }, isMutation: false }],
      mutations: false,
    });
    await submitAndExpect(page, 'How risky is my portfolio?', 'Concentration risk is HIGH');
  });

  // 11. Position count
  test('query: position count', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'You have 5 positions in your portfolio.',
      toolCalls: [{ tool: 'query_position_count', args: {}, result: { count: 5 }, isMutation: false }],
      mutations: false,
    });
    await submitAndExpect(page, 'How many positions do I have?', 'You have 5 positions');
  });

  // 12. Category value
  test('query: crypto category value', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'Your crypto holdings are worth $129,500 across 2 positions.',
      toolCalls: [{ tool: 'query_category_value', args: { category: 'crypto' }, result: { type: 'crypto', value: 129500, count: 2 }, isMutation: false }],
      mutations: false,
    });
    await submitAndExpect(page, 'How much crypto do I have?', '$129,500');
  });
});

test.describe('CMD-K Commands — Mutations (Confirmation Flow)', () => {
  // 13. Buy position — opens confirmation modal
  test('mutation: buy position opens confirmation modal', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'BTC',
        name: 'BTC',
        assetType: 'crypto',
        amount: 0.5,
        pricePerUnit: 65000,
        confidence: 0.9,
        summary: 'Buy 0.5 BTC at $65000',
      },
    });
    await submitMutationAndExpectModal(page, 'Buy 0.5 BTC');
    await expect(page.locator('text=Buy 0.5 BTC')).toBeVisible();
  });

  // 14. Sell partial — opens confirmation modal
  test('mutation: sell partial opens confirmation modal', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'sell_partial',
        symbol: 'ETH',
        assetType: 'crypto',
        sellPercent: 50,
        confidence: 0.9,
        summary: 'Sell 50% of ETH',
      },
    });
    await submitMutationAndExpectModal(page, 'Sell half my ETH');
    await expect(page.locator('text=Sell 50% of ETH')).toBeVisible();
  });

  // 15. Sell all — opens confirmation modal
  test('mutation: sell all opens confirmation modal', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'sell_all',
        symbol: 'DOGE',
        assetType: 'crypto',
        confidence: 0.9,
        summary: 'Sell all DOGE',
      },
    });
    await submitMutationAndExpectModal(page, 'Sell all my DOGE');
    await expect(page.locator('text=Sell all DOGE')).toBeVisible();
  });

  // 16. Remove position — opens confirmation modal
  test('mutation: remove position opens confirmation modal', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'remove',
        symbol: 'DOGE',
        assetType: 'crypto',
        confidence: 0.9,
        summary: 'Remove DOGE from portfolio',
      },
    });
    await submitMutationAndExpectModal(page, 'Remove DOGE');
    await expect(page.locator('text=Remove DOGE from portfolio')).toBeVisible();
  });

  // 17. Update position — opens confirmation modal
  test('mutation: update position opens confirmation modal', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'update_position',
        symbol: 'BTC',
        assetType: 'crypto',
        amount: 0.6,
        confidence: 0.9,
        summary: 'Update BTC position',
      },
    });
    await submitMutationAndExpectModal(page, 'Update BTC amount to 0.6');
    await expect(page.locator('text=Update BTC position')).toBeVisible();
  });

  // 18. Set custom price — opens confirmation modal
  test('mutation: set custom price opens confirmation modal', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'set_price',
        symbol: 'BTC',
        assetType: 'crypto',
        newPrice: 65000,
        confidence: 0.9,
        summary: 'Set BTC price to $65000',
      },
    });
    await submitMutationAndExpectModal(page, 'Set BTC price to $65000');
    await expect(page.locator('text=Set BTC price to $65000')).toBeVisible();
  });

  // 19. Add cash — opens confirmation modal
  test('mutation: add cash opens confirmation modal', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'add_cash',
        symbol: 'EUR',
        assetType: 'cash',
        amount: 5000,
        currency: 'EUR',
        accountName: 'Revolut',
        confidence: 0.9,
        summary: 'Add 5000 EUR to Revolut',
      },
    });
    await submitMutationAndExpectModal(page, '5000 EUR to Revolut');
    await expect(page.locator('text=Add 5000 EUR to Revolut')).toBeVisible();
  });

  // 20. Toggle hide balances — non-confirmable, shows success
  test('mutation: toggle hide balances shows success (no modal)', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'Balances are now hidden.',
      toolCalls: [{ tool: 'toggle_hide_balances', args: {}, result: { hideBalances: true }, isMutation: true }],
      mutations: true,
    });
    await submitMutationAndExpectSuccess(page, 'Hide balances');
  });
});
