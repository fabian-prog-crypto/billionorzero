import { test, expect } from './fixtures/test-helpers';
import type { Page } from '@playwright/test';

const sidebarLink = (page: Page, href: string) =>
  page.locator(`aside nav a[href="${href}"]`);

test.describe('Navigation', () => {
  test('sidebar links navigate to correct pages', async ({ seededPage: page }) => {
    // On the overview (All tab), sidebar should show Overview, Assets, Exposure, Performance
    const overviewLink = sidebarLink(page, '/');
    await expect(overviewLink).toBeVisible();

    // Click Assets in sidebar
    await sidebarLink(page, '/positions').click();
    await expect(page).toHaveURL(/\/positions/);

    // Click Exposure in sidebar
    await sidebarLink(page, '/exposure').click();
    await expect(page).toHaveURL(/\/exposure/);

    // Click Performance in sidebar
    await sidebarLink(page, '/performance').click();
    await expect(page).toHaveURL(/\/performance/);

    // Click Overview to go back
    await sidebarLink(page, '/').click();
    await expect(page).toHaveURL('/');
  });

  test('active nav item is highlighted', async ({ seededPage: page }) => {
    // On the home page, Overview should be active
    const overviewLink = sidebarLink(page, '/');
    await expect(overviewLink).toHaveClass(/active/);

    // Navigate to Assets
    await sidebarLink(page, '/positions').click();
    await page.waitForURL(/\/positions/);

    // Assets should now be active
    const assetsLink = sidebarLink(page, '/positions');
    await expect(assetsLink).toHaveClass(/active/);

    // Overview should no longer be active
    await expect(sidebarLink(page, '/')).not.toHaveClass(/active/);
  });

  test('category tab switching updates sidebar', async ({ seededPage: page }) => {
    // On All tab, sidebar should have Overview, Assets, Exposure, Performance
    await expect(sidebarLink(page, '/performance')).toBeVisible();

    // Switch to Crypto tab
    await page.getByRole('button', { name: 'Crypto', exact: true }).click();
    await page.waitForURL(/\/crypto/);

    // Sidebar should now show crypto-specific items: Wallets, Perps, Accounts
    await expect(sidebarLink(page, '/crypto/wallets')).toBeVisible();
    await expect(sidebarLink(page, '/crypto/perps')).toBeVisible();

    // Switch to Cash tab
    await page.getByRole('button', { name: 'Cash', exact: true }).click();
    await page.waitForURL(/\/cash/);

    // Sidebar should show cash items: Accounts
    await expect(sidebarLink(page, '/cash/accounts')).toBeVisible();
    // Wallets should not be in cash sidebar
    await expect(sidebarLink(page, '/cash/wallets')).not.toBeVisible();
  });

  test('logo click returns to dashboard', async ({ seededPage: page }) => {
    // Navigate away from home
    await sidebarLink(page, '/positions').click();
    await page.waitForURL(/\/positions/);

    // Click the logo/brand text
    await page.locator('header a[href="/"]', { hasText: 'billionorzero' }).click();

    // Should be back at home
    await expect(page).toHaveURL('/');
  });

  test('back/forward browser navigation works', async ({ seededPage: page }) => {
    // Start at home
    await expect(page).toHaveURL('/');

    // Navigate to positions
    await sidebarLink(page, '/positions').click();
    await page.waitForURL(/\/positions/);

    // Navigate to exposure
    await sidebarLink(page, '/exposure').click();
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
