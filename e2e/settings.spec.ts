import { test, expect, seedLocalStorage, waitForAppLoad } from './fixtures/test-helpers';
import { Page } from '@playwright/test';

test.describe('Settings', () => {
  test('toggle theme between light, dark, and system', async ({ seededPage: page }) => {
    // Navigate to settings
    await page.locator('a[title="Settings"]').click();
    await page.waitForURL(/\/settings/);

    // The Appearance section should be visible
    await expect(page.locator('text=Appearance')).toBeVisible();

    // Click Light theme button
    await page.locator('button', { hasText: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // Click Dark theme button
    await page.locator('button', { hasText: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Click System theme button
    await page.locator('button', { hasText: 'System' }).click();
    // System resolves to either light or dark based on OS, just verify the button was clickable
    await expect(page.locator('button', { hasText: 'System' })).toBeVisible();
  });

  test('set risk-free rate and verify it persists', async ({ seededPage: page }) => {
    // Navigate to settings
    await page.locator('a[title="Settings"]').click();
    await page.waitForURL(/\/settings/);

    // Find the Performance Metrics section
    await expect(page.locator('text=Performance Metrics')).toBeVisible();

    // The risk-free rate input should show 5.0 (default 0.05 = 5%)
    const rateInput = page.locator('input[type="number"][step="0.1"]');
    await expect(rateInput).toBeVisible();

    // Change the rate to 4.0
    await rateInput.clear();
    await rateInput.fill('4.0');

    // Navigate away and back to verify persistence
    await page.locator('a', { hasText: 'billionorzero' }).click();
    await page.waitForURL('/');

    await page.locator('a[title="Settings"]').click();
    await page.waitForURL(/\/settings/);

    // The value should still be 4.0
    await expect(page.locator('input[type="number"][step="0.1"]')).toHaveValue('4.0');
  });

  test('export portfolio downloads JSON', async ({ seededPage: page }) => {
    // Navigate to settings
    await page.locator('a[title="Settings"]').click();
    await page.waitForURL(/\/settings/);

    // Find Data Management section
    await expect(page.locator('text=Data Management')).toBeVisible();

    // Set up download handler
    const downloadPromise = page.waitForEvent('download');

    // Click Export Data button
    await page.locator('button', { hasText: 'Export Data' }).click();

    // Verify download was triggered
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/portfolio-backup-.*\.json/);
  });

  test('import portfolio from JSON', async ({ seededPage: page }) => {
    // Navigate to settings
    await page.locator('a[title="Settings"]').click();
    await page.waitForURL(/\/settings/);

    // The Import Data label/button should be visible
    await expect(page.locator('text=Import Data')).toBeVisible();

    // Create a test import file
    const importData = JSON.stringify({
      positions: [
        {
          id: 'imported-1',
          type: 'manual',
          symbol: 'IMPORTED',
          name: 'Imported Asset',
          amount: 100,
          addedAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
      wallets: [],
      snapshots: [],
      exportedAt: new Date().toISOString(),
    });

    // Use the file input (hidden inside the Import Data label)
    const fileInput = page.locator('input[type="file"][accept=".json"]');

    // Upload the file using setInputFiles
    await fileInput.setInputFiles({
      name: 'test-import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(importData),
    });

    // The page should reload after import (window.location.reload is called)
    // Wait for navigation
    await page.waitForLoadState('load');
  });
});
