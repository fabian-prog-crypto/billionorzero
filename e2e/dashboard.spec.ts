import { test, expect } from './fixtures/test-helpers';

test.describe('Dashboard', () => {
  test('page loads and shows app content', async ({ seededPage: page }) => {
    // The app shell should be visible
    await expect(page.locator('text=billionorzero')).toBeVisible();

    // Category tabs should be visible
    await expect(page.locator('button', { hasText: 'All' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Crypto' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Equities' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Cash' })).toBeVisible();

    // NET WORTH label should appear (we seeded positions)
    await expect(page.locator('text=NET WORTH')).toBeVisible();
  });

  test('category tabs navigate correctly', async ({ seededPage: page }) => {
    // Click Crypto tab
    await page.locator('button', { hasText: 'Crypto' }).click();
    await expect(page).toHaveURL(/\/crypto/);

    // Click Equities tab
    await page.locator('button', { hasText: 'Equities' }).click();
    await expect(page).toHaveURL(/\/equities/);

    // Click Cash tab
    await page.locator('button', { hasText: 'Cash' }).click();
    await expect(page).toHaveURL(/\/cash/);

    // Click All tab to go back to overview
    await page.locator('button', { hasText: 'All' }).click();
    await expect(page).toHaveURL('/');
  });

  test('hide balances toggle replaces values with bullet characters', async ({ seededPage: page }) => {
    // Verify balances are visible initially
    await expect(page.locator('text=NET WORTH')).toBeVisible();

    // The page should NOT have masked values initially
    const maskedBefore = await page.locator('text=••••••••').count();

    // Click the hide balances button (eye-off icon in header)
    await page.locator('button[title="Hide balances"]').click();

    // Now the net worth should be masked
    await expect(page.locator('text=••••••••').first()).toBeVisible();

    // Click again to show balances
    await page.locator('button[title="Show balances"]').click();

    // Masked values should be gone (or reduced)
    const maskedAfter = await page.locator('text=••••••••').count();
    expect(maskedAfter).toBeLessThanOrEqual(maskedBefore);
  });

  test('theme toggle switches between light and dark', async ({ seededPage: page }) => {
    // The app starts in dark mode (seeded)
    const html = page.locator('html');

    // Click theme toggle (sun icon = switch to light)
    await page.locator('button[title="Switch to light mode"]').click();

    // The theme attribute should change to light
    await expect(html).toHaveAttribute('data-theme', 'light');

    // The button title should now say switch to dark
    await expect(page.locator('button[title="Switch to dark mode"]')).toBeVisible();

    // Click again to go back to dark
    await page.locator('button[title="Switch to dark mode"]').click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });

  test('refresh button is clickable', async ({ seededPage: page }) => {
    // The sync button should be visible
    const syncButton = page.locator('button[title="Sync"]');
    await expect(syncButton).toBeVisible();
    await expect(syncButton).toBeEnabled();

    // Click it - it should not throw
    await syncButton.click();

    // The button should still exist after clicking
    await expect(syncButton).toBeVisible();
  });
});
