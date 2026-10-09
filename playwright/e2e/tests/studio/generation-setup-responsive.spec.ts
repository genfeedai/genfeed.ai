import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

for (const viewport of [
  { height: 844, width: 390 },
  { height: 900, width: 1440 },
]) {
  test(`generation setup stays within the ${viewport.width}px viewport`, async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await page.goto(brandPath(APP_ROUTES.STUDIO.GENERATE), {
      waitUntil: 'domcontentloaded',
    });

    const trigger = page.getByRole('button', { name: /^Generation setup:/ });
    await trigger.click();
    const dialog = page.getByRole('dialog').filter({
      has: page.getByRole('button', { name: 'Configure Type', exact: true }),
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Reset all fields to agent' }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const bounds = await dialog.boundingBox();
        return (
          bounds !== null &&
          bounds.x >= 16 &&
          bounds.x + bounds.width <= viewport.width - 16
        );
      })
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('generation-setup-in-viewport.png'),
    });

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expectNoErrorOverlay(page);
  });
}
