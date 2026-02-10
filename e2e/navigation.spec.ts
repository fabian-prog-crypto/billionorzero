import { test, expect } from './fixtures/test-helpers';

test.describe('Navigation', () => {
  test('sidebar links navigate to correct pages', async ({ seededPage: page }) => {
    // On the overview (All tab), sidebar should show Overview, Assets, Exposure, Performance
    const overviewLink = page.locator('nav a', { hasText: 'Overview' });
    await expect(overviewLink).toBeVisible();

    // Click Assets in sidebar
    await page.locator('nav a', { hasText: 'Assets' }).click();
    await expect(page).toHaveURL(/\/positions/);

    // Click Exposure in sidebar
    await page.locator('nav a', { hasText: 'Exposure' }).click();
    await expect(page).toHaveURL(/\/exposure/);

    // Click Performance in sidebar
    await page.locator('nav a', { hasText: 'Performance' }).click();
    await expect(page).toHaveURL(/\/performance/);

    // Click Overview to go back
    await page.locator('nav a', { hasText: 'Overview' }).click();
    await expect(page).toHaveURL('/');
  });

  test('active nav item is highlighted', async ({ seededPage: page }) => {
    // On the home page, Overview should be active
    const overviewLink = page.locator('nav a', { hasText: 'Overview' });
    await expect(overviewLink).toHaveClass(/active/);

    // Navigate to Assets
    await page.locator('nav a', { hasText: 'Assets' }).click();
    await page.waitForURL(/\/positions/);

    // Assets should now be active
    const assetsLink = page.locator('nav a', { hasText: 'Assets' });
    await expect(assetsLink).toHaveClass(/active/);

    // Overview should no longer be active
    await expect(page.locator('nav a', { hasText: 'Overview' })).not.toHaveClass(/active/);
  });

  test('category tab switching updates sidebar', async ({ seededPage: page }) => {
    // On All tab, sidebar should have Overview, Assets, Exposure, Performance
    await expect(page.locator('nav a', { hasText: 'Performance' })).toBeVisible();

    // Switch to Crypto tab
    await page.locator('button', { hasText: 'Crypto' }).click();
    await page.waitForURL(/\/crypto/);

    // Sidebar should now show crypto-specific items: Wallets, Perps, Accounts
    await expect(page.locator('nav a', { hasText: 'Wallets' })).toBeVisible();
    await expect(page.locator('nav a', { hasText: 'Perps' })).toBeVisible();

    // Switch to Cash tab
    await page.locator('button', { hasText: 'Cash' }).click();
    await page.waitForURL(/\/cash/);

    // Sidebar should show cash items: Accounts
    await expect(page.locator('nav a', { hasText: 'Accounts' })).toBeVisible();
    // Wallets should not be in cash sidebar
    await expect(page.locator('nav a', { hasText: 'Wallets' })).not.toBeVisible();
  });

  test('logo click returns to dashboard', async ({ seededPage: page }) => {
    // Navigate away from home
    await page.locator('nav a', { hasText: 'Assets' }).click();
    await page.waitForURL(/\/positions/);

    // Click the logo/brand text
    await page.locator('a', { hasText: 'billionorzero' }).click();

    // Should be back at home
    await expect(page).toHaveURL('/');
  });

  test('back/forward browser navigation works', async ({ seededPage: page }) => {
    // Start at home
    await expect(page).toHaveURL('/');

    // Navigate to positions
    await page.locator('nav a', { hasText: 'Assets' }).click();
    await page.waitForURL(/\/positions/);

    // Navigate to exposure
    await page.locator('nav a', { hasText: 'Exposure' }).click();
    await page.waitForURL(/\/exposure/);

    // Go back
    await page.goBack();
    await expect(page).toHaveURL(/\/positions/);

    // Go back again
    await page.goBack();
    await expect(page).toHaveURL('/');

    // Go forward
    await page.goForward();
    await expect(page).toHaveURL(/\/positions/);
  });
});
