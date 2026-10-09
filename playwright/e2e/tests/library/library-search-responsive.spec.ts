import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  mockActiveSubscription,
  mockLibraryData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

for (const viewport of [
  { height: 844, width: 390 },
  { height: 900, width: 1440 },
]) {
  test(`Library search controls remain usable at ${viewport.width}px`, async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await mockLibraryData(page);
    await page.goto(brandPath(APP_ROUTES.LIBRARY.ASSETS), {
      waitUntil: 'domcontentloaded',
    });

    const canvas = page.getByRole('region', {
      name: 'Primary workspace canvas',
      exact: true,
    });
    await canvas.getByRole('button', { name: 'Search', exact: true }).click();
    const search = canvas.getByRole('textbox', { name: 'Search', exact: true });
    await search.fill('cobalt');
    await search.press('Enter');
    const clear = canvas.getByRole('button', {
      name: 'Clear search',
      exact: true,
    });
    await expect(clear).toBeVisible();
    await expect
      .poll(() =>
        clear.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
            ),
          );
        }),
      )
      .toBe(true);

    const topbar = page.getByTestId('section-topbar');
    for (const control of await topbar
      .locator('button, [role="combobox"]')
      .all()) {
      if (!(await control.isVisible())) continue;
      const bounds = await control.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
        viewport.width,
      );
    }
    await page.screenshot({
      path: testInfo.outputPath('library-search-controls.png'),
    });

    await clear.click();
    await expect(search).toHaveValue('');
    await expect
      .poll(() => new URL(page.url()).searchParams.get('search'))
      .toBeNull();
    await canvas.getByRole('button', { name: 'Type', exact: true }).click();
    await expect(
      page.getByRole('option', { name: 'Image', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expectNoErrorOverlay(page);
  });
}
