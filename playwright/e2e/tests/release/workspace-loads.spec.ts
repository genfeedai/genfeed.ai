import { expect, test } from '@e2e/fixtures/release-auth.fixture';

test.describe('Released image — authenticated workspace shell', () => {
  test('the provisioned workspace renders its live brand', async ({
    page,
    releaseAccount,
  }) => {
    const response = await page.goto(releaseAccount.workspacePath, {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status() ?? 0).toBeLessThan(400);
    expect(page.url()).not.toMatch(/\/(login|onboarding)(?:\/|\?|$)/);
    await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);
    const switcher = page
      .locator('[data-testid="brand-switcher-trigger"]:visible')
      .first();
    await expect(switcher).toBeVisible({ timeout: 30_000 });
    await expect(switcher).toContainText(releaseAccount.brand.label, {
      timeout: 30_000,
    });
  });
});
