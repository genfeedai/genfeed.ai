import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { SettingsPage } from '../../pages/settings.page';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

test('a failed credit balance explains the failure and recovers without checkout', async ({
  authenticatedPage: page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockActiveSubscription(page, { credits: 500 });
  let isBalanceAvailable = false;
  const checkoutRequests: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/checkout(?:\?|$)/.test(request.url())
    ) {
      checkoutRequests.push(request.url());
    }
  });
  await page.route('**/v1/subscriptions/current/credits', async (route) => {
    if (isBalanceAvailable) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 503,
      json: { errors: [{ title: 'Temporarily unavailable' }] },
    });
  });

  const settings = new SettingsPage(page);
  await settings.goToBilling();
  await expect(
    settings.canvas.getByText('Your credit balance could not be loaded.'),
  ).toBeVisible();
  await expect(settings.canvas.getByText('Credits Left')).toHaveCount(0);
  await expect(
    page.getByRole('dialog', { name: 'Request failed', exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('balance-unavailable.png'),
  });

  isBalanceAvailable = true;
  await settings.canvas.getByRole('button', { name: 'Retry balance' }).click();
  await expect(
    settings.canvas.getByText('500of 625', { exact: true }),
  ).toBeVisible();
  await expect(
    settings.canvas.getByText('Your credit balance could not be loaded.'),
  ).toHaveCount(0);
  expect(checkoutRequests).toEqual([]);
  await expectNoErrorOverlay(page);
  await page.screenshot({ path: testInfo.outputPath('balance-recovered.png') });
});
