import { expect, test } from '@playwright/test';

test.describe('Marketplace Browse', () => {
  test('marketplace page loads', async ({ page }) => {
    await page.goto('/skills', { waitUntil: 'domcontentloaded' });
    const heading = page.getByRole('heading').first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('marketplace displays listings', async ({ page }) => {
    await page.goto('/skills', { waitUntil: 'domcontentloaded' });
    // Should have multiple items/cards
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
    expect(content?.length).toBeGreaterThan(200);
  });

  test('integrations page loads', async ({ page }) => {
    await page.goto('/integrations', {
      waitUntil: 'domcontentloaded',
    });
    const heading = page.getByRole('heading').first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });
});
