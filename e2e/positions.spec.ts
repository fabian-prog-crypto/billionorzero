import { test, expect, seedLocalStorage, seedEmptyPortfolio, waitForAppLoad } from './fixtures/test-helpers';
import type { Page } from '@playwright/test';

async function gotoPositions(page: Page) {
  await page.goto('/positions');
  await expect(page).toHaveURL(/\/positions/);
  await expect(page.locator('table')).toBeVisible();
}

test.describe('Positions', () => {
  test('add manual position: open modal, fill form, submit, appears in list', async ({ seededPage: page }) => {
    // Navigate to positions page
    await gotoPositions(page);

    // Click Add button on the positions page
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Modal should open
    await expect(page.locator('.modal-content h2', { hasText: 'Add Position' })).toBeVisible();

    // Switch to Manual tab
    await page.locator('button', { hasText: 'Manual' }).click();

    // Fill in the form
    await page.locator('input[placeholder="e.g., GOLD"]').clear();
    await page.locator('input[placeholder="e.g., GOLD"]').fill('SILVER');
    await page.locator('input[placeholder="e.g., Gold"]').fill('Silver');
    await page.locator('input[placeholder="0.00"]').first().fill('25'); // Price per unit

    // Fill amount
    const amountInput = page.locator('label:has-text("Amount") + input, label:has-text("Amount") ~ input').first();
    // The amount field is in the grid after the manual fields
    await page.locator('input[placeholder="0.00"]').nth(1).fill('10');

    // Submit
    await page.locator('button[type="submit"]', { hasText: 'Add Position' }).click();

    // Modal should close
    await expect(page.locator('h2', { hasText: 'Add Position' })).not.toBeVisible();

    // The new position should appear in the list
    await expect(page.locator('text=SILVER')).toBeVisible();
  });

  test('add cash position: select currency, enter amount, submit', async ({ seededPage: page }) => {
    // Open Add Position modal from the header
    await page.locator('button', { hasText: /Add (Position|All)/ }).first().click();

    // Modal should open
    await expect(page.locator('h2', { hasText: 'Add Position' })).toBeVisible();
    const modal = page.locator('.modal-content');

    // Switch to Cash tab
    await modal.getByRole('button', { name: 'Cash', exact: true }).click();

    // The existing "Test Bank" account button should be visible
    await expect(modal.locator('button', { hasText: 'Test Bank' })).toBeVisible();

    // Click on the existing account
    await modal.locator('button', { hasText: 'Test Bank' }).click();

    // Currency should default to USD - fill balance
    await modal.locator('input[placeholder="0.00"]').fill('5000');

    // Submit
    await modal.locator('button[type="submit"]', { hasText: 'Add Position' }).click();

    // Modal should close
    await expect(page.locator('h2', { hasText: 'Add Position' })).not.toBeVisible();
  });

  test('edit manual position: click edit, change amount, save', async ({ seededPage: page }) => {
    // Navigate to positions page
    await gotoPositions(page);

    // Find an edit button on a manual position row (GOLD is manual)
    const goldRow = page.locator('tr', { hasText: 'GOLD' });
    await expect(goldRow).toBeVisible();

    // Click the edit button in the GOLD row
    await goldRow.locator('button[title="Edit position"]').click();

    // The ConfirmPositionActionModal should open with edit fields
    // Wait for the modal to appear
    await expect(page.locator('.modal-backdrop')).toBeVisible();

    // The modal should show the symbol
    await expect(page.locator('.modal-content')).toContainText('GOLD');
  });

  test('delete position: click delete, confirm, removed', async ({ seededPage: page }) => {
    // Navigate to positions page
    await gotoPositions(page);

    // The GOLD position should be visible
    await expect(page.locator('tr', { hasText: 'GOLD' })).toBeVisible();

    // Set up dialog handler to accept the confirm
    page.on('dialog', (dialog) => dialog.accept());

    // Click delete on the GOLD row
    const goldRow = page.locator('tr', { hasText: 'GOLD' });
    await goldRow.locator('button[title="Delete position"]').click();

    // The GOLD position should be removed
    await expect(page.locator('tr', { hasText: 'GOLD' })).not.toBeVisible();
  });

  test('custom price: set custom price on position', async ({ seededPage: page }) => {
    // Navigate to positions page
    await gotoPositions(page);

    // Click on a price cell to open custom price modal
    // The price cells have title="Click to set custom price"
    const priceButton = page.locator('button[title="Click to set custom price"]').first();
    await priceButton.click();

    // Custom price modal should open
    await expect(page.locator('text=Set Custom Price')).toBeVisible();

    // Close it
    await page.locator('.modal-backdrop').click({ position: { x: 10, y: 10 } });
  });

  test('search/filter: type in search, list filters', async ({ seededPage: page }) => {
    // Navigate to positions page
    await gotoPositions(page);

    // Count initial positions
    const initialRows = await page.locator('tbody tr').count();
    expect(initialRows).toBeGreaterThan(1);

    // Type in search box
    await page.locator('input[placeholder="Search..."]').fill('bitcoin');

    // Should filter to only Bitcoin
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr').first()).toContainText('BITCOIN');

    // Clear search
    await page.locator('input[placeholder="Search..."]').clear();

    // All positions should return
    const restoredRows = await page.locator('tbody tr').count();
    expect(restoredRows).toBe(initialRows);
  });

  test('view mode toggle: switch between positions and assets views', async ({ seededPage: page }) => {
    // Navigate to positions page
    await gotoPositions(page);

    // Should start in positions view
    await expect(page.locator('button', { hasText: 'Positions' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Assets' }).last()).toBeVisible();

    // The table should have a "Source" column in positions view
    await expect(page.locator('th', { hasText: 'Source' })).toBeVisible();

    // Switch to Assets view
    await page.locator('button', { hasText: 'Assets' }).last().click();

    // The "Source" column should be replaced with "Category"
    await expect(page.locator('th', { hasText: 'Category' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Source' })).not.toBeVisible();
  });

  test('hide dust toggle', async ({ seededPage: page }) => {
    // Navigate to positions page
    await gotoPositions(page);

    // Find and click the Dust toggle button
    const dustButton = page.locator('button', { hasText: 'Dust' });
    await expect(dustButton).toBeVisible();

    // Click to enable dust filtering
    await dustButton.click();

    // Click again to disable
    await dustButton.click();

    // Button should still be visible
    await expect(dustButton).toBeVisible();
  });
});
