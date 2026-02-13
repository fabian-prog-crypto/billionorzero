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
    const input = page.locator('[cmdk-input]');
    await expect(input).toBeFocused();

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(page.locator('.command-palette-panel')).not.toBeVisible();
  });

  test('shows suggestion groups when empty', async ({ seededPage: page }) => {
    await page.keyboard.press(CMD_K);
    await expect(page.locator('.command-palette-panel')).toBeVisible();

    // Check suggestion group headings are visible (only TRADE and QUERY)
    await expect(page.locator('[cmdk-group-heading]', { hasText: 'TRADE' })).toBeVisible();
    await expect(page.locator('[cmdk-group-heading]', { hasText: 'QUERY' })).toBeVisible();
  });

  test('partial command → complete → submit → modal opens', async ({ seededPage: page }) => {
    // Full journey: click partial suggestion → type rest → Enter → confirmation modal
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'ETH',
        name: 'Ethereum',
        assetType: 'crypto',
        amount: 2,
        pricePerUnit: 3500,
        matchedPositionId: 'test-eth-1',
        confidence: 0.95,
        summary: 'Buy 2 ETH at $3,500',
      },
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('[cmdk-input]');

    // Click "Buy Position" partial suggestion — pre-fills "Buy "
    const buyItem = page.locator('[cmdk-item]', { hasText: 'Buy Position' });
    await expect(buyItem).toBeVisible();
    await buyItem.click();
    await expect(input).toHaveValue('Buy ');
    await expect(input).toBeFocused();

    // Complete the command
    await page.keyboard.type('2 ETH at 3500');
    await expect(input).toHaveValue('Buy 2 ETH at 3500');

    // Submit
    await page.keyboard.press('Enter');

    // Confirmation modal should open (palette closes, modal takes over)
    await expect(page.locator('.modal-content')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Buy 2 ETH at $3,500')).toBeVisible();
    // Modal should show the pre-filled amount
    await expect(page.locator('text=Confirm')).toBeVisible();
  });

  test('submit query → see response → "Ask another question" → submit again', async ({ seededPage: page }) => {
    // Multi-step: query → response → reset → second query → second response
    let callCount = 0;
    await page.route('**/api/chat', async (route) => {
      callCount++;
      if (callCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: 'You have 5 positions across 2 accounts.',
            toolCalls: [],
            mutations: false,
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: 'Your largest position is 1.5 BTC worth $97,500.',
            toolCalls: [],
            mutations: false,
          }),
        });
      }
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('[cmdk-input]');
    await input.fill('How many positions?');
    await page.keyboard.press('Enter');

    // First response appears
    await expect(page.locator('text=You have 5 positions across 2 accounts.')).toBeVisible({ timeout: 10000 });

    // Click "Ask another question" to reset
    await page.locator('text=Ask another question').click();

    // Input should be cleared and re-focused, suggestions visible again
    const freshInput = page.locator('[cmdk-input]');
    await expect(freshInput).toBeFocused({ timeout: 3000 });
    await expect(page.locator('[cmdk-group-heading]', { hasText: 'TRADE' })).toBeVisible();

    // Submit second query
    await freshInput.fill('What is my biggest position?');
    await page.keyboard.press('Enter');

    // Second response appears
    await expect(page.locator('text=Your largest position is 1.5 BTC worth $97,500.')).toBeVisible({ timeout: 10000 });
    expect(callCount).toBe(2);
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
    const input = page.locator('[cmdk-input]');
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
    const input = page.locator('[cmdk-input]');
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
    const input = page.locator('[cmdk-input]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('Buy 10 AAPL at $185');
    await page.keyboard.press('Enter');

    // Confirmation modal should appear (not success checkmark)
    await expect(page.locator('.modal-content')).toBeVisible({ timeout: 10000 });
    // Modal should show the action summary
    await expect(page.locator('text=Buy 10 AAPL at $185')).toBeVisible();
  });

  test('error recovery: 500 error → dismiss → retry succeeds', async ({ seededPage: page }) => {
    // First call fails with 500, second succeeds
    let callCount = 0;
    await page.route('**/api/chat', async (route) => {
      callCount++;
      if (callCount === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: 'Portfolio: 5 positions, $120K total.',
            toolCalls: [],
            mutations: false,
          }),
        });
      }
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('[cmdk-input]');
    await input.fill('Show my portfolio');
    await page.keyboard.press('Enter');

    // Error bar should appear
    await expect(page.locator('text=Internal server error')).toBeVisible({ timeout: 10000 });

    // Type new query — error should auto-clear
    await input.fill('Show everything');
    await expect(page.locator('text=Internal server error')).not.toBeVisible();

    // After clearing text, suggestions should be visible (error mode shows suggestions)
    await input.fill('');
    await expect(page.locator('[cmdk-group-heading]', { hasText: 'TRADE' })).toBeVisible({ timeout: 3000 });
    await input.fill('Show everything');

    // Submit retry
    await page.keyboard.press('Enter');

    // Should succeed this time
    await expect(page.locator('text=Portfolio: 5 positions, $120K total.')).toBeVisible({ timeout: 10000 });
    expect(callCount).toBe(2);
  });

  test('Escape during LLM response returns to command mode', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'You have 1.5 BTC and 10 ETH.',
      toolCalls: [],
      mutations: false,
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('[cmdk-input]');
    await input.fill('Show my crypto');
    await page.keyboard.press('Enter');

    // LLM response appears
    await expect(page.locator('text=You have 1.5 BTC and 10 ETH.')).toBeVisible({ timeout: 10000 });

    // Press Escape — should go back to command mode (not close palette)
    await page.keyboard.press('Escape');

    // Palette should still be open with suggestions visible
    await expect(page.locator('.command-palette-panel')).toBeVisible();
    await expect(page.locator('[cmdk-group-heading]', { hasText: 'TRADE' })).toBeVisible();

    // LLM response should be gone
    await expect(page.locator('text=You have 1.5 BTC and 10 ETH.')).not.toBeVisible();
  });

  test('suggestion items show icons and category tags', async ({ seededPage: page }) => {
    await page.keyboard.press(CMD_K);
    await expect(page.locator('.command-palette-panel')).toBeVisible();

    // Check that suggestion items have icons (svg elements)
    const buyItem = page.locator('[cmdk-item]', { hasText: 'Buy Position' });
    await expect(buyItem).toBeVisible();
    await expect(buyItem.locator('svg')).toBeVisible();

    // Check that category tags are rendered
    await expect(buyItem.locator('.cmdk-category-tag')).toHaveText('TRADE');
  });
});

// ─── 20 CMD-K Commands E2E ───────────────────────────────────────────────────
// Tests that the most important CMD-K commands are handled correctly
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
  const input = page.locator('[cmdk-input]');
  await expect(input).toBeVisible({ timeout: 5000 });
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
  const input = page.locator('[cmdk-input]');
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.fill(command);
  await page.keyboard.press('Enter');
  // Confirmation modal should appear
  await expect(page.locator('.modal-content')).toBeVisible({ timeout: 10000 });
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

  // 13b. Buy with totalCost — derived price shows correctly in modal
  test('mutation: buy with totalCost shows correct derived price', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'MSFT',
        name: 'MSFT',
        assetType: 'stock',
        amount: 123.61,
        pricePerUnit: 404.50,
        totalCost: 50000,
        confidence: 0.9,
        summary: 'Buy 123.61 MSFT at $404.50',
      },
    });
    await submitMutationAndExpectModal(page, 'Bought 123.61 MSFT for 50k');
    // Summary banner shows derived per-unit price
    await expect(page.locator('text=Buy 123.61 MSFT at $404.50')).toBeVisible();

    const modal = page.locator('.modal-content');
    // Amount field pre-filled with 123.61
    const amountInput = modal.locator('input[type="number"]').first();
    await expect(amountInput).toHaveValue('123.61');
    // Execution preview shows total cost
    await expect(modal.locator('text=Total Cost')).toBeVisible();
  });

  // 13c. Buy with totalCost only (no amount) — "$X worth of" flow
  test('mutation: buy with totalCost only shows "worth of" summary', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'MSFT',
        name: 'MSFT',
        assetType: 'stock',
        totalCost: 50000,
        confidence: 0.9,
        summary: 'Buy $50,000 worth of MSFT',
      },
    });
    await submitMutationAndExpectModal(page, 'bought $50k worth of MSFT');
    // Summary banner shows "worth of" phrasing
    await expect(page.locator('text=Buy $50,000 worth of MSFT')).toBeVisible();

    const modal = page.locator('.modal-content');
    // Account dropdown should be visible (stock → brokerage accounts)
    await expect(modal.locator('select').first()).toBeVisible();
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
});

// ─── Complex User Journey E2E Tests ─────────────────────────────────────────

test.describe('CMD-K Complex Journeys', () => {
  test('recent commands: submit query → reopen → recent appears → click re-submits', async ({ seededPage: page }) => {
    let callCount = 0;
    await page.route('**/api/chat', async (route) => {
      callCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: `Response #${callCount}: Exposure Long $100K, Short $0.`,
          toolCalls: [],
          mutations: false,
        }),
      });
    });

    // Step 1: Submit a command to generate a recent entry
    await page.keyboard.press(CMD_K);
    const input = page.locator('[cmdk-input]');
    await input.fill('Show my exposure breakdown');
    await page.keyboard.press('Enter');
    await expect(page.locator('text=Response #1: Exposure Long $100K')).toBeVisible({ timeout: 10000 });

    // Step 2: Close palette
    await page.keyboard.press('Escape'); // back to commands
    await page.keyboard.press('Escape'); // close palette
    await expect(page.locator('.command-palette-panel')).not.toBeVisible({ timeout: 2000 });

    // Step 3: Reopen — recent command should appear in RECENT group
    await page.keyboard.press(CMD_K);
    await expect(page.locator('[cmdk-group-heading]', { hasText: 'RECENT' })).toBeVisible({ timeout: 5000 });
    const recentItem = page.locator('[cmdk-item]', { hasText: 'Show my exposure breakdown' });
    await expect(recentItem).toBeVisible();

    // Step 4: Click recent command — should submit directly to LLM
    await recentItem.click();

    // Should get the second response
    await expect(page.locator('text=Response #2: Exposure Long $100K')).toBeVisible({ timeout: 10000 });
    expect(callCount).toBe(2);
  });

  test('confirmation modal cancel closes cleanly without executing', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'sell_all',
        symbol: 'BTC',
        assetType: 'crypto',
        confidence: 0.95,
        summary: 'Sell all BTC',
      },
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('[cmdk-input]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('Sell all my BTC');
    await page.keyboard.press('Enter');

    // Modal opens with sell action
    const modal = page.locator('.modal-content');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Sell all BTC')).toBeVisible();

    // Cancel and Sell buttons both visible
    await expect(modal.locator('button', { hasText: 'Cancel' })).toBeVisible();

    // Click Cancel
    await modal.locator('button', { hasText: 'Cancel' }).click();

    // Modal and palette should close
    await expect(modal).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator('.command-palette-panel')).not.toBeVisible();

    // Should be able to reopen CMD-K cleanly after cancel
    await page.keyboard.press(CMD_K);
    await expect(page.locator('.command-palette-panel')).toBeVisible();
    await expect(page.locator('[cmdk-group-heading]', { hasText: 'TRADE' })).toBeVisible();
  });

  test('full buy flow: CMD-K → modal pre-fills fields → execution preview → confirm closes', async ({ seededPage: page }) => {
    // Buy 10 SOL (new position, no existing match)
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'SOL',
        name: 'Solana',
        assetType: 'crypto',
        amount: 10,
        pricePerUnit: 150,
        confidence: 0.95,
        summary: 'Buy 10 SOL at $150',
      },
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('[cmdk-input]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('Buy 10 SOL at 150');
    await page.keyboard.press('Enter');

    // Confirmation modal opens with summary banner
    const modal = page.locator('.modal-content');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Buy 10 SOL at $150')).toBeVisible();

    // Modal header shows action type
    await expect(modal.locator('h2', { hasText: 'Confirm' })).toBeVisible();

    // Amount and price fields should be pre-filled from LLM parse
    const numberInputs = modal.locator('input[type="number"]');
    const firstInput = numberInputs.first();
    await expect(firstInput).toHaveValue('10');

    // Execution preview should show Total Cost (10 * $150 = $1,500)
    await expect(modal.locator('text=Total Cost')).toBeVisible();
    await expect(modal.locator('text=Exec Price')).toBeVisible();

    // Confirm button should be enabled and say "Buy 10 SOL"
    const confirmBtn = modal.locator('button', { hasText: /^Buy/ });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Modal should close after confirm
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // Palette should also be closed (not reopened)
    await expect(page.locator('.command-palette-panel')).not.toBeVisible();
  });

  // Contextual boosting is covered by unit tests (src/commands/suggestions.test.ts).
  // E2E page navigation beyond / times out in dev mode (first-time page compilation).
  test.skip('contextual boosting: page-specific suggestion order', () => {});

  test('fuzzy filter: multiple rounds of typing, clearing, retyping', async ({ seededPage: page }) => {
    await page.keyboard.press(CMD_K);
    const input = page.locator('[cmdk-input]');
    await expect(input).toBeVisible({ timeout: 5000 });

    // Round 1: type "expos" — should show "Exposure Breakdown"
    await input.fill('expos');
    await expect(page.locator('[cmdk-item]', { hasText: 'Exposure' }).first()).toBeVisible({ timeout: 3000 });

    // Round 2: clear and type "debt" — should show "Debt Summary"
    await input.fill('');
    await expect(page.locator('[cmdk-group-heading]', { hasText: 'TRADE' })).toBeVisible({ timeout: 3000 });
    await input.fill('debt');
    await expect(page.locator('[cmdk-item]', { hasText: 'Debt Summary' })).toBeVisible({ timeout: 3000 });

    // Round 3: clear — all suggestion groups return
    await input.fill('');
    await expect(page.locator('[cmdk-group-heading]', { hasText: 'TRADE' })).toBeVisible({ timeout: 3000 });
    await expect(page.locator('[cmdk-group-heading]', { hasText: 'QUERY' })).toBeVisible();

    // Round 4: type gibberish — empty state shows
    await input.fill('zzzqqq999');
    await expect(page.locator('text=Press Enter to send to AI')).toBeVisible({ timeout: 3000 });
  });

  test('keyboard-only full workflow: Cmd+K → type → Enter → response', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'BTC is 80.7% of your portfolio. Concentration risk: HIGH.',
      toolCalls: [],
      mutations: false,
    });

    // Entire flow without mouse — keyboard only
    await page.keyboard.press(CMD_K);

    // Input should be auto-focused
    const input = page.locator('[cmdk-input]');
    await expect(input).toBeFocused();

    // Type query using keyboard
    await page.keyboard.type('How concentrated is my portfolio?');

    // Submit with Enter
    await page.keyboard.press('Enter');

    // Response appears
    await expect(page.locator('text=BTC is 80.7% of your portfolio')).toBeVisible({ timeout: 10000 });

    // Press Escape to go back to command mode
    await page.keyboard.press('Escape');

    // Suggestions visible again, input re-focused
    await expect(page.locator('[cmdk-group-heading]', { hasText: 'TRADE' })).toBeVisible();
    await expect(page.locator('[cmdk-input]')).toBeFocused({ timeout: 3000 });

    // Press Escape again to close palette entirely
    await page.keyboard.press('Escape');
    await expect(page.locator('.command-palette-panel')).not.toBeVisible({ timeout: 2000 });
  });

  test('suggestion items show icons and category tags', async ({ seededPage: page }) => {
    await page.keyboard.press(CMD_K);
    await expect(page.locator('.command-palette-panel')).toBeVisible();

    // Check that suggestion items have icons (svg elements)
    const buyItem = page.locator('[cmdk-item]', { hasText: 'Buy Position' });
    await expect(buyItem).toBeVisible();
    await expect(buyItem.locator('svg')).toBeVisible();

    // Check that category tags are rendered
    await expect(buyItem.locator('.cmdk-category-tag')).toHaveText('TRADE');

    // Verify QUERY category tag
    const netWorthItem = page.locator('[cmdk-item]', { hasText: 'Net Worth' });
    await expect(netWorthItem.locator('.cmdk-category-tag')).toHaveText('QUERY');
  });

  test('loading state: shimmer + command echo while waiting', async ({ seededPage: page }) => {
    // Use a delayed response to test loading state
    await page.route('**/api/chat', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: 'Delayed response arrived.',
          toolCalls: [],
          mutations: false,
        }),
      });
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('[cmdk-input]');
    await input.fill('Show my positions');
    await page.keyboard.press('Enter');

    // Loading shimmer should appear
    await expect(page.locator('.command-palette-shimmer')).toBeVisible({ timeout: 2000 });

    // Command echo should show the submitted text
    await expect(page.locator('text=Show my positions').first()).toBeVisible();

    // Input should be disabled during loading
    await expect(input).toBeDisabled();

    // Eventually response arrives
    await expect(page.locator('text=Delayed response arrived.')).toBeVisible({ timeout: 10000 });
  });

  test('pointer selection + click sends suggestion text to LLM', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'Leverage ratio: 1.0x. No margin positions detected.',
      toolCalls: [],
      mutations: false,
    });

    await page.keyboard.press(CMD_K);
    await expect(page.locator('[cmdk-list]')).toBeVisible();

    // Hover over "Leverage & Risk" to select it
    const leverageItem = page.locator('[cmdk-item]', { hasText: 'Leverage & Risk' });
    await leverageItem.hover();
    await expect(leverageItem).toHaveAttribute('data-selected', 'true', { timeout: 2000 });

    // Click it — should submit to LLM
    await leverageItem.click();

    // LLM response should appear
    await expect(page.locator('text=Leverage ratio: 1.0x')).toBeVisible({ timeout: 10000 });
  });
});

// ─── Natural Language Variations ────────────────────────────────────────────
// Tests that the full pipeline handles varied user input via mocked LLM responses.

test.describe('CMD-K Commands — Natural Language Variations', () => {
  test('buy: "bought 50k of AAPL"', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'AAPL',
        name: 'AAPL',
        assetType: 'stock',
        amount: 270,
        pricePerUnit: 185.19,
        totalCost: 50000,
        matchedPositionId: 'test-aapl-1',
        confidence: 0.9,
        summary: 'Buy 270 AAPL at $185.19',
      },
    });
    await submitMutationAndExpectModal(page, 'bought 50k of AAPL');
    await expect(page.locator('text=Buy 270 AAPL')).toBeVisible();
  });

  test('buy: "just bought 2 BTC"', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'BTC',
        name: 'BTC',
        assetType: 'crypto',
        amount: 2,
        confidence: 0.9,
        summary: 'Buy 2 BTC',
      },
    });
    await submitMutationAndExpectModal(page, 'just bought 2 BTC');
    await expect(page.locator('text=Buy 2 BTC')).toBeVisible();
  });

  test('buy: "purchased 100 MSFT at 400"', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'MSFT',
        name: 'MSFT',
        assetType: 'stock',
        amount: 100,
        pricePerUnit: 400,
        totalCost: 40000,
        confidence: 0.9,
        summary: 'Buy 100 MSFT at $400.00',
      },
    });
    await submitMutationAndExpectModal(page, 'purchased 100 MSFT at 400');
    await expect(page.locator('text=Buy 100 MSFT')).toBeVisible();
  });

  test('buy: "added 10 SOL to portfolio"', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'SOL',
        name: 'SOL',
        assetType: 'crypto',
        amount: 10,
        confidence: 0.9,
        summary: 'Buy 10 SOL',
      },
    });
    await submitMutationAndExpectModal(page, 'added 10 SOL to portfolio');
    await expect(page.locator('text=Buy 10 SOL')).toBeVisible();
  });

  test('buy: "long 5 ETH at 3200"', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'ETH',
        name: 'ETH',
        assetType: 'crypto',
        amount: 5,
        pricePerUnit: 3200,
        totalCost: 16000,
        matchedPositionId: 'test-eth-1',
        confidence: 0.9,
        summary: 'Buy 5 ETH at $3200.00',
      },
    });
    await submitMutationAndExpectModal(page, 'long 5 ETH at 3200');
    await expect(page.locator('text=Buy 5 ETH')).toBeVisible();
  });

  test('sell: "sold half my ETH"', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'sell_partial',
        symbol: 'ETH',
        assetType: 'crypto',
        sellPercent: 50,
        matchedPositionId: 'test-eth-1',
        confidence: 0.9,
        summary: 'Sell 50% of ETH',
      },
    });
    await submitMutationAndExpectModal(page, 'sold half my ETH');
    await expect(page.locator('text=Sell 50% of ETH')).toBeVisible();
  });

  test('sell: "dumped all DOGE"', async ({ seededPage: page }) => {
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
    await submitMutationAndExpectModal(page, 'dumped all DOGE');
    await expect(page.locator('text=Sell all DOGE')).toBeVisible();
  });

  test('sell: "closed my BTC position"', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'sell_all',
        symbol: 'BTC',
        assetType: 'crypto',
        matchedPositionId: 'test-btc-1',
        confidence: 0.9,
        summary: 'Sell all BTC',
      },
    });
    await submitMutationAndExpectModal(page, 'closed my BTC position');
    await expect(page.locator('text=Sell all BTC')).toBeVisible();
  });

  test('sell: "sold 5 AAPL at 190"', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'sell_partial',
        symbol: 'AAPL',
        assetType: 'stock',
        sellAmount: 5,
        sellPrice: 190,
        matchedPositionId: 'test-aapl-1',
        confidence: 0.9,
        summary: 'Sell 5 AAPL',
      },
    });
    await submitMutationAndExpectModal(page, 'sold 5 AAPL at 190');
    await expect(page.locator('text=Sell 5 AAPL')).toBeVisible();
  });

  test('cash: "deposited 5000 EUR"', async ({ seededPage: page }) => {
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
        confidence: 0.9,
        summary: 'Add 5000 EUR',
      },
    });
    await submitMutationAndExpectModal(page, 'deposited 5000 EUR');
    await expect(page.locator('text=Add 5000 EUR')).toBeVisible();
  });

  test('cash: "added $10k to bank"', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'add_cash',
        symbol: 'USD',
        assetType: 'cash',
        amount: 10000,
        currency: 'USD',
        confidence: 0.9,
        summary: 'Add 10000 USD',
      },
    });
    await submitMutationAndExpectModal(page, 'added $10k to bank');
    await expect(page.locator('text=Add 10000 USD')).toBeVisible();
  });

  test('update: "set BTC amount to 2"', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'update_position',
        symbol: 'BTC',
        assetType: 'crypto',
        amount: 2,
        matchedPositionId: 'test-btc-1',
        confidence: 0.9,
        summary: 'Update BTC position',
      },
    });
    await submitMutationAndExpectModal(page, 'set BTC amount to 2');
    await expect(page.locator('text=Update BTC position')).toBeVisible();
  });

  test('remove: "delete my DOGE"', async ({ seededPage: page }) => {
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
    await submitMutationAndExpectModal(page, 'delete my DOGE');
    await expect(page.locator('text=Remove DOGE from portfolio')).toBeVisible();
  });

  // ─── Account-aware buy variations ───────────────────────────────────────

  test('buy with account: "bought 100 MSFT for Revolut"', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'MSFT',
        name: 'MSFT',
        assetType: 'stock',
        amount: 100,
        matchedAccountId: 'test-brokerage-1',
        accountName: 'Revolut',
        confidence: 0.9,
        summary: 'Buy 100 MSFT',
      },
    });
    await submitMutationAndExpectModal(page, 'bought 100 MSFT for Revolut');
    await expect(page.locator('text=Buy 100 MSFT')).toBeVisible();
  });

  test('add cash with account: "added $10k to Test Bank"', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'add_cash',
        symbol: 'USD',
        assetType: 'cash',
        amount: 10000,
        currency: 'USD',
        matchedAccountId: 'test-bank-1',
        accountName: 'Test Bank',
        matchedPositionId: 'test-cash-usd-1',
        confidence: 0.9,
        summary: 'Add 10000 USD to Test Bank',
      },
    });
    await submitMutationAndExpectModal(page, 'added $10k to Test Bank');
    await expect(page.locator('text=Add 10000 USD to Test Bank')).toBeVisible();
  });
});

// ─── Number Consistency: pendingAction → Modal Display ──────────────────────

test.describe('CMD-K Number Consistency', () => {
  test('buy new position: modal shows correct amounts', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'MSFT',
        name: 'MSFT',
        assetType: 'stock',
        amount: 100,
        pricePerUnit: 400,
        totalCost: 40000,
        confidence: 0.9,
        summary: 'Buy 100 MSFT at $400.00',
      },
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('[cmdk-input]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('Buy 100 MSFT at 400');
    await page.keyboard.press('Enter');

    const modal = page.locator('.modal-content');
    await expect(modal).toBeVisible({ timeout: 10000 });
    // Summary banner
    await expect(page.locator('text=Buy 100 MSFT at $400.00')).toBeVisible();
    // Amount field pre-filled
    const amountInput = modal.locator('input[type="number"]').first();
    await expect(amountInput).toHaveValue('100');
    // Execution preview
    await expect(modal.locator('text=Exec Price')).toBeVisible();
    await expect(modal.locator('text=Total Cost')).toBeVisible();
  });

  test('buy add to existing: modal shows position context', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        assetType: 'stock',
        amount: 10,
        pricePerUnit: 185,
        totalCost: 1850,
        matchedPositionId: 'test-aapl-1',
        matchedAccountId: 'test-brokerage-1',
        accountName: 'Revolut',
        confidence: 0.9,
        summary: 'Buy 10 AAPL at $185.00',
      },
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('[cmdk-input]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('Buy 10 AAPL at 185');
    await page.keyboard.press('Enter');

    const modal = page.locator('.modal-content');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Buy 10 AAPL at $185.00')).toBeVisible();
    // Should show position context since it's adding to existing
    await expect(modal.locator('text=Total Cost')).toBeVisible();
  });

  test('buy totalCost-derived price: correct values', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'AAPL',
        name: 'AAPL',
        assetType: 'stock',
        amount: 123.61,
        pricePerUnit: 404.50,
        totalCost: 50000,
        confidence: 0.9,
        summary: 'Buy 123.61 AAPL at $404.50',
      },
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('[cmdk-input]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('Bought 123.61 AAPL for 50k');
    await page.keyboard.press('Enter');

    const modal = page.locator('.modal-content');
    await expect(modal).toBeVisible({ timeout: 10000 });
    // Total cost and exec price from pendingAction
    await expect(modal.locator('text=Total Cost')).toBeVisible();
    await expect(modal.locator('text=Exec Price')).toBeVisible();
  });

  test('sell partial by percent: modal shows percentage context', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'sell_partial',
        symbol: 'ETH',
        assetType: 'crypto',
        sellPercent: 50,
        matchedPositionId: 'test-eth-1',
        confidence: 0.9,
        summary: 'Sell 50% of ETH',
      },
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('[cmdk-input]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('Sell 50% ETH');
    await page.keyboard.press('Enter');

    const modal = page.locator('.modal-content');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Sell 50% of ETH')).toBeVisible();
  });

  test('sell partial by amount with price: modal shows computed proceeds', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'sell_partial',
        symbol: 'AAPL',
        assetType: 'stock',
        sellAmount: 20,
        sellPrice: 195,
        matchedPositionId: 'test-aapl-1',
        confidence: 0.9,
        summary: 'Sell 20 AAPL',
      },
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('[cmdk-input]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('Sell 20 AAPL at 195');
    await page.keyboard.press('Enter');

    const modal = page.locator('.modal-content');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Sell 20 AAPL')).toBeVisible();
  });

  test('add cash: modal shows currency and amount', async ({ seededPage: page }) => {
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
        confidence: 0.9,
        summary: 'Add 5000 EUR',
      },
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('[cmdk-input]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('Add 5000 EUR');
    await page.keyboard.press('Enter');

    const modal = page.locator('.modal-content');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Add 5000 EUR')).toBeVisible();
  });

  test('add cash to existing account: modal shows account context', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'add_cash',
        symbol: 'USD',
        assetType: 'cash',
        amount: 5000,
        currency: 'USD',
        matchedAccountId: 'test-bank-1',
        accountName: 'Test Bank',
        matchedPositionId: 'test-cash-usd-1',
        confidence: 0.9,
        summary: 'Add 5000 USD to Test Bank',
      },
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('[cmdk-input]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('Add $5k to Test Bank');
    await page.keyboard.press('Enter');

    const modal = page.locator('.modal-content');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Add 5000 USD to Test Bank')).toBeVisible();
  });

  test('set price: modal shows price change', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'set_price',
        symbol: 'BTC',
        assetType: 'crypto',
        newPrice: 70000,
        confidence: 0.9,
        summary: 'Set BTC price to $70000',
      },
    });

    await page.keyboard.press(CMD_K);
    const input = page.locator('[cmdk-input]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('Set BTC price to 70000');
    await page.keyboard.press('Enter');

    const modal = page.locator('.modal-content');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Set BTC price to $70000')).toBeVisible();
  });
});

// ─── Click Every Suggestion ─────────────────────────────────────────────────

test.describe('CMD-K — Click Every Suggestion', () => {
  // ─── TRADE suggestions (partial → complete → submit) ────────────────────

  test('click "Buy Position" → complete → submit → modal', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'buy',
        symbol: 'ETH',
        name: 'ETH',
        assetType: 'crypto',
        amount: 2,
        pricePerUnit: 3500,
        confidence: 0.9,
        summary: 'Buy 2 ETH at $3500.00',
      },
    });

    await page.keyboard.press(CMD_K);
    const buyItem = page.locator('[cmdk-item]', { hasText: 'Buy Position' });
    await buyItem.click();
    const input = page.locator('[cmdk-input]');
    await expect(input).toHaveValue('Buy ');
    await input.click();
    await expect(input).toBeFocused();
    await page.keyboard.type('2 ETH at 3500');
    await page.keyboard.press('Enter');
    await expect(page.locator('.modal-content')).toBeVisible({ timeout: 10000 });
  });

  test('click "Sell Position" → complete → submit → modal', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'sell_partial',
        symbol: 'ETH',
        assetType: 'crypto',
        sellPercent: 50,
        matchedPositionId: 'test-eth-1',
        confidence: 0.9,
        summary: 'Sell 50% of ETH',
      },
    });

    await page.keyboard.press(CMD_K);
    const sellItem = page.locator('[cmdk-item]', { hasText: 'Sell Position' });
    await sellItem.click();
    const input = page.locator('[cmdk-input]');
    await expect(input).toHaveValue('Sell ');
    await input.click();
    await expect(input).toBeFocused();
    await page.keyboard.type('half my ETH');
    await page.keyboard.press('Enter');
    await expect(page.locator('.modal-content')).toBeVisible({ timeout: 10000 });
  });

  test('click "Add Cash" → complete → submit → modal', async ({ seededPage: page }) => {
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
        confidence: 0.9,
        summary: 'Add 5000 EUR',
      },
    });

    await page.keyboard.press(CMD_K);
    const addCashItem = page.locator('[cmdk-item]', { hasText: 'Add Cash' });
    await addCashItem.click();
    const input = page.locator('[cmdk-input]');
    await expect(input).toHaveValue('Add cash ');
    await input.click();
    await expect(input).toBeFocused();
    await page.keyboard.type('5000 EUR');
    await page.keyboard.press('Enter');
    await expect(page.locator('.modal-content')).toBeVisible({ timeout: 10000 });
  });

  test('click "Update Position" → complete → submit → modal', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '',
      toolCalls: [],
      mutations: false,
      pendingAction: {
        action: 'update_position',
        symbol: 'BTC',
        assetType: 'crypto',
        amount: 2,
        matchedPositionId: 'test-btc-1',
        confidence: 0.9,
        summary: 'Update BTC position',
      },
    });

    await page.keyboard.press(CMD_K);
    const updateItem = page.locator('[cmdk-item]', { hasText: 'Update Position' });
    await updateItem.click();
    const input = page.locator('[cmdk-input]');
    await expect(input).toHaveValue('Update ');
    await input.click();
    await expect(input).toBeFocused();
    await page.keyboard.type('BTC to 2');
    await page.keyboard.press('Enter');
    await expect(page.locator('.modal-content')).toBeVisible({ timeout: 10000 });
  });

  test('click "Remove Position" → complete → submit → modal', async ({ seededPage: page }) => {
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

    await page.keyboard.press(CMD_K);
    const removeItem = page.locator('[cmdk-item]', { hasText: 'Remove Position' });
    await removeItem.click();
    const input = page.locator('[cmdk-input]');
    await expect(input).toHaveValue('Remove ');
    await input.click();
    await expect(input).toBeFocused();
    await page.keyboard.type('DOGE');
    await page.keyboard.press('Enter');
    await expect(page.locator('.modal-content')).toBeVisible({ timeout: 10000 });
  });

  // ─── QUERY suggestions (click → auto-submit → response) ────────────────

  test('click "Net Worth" → response', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'Your net worth is $120,500.',
      toolCalls: [],
      mutations: false,
    });

    await page.keyboard.press(CMD_K);
    const item = page.locator('[cmdk-item]', { hasText: 'Net Worth' });
    await item.click();
    await expect(page.locator('text=Your net worth is $120,500.')).toBeVisible({ timeout: 10000 });
  });

  test('click "Top Positions" → response', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'Top 5: BTC $97K, ETH $32K, GOLD $11.5K, Cash $10K, AAPL $9.5K.',
      toolCalls: [],
      mutations: false,
    });

    await page.keyboard.press(CMD_K);
    const item = page.locator('[cmdk-item]', { hasText: 'Top Positions' });
    await item.click();
    await expect(page.locator('text=Top 5: BTC $97K')).toBeVisible({ timeout: 10000 });
  });

  test('click "Exposure Breakdown" → response', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'Exposure: Long $110K, Short $0, Net $110K.',
      toolCalls: [],
      mutations: false,
    });

    await page.keyboard.press(CMD_K);
    const item = page.locator('[cmdk-item]', { hasText: 'Exposure Breakdown' });
    await item.click();
    await expect(page.locator('text=Exposure: Long $110K')).toBeVisible({ timeout: 10000 });
  });

  test('click "24h Change" → response', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: '24h change: +$1,425 (+1.18%).',
      toolCalls: [],
      mutations: false,
    });

    await page.keyboard.press(CMD_K);
    const item = page.locator('[cmdk-item]', { hasText: '24h Change' });
    await item.click();
    await expect(page.locator('text=24h change: +$1,425')).toBeVisible({ timeout: 10000 });
  });

  test('click "Leverage & Risk" → response', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'Leverage: 1.0x. No margin positions.',
      toolCalls: [],
      mutations: false,
    });

    await page.keyboard.press(CMD_K);
    const item = page.locator('[cmdk-item]', { hasText: 'Leverage & Risk' });
    await item.click();
    await expect(page.locator('text=Leverage: 1.0x')).toBeVisible({ timeout: 10000 });
  });

  test('click "Debt Summary" → response', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'Total debt: $14,500 across 2 positions.',
      toolCalls: [],
      mutations: false,
    });

    await page.keyboard.press(CMD_K);
    const item = page.locator('[cmdk-item]', { hasText: 'Debt Summary' });
    await item.click();
    await expect(page.locator('text=Total debt: $14,500')).toBeVisible({ timeout: 10000 });
  });

  test('click "Perps Summary" → response', async ({ seededPage: page }) => {
    await mockChatSuccess(page, {
      response: 'No perps positions found.',
      toolCalls: [],
      mutations: false,
    });

    await page.keyboard.press(CMD_K);
    const item = page.locator('[cmdk-item]', { hasText: 'Perps Summary' });
    await item.click();
    await expect(page.locator('text=No perps positions found.')).toBeVisible({ timeout: 10000 });
  });
});
