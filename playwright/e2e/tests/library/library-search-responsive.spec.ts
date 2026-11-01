import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  mockActiveSubscription,
  mockLibraryData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { filtersTrigger, openFilterFacet } from '../../utils/filter-menu';
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
    // Type is a facet of the shared Filters menu (#7567), a checkable row.
    const type = await openFilterFacet(page, 'Type', canvas);
    const image = type.getByRole('menuitemcheckbox', {
      name: 'Image',
      exact: true,
    });
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate((element) => {
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
    // The hit test above proves the row is reachable. Commit it from the
    // keyboard: a mouse move from the Type row to the submenu crosses the
    // parent menu at 390px, where Radix closes the submenu mid-click.
    await image.focus();
    await page.keyboard.press('Enter');
    // The open menu hides the rest of the page from role queries.
    await page.keyboard.press('Escape');
    // What is applied is counted on the Filters trigger inside the search
    // field, not listed as chips outside it.
    await expect(filtersTrigger(canvas)).toContainText('1');
    await expect(
      canvas.getByRole('button', { name: 'Remove Image filter', exact: true }),
    ).toHaveCount(0);
    await filtersTrigger(canvas).click();
    await page.getByRole('menuitem', { name: 'Clear all filters' }).click();
    await expect(filtersTrigger(canvas)).not.toContainText('1');

    if (viewport.width < 768) {
      const open = page.getByRole('button', {
        name: 'Open navigation menu',
        exact: true,
      });
      await open.click();
      // The drawer is a modal dialog: its own close button dismisses it.
      const drawer = page.getByRole('dialog', { name: 'Navigation' });
      await expect(drawer).toBeVisible();
      await drawer.getByRole('button', { name: 'Close' }).click();
      await expect(drawer).toBeHidden();
      await expect(open).toBeVisible();
      await open.click();
      await expect(drawer).toBeVisible();
      await drawer.getByRole('button', { name: 'Close' }).click();
      await expect(drawer).toBeHidden();
    } else {
      const sidebar = page.getByRole('complementary', {
        name: 'Navigation',
        exact: true,
      });
      const initialBounds = await sidebar.boundingBox();
      expect(initialBounds?.width).toBeGreaterThan(100);
      await page
        .getByRole('button', { name: 'Collapse sidebar', exact: true })
        .click();
      const expand = page.getByRole('button', {
        name: 'Expand sidebar',
        exact: true,
      });
      await expect(expand).toBeVisible();
      await expect
        .poll(async () => (await sidebar.boundingBox())?.width ?? 0)
        .toBeLessThan(10);
      await expand.click();
      await expect
        .poll(async () => (await sidebar.boundingBox())?.width ?? 0)
        .toBe(initialBounds?.width);
    }
    await expect(clear).toHaveCount(0);
    await expect(
      canvas.getByRole('button', { name: 'Filters', exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('library-restored.png'),
    });
    await expectNoErrorOverlay(page);
  });
}
