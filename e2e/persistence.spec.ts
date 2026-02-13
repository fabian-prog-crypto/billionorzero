import { test, expect, seedEmptyPortfolio, seedLocalStorage, waitForAppLoad } from './fixtures/test-helpers';
import { test as baseTest, type Page } from '@playwright/test';

const sidebarAssetsLink = (page: Page) =>
  page.locator('aside nav a[href="/positions"]');

test.describe('Persistence', () => {
  test('add position, reload page, position still exists', async ({ seededPage: page }) => {
    // Navigate to positions
    await sidebarAssetsLink(page).click();
    await page.waitForURL(/\/positions/);

    // Verify our seeded positions exist
    await expect(page.locator('tbody tr', { hasText: 'GOLD' })).toBeVisible();

    // Count positions
    const initialCount = await page.locator('tbody tr').count();

    // Reload the page
    await page.reload();
    await waitForAppLoad(page);

    // Navigate back to positions
    await sidebarAssetsLink(page).click();
    await page.waitForURL(/\/positions/);

    // Verify positions still exist
    await expect(page.locator('tbody tr', { hasText: 'GOLD' })).toBeVisible();
    const afterCount = await page.locator('tbody tr').count();
    expect(afterCount).toBe(initialCount);
  });

  test('change theme, reload, theme persists', async ({ seededPage: page }) => {
    // Start in dark mode
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Switch to light mode
    await page.locator('button[title="Switch to light mode"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // Reload the page
    await page.reload();
    await waitForAppLoad(page);

    // Theme should still be light
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('change settings, reload, settings persist', async ({ seededPage: page }) => {
    // Navigate to settings
    await page.locator('a[title="Settings"]').click();
    await page.waitForURL(/\/settings/);

    // Change risk-free rate
    const rateInput = page.locator('input[type="number"][step="0.1"]');
    await rateInput.clear();
    await rateInput.fill('3.5');

    // Reload the page
    await page.reload();
    await waitForAppLoad(page);

    // Navigate back to settings
    await page.locator('a[title="Settings"]').click();
    await page.waitForURL(/\/settings/);

    // Risk-free rate should still be 3.5
    await expect(page.locator('input[type="number"][step="0.1"]')).toHaveValue('3.5');
  });
});
