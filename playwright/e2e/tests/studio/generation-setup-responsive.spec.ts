import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

for (const viewport of [
  { height: 844, width: 360 },
  { height: 844, width: 390 },
  { height: 1024, width: 768 },
  { height: 900, width: 1440 },
]) {
  for (const theme of ['light', 'dark', 'system'] as const) {
    test(`generation setup stays within the ${viewport.width}px viewport in ${theme}`, async ({
      authenticatedPage: page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({
        colorScheme: theme === 'light' ? 'light' : 'dark',
        reducedMotion: 'reduce',
      });
      await page.addInitScript(
        (selection) => localStorage.setItem('theme', selection),
        theme,
      );
      await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
      await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND), {
        waitUntil: 'domcontentloaded',
      });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).toHaveAttribute(
        'data-theme',
        theme === 'light' ? 'light' : 'dark',
      );
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
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(dialog).toBeVisible();
      await expectNoErrorOverlay(page);
    });
  }
}

// Browser zoom at 200% halves the CSS viewport and doubles rendered pixels.
// Keep this emulation explicit; screenshot dimensions retain the device width.
test.describe('200% browser zoom layout', () => {
  test.use({ deviceScaleFactor: 2 });
  for (const width of [360, 390, 768, 1440]) {
    test(`generation setup remains reachable at ${width}px physical width`, async ({
      authenticatedPage: page,
    }, testInfo) => {
      await page.setViewportSize({ width: width / 2, height: 600 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
      await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND), {
        waitUntil: 'domcontentloaded',
      });
      const trigger = page.getByRole('button', { name: /^Generation setup:/ });
      await trigger.click();
      const dialog = page.getByRole('dialog').filter({
        has: page.getByRole('button', {
          name: 'Configure Type',
          exact: true,
        }),
      });
      await expect(dialog).toBeVisible();
      await expect
        .poll(async () => {
          const b = await dialog.boundingBox();
          return b !== null && b.x >= 0 && b.x + b.width <= width / 2;
        })
        .toBe(true);
      await expect(
        dialog.getByRole('button', { name: 'Configure Type', exact: true }),
      ).toBeInViewport();
      await page.keyboard.press('Tab');
      await expect
        .poll(() =>
          dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: testInfo.outputPath('generation-setup-200-percent.png'),
      });
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
    });
  }
});

test.describe('touch generation setup', () => {
  test.use({ hasTouch: true });
  test('retains a real 44px hit target around the 32px icon', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND), {
      waitUntil: 'domcontentloaded',
    });
    const trigger = page.getByRole('button', { name: /^Generation setup:/ });
    await expect(trigger).toBeVisible();
    const target = await trigger.evaluate((element) => {
      const b = element.getBoundingClientRect();
      const pseudo = getComputedStyle(element, '::after');
      return {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        hitWidth: b.width - parseFloat(pseudo.left) - parseFloat(pseudo.right),
        hitHeight:
          b.height - parseFloat(pseudo.top) - parseFloat(pseudo.bottom),
      };
    });
    expect(target.width).toBeGreaterThanOrEqual(32);
    expect(target.height).toBeGreaterThanOrEqual(32);
    expect(target.hitWidth).toBeGreaterThanOrEqual(44);
    expect(target.hitHeight).toBeGreaterThanOrEqual(44);
    await page.touchscreen.tap(target.x + target.width / 2, target.y - 5);
    await expect(
      page.getByRole('dialog').filter({
        has: page.getByRole('button', {
          name: 'Configure Type',
          exact: true,
        }),
      }),
    ).toBeVisible();
  });
});
