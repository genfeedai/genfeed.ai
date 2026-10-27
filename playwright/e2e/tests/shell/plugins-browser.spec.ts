import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { orgPath } from '../../utils/app-chrome';
import { chooseFilterOption } from '../../utils/filter-menu';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

/** Picks one option of one facet in the shared Filters menu. */
async function chooseFilter(
  page: Page,
  facet: string,
  option: RegExp,
): Promise<void> {
  await chooseFilterOption(page, facet, option);
}

// Uses the existing isolated auth/API fixture; no live installations or providers.
test('organization Plugins browser keeps scope, filters and previews usable on desktop and mobile', async ({
  authenticatedPage: page,
}, testInfo) => {
  await page.goto(orgPath('/plugins'), { waitUntil: 'domcontentloaded' });
  const apps = page.locator(
    '[data-testid^="plugins-app-"]:not([data-testid="plugins-app-detail"])',
  );
  const detail = page.getByTestId('plugins-app-detail');
  await expect(apps).toHaveCount(9);
  await expect(detail).toHaveCount(0);
  await expect(
    page.getByText('Plan a story scene by scene, then generate it.'),
  ).toBeVisible();
  // Status and category are facets of the one Filters menu, not tabs.
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Filters/ })).toBeVisible();
  await expect(page.getByTestId('organization-switcher-trigger')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveText(
    'Plugins',
  );
  await expect(
    page.getByRole('button', { name: /select brand|brand 1/i }),
  ).toHaveCount(0);

  await page
    .getByRole('button', { name: 'Select Storyboard', exact: true })
    .click();
  await expect(detail).toContainText('Break an idea into scenes and shots');
  // The detail used to push its title and Open action below the fold.
  await expect(
    detail.getByRole('link', { name: 'Open Storyboard' }),
  ).toBeInViewport();
  await expect(
    detail.getByRole('link', { name: 'Open Storyboard' }),
  ).toHaveAttribute('href', /\/storyboard$/);
  await expect
    .poll(() =>
      detail
        .getByRole('img')
        .evaluate(
          (img) =>
            img instanceof HTMLImageElement &&
            img.complete &&
            img.naturalWidth > 0,
        ),
    )
    .toBe(true);

  await chooseFilter(page, 'Category', /^Publish & grow/);
  await expect(apps).toHaveCount(2);
  await expect(detail).toHaveCount(0);
  await page.getByTestId('collapsible-search-trigger').click();
  await page.getByPlaceholder('Search plugins').fill('nothing-matches');
  await expect(page.getByTestId('plugins-empty')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(apps).toHaveCount(9);

  await chooseFilter(page, 'App status', /^Available/);
  await expect(page.getByTestId('plugins-empty')).toBeVisible();
  await chooseFilter(page, 'App status', /^All/);
  // The menu is keyboard operable end to end.
  const filters = page.getByRole('button', { name: /^Filters/ });
  await filters.focus();
  await filters.press('Enter');
  const status = page.getByRole('menuitem', { name: /^App status/ });
  await status.focus();
  await status.press('ArrowRight');
  await page.getByRole('menuitemradio', { name: /^Installed/ }).press('Enter');
  await chooseFilter(page, 'App status', /^All/);
  await page.screenshot({
    path: testInfo.outputPath('plugins-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button', { name: 'Select Discovery', exact: true })
    .click();
  await expect(detail).toContainText('Research what is trending');
  // On mobile the detail opens in the Context sheet, a modal that hides the
  // page behind it until it is closed.
  await expect(page.getByRole('dialog', { name: 'Agent' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('plugins-mobile.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveText(
    'Plugins',
  );
  await expectNoErrorOverlay(page);
});

test('app installation and removal update the real member-app provider', async ({
  authenticatedPage: page,
}) => {
  let installedAppIds = ['playground'];
  const writes: string[] = [];
  await page.route('**/v1/members/me/apps**', async (route) => {
    const method = route.request().method();
    const appId = new URL(route.request().url()).pathname.split('/').at(-1);
    if (appId === 'storyboard' && method === 'PUT') {
      writes.push('PUT:storyboard');
      installedAppIds = [...installedAppIds, appId];
    } else if (appId === 'storyboard' && method === 'DELETE') {
      writes.push('DELETE:storyboard');
      installedAppIds = installedAppIds.filter((id) => id !== appId);
    }
    await route.fulfill({ json: { installedAppIds } });
  });
  await page.goto(orgPath('/plugins'), { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: 'Select Storyboard', exact: true })
    .click();
  const detail = page.getByTestId('plugins-app-detail');
  await detail.getByRole('button', { name: 'Add Storyboard' }).click();
  await expect(
    detail.getByRole('link', { name: 'Open Storyboard' }),
  ).toBeVisible();
  await detail.getByRole('button', { name: 'Storyboard', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
  await expect(
    detail.getByRole('button', { name: 'Add Storyboard' }),
  ).toBeVisible();
  expect(writes).toEqual(['PUT:storyboard', 'DELETE:storyboard']);
  await expectNoErrorOverlay(page);
});
