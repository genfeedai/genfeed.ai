import { expect, test } from '../../fixtures/auth.fixture';
import { orgPath } from '../../utils/app-chrome';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

// Uses the existing isolated auth/API fixture; no live installations or providers.
test('organization Apps browser keeps scope, search and previews usable on desktop and mobile', async ({
  authenticatedPage: page,
}, testInfo) => {
  await page.goto(orgPath('/apps'), { waitUntil: 'domcontentloaded' });
  const apps = page.locator(
    '[data-testid^="apps-app-"]:not([data-testid="apps-app-detail"])',
  );
  const detail = page.getByTestId('apps-app-detail');
  await expect(apps).toHaveCount(9);
  await expect(detail).toHaveCount(0);
  await expect(
    page.getByText('Plan a story scene by scene, then generate it.'),
  ).toBeVisible();
  // The subbar holds only the search: no filters, tabs or view toggle.
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Filters/ })).toHaveCount(0);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByTestId('collapsible-search-trigger')).toBeVisible();
  await expect(page.getByTestId('organization-switcher-trigger')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveText(
    'Apps',
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

  await page.getByTestId('collapsible-search-trigger').click();
  await page.getByPlaceholder('Search apps').fill('trending');
  await expect(apps).toHaveCount(1);
  await expect(detail).toHaveCount(0);
  await page.getByPlaceholder('Search apps').fill('nothing-matches');
  await expect(page.getByTestId('apps-empty')).toBeVisible();
  await page.getByRole('button', { name: 'Show all apps' }).click();
  await expect(apps).toHaveCount(9);

  await page.screenshot({
    path: testInfo.outputPath('apps-desktop.png'),
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
    path: testInfo.outputPath('apps-mobile.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveText(
    'Apps',
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
  await page.goto(orgPath('/apps'), { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: 'Select Storyboard', exact: true })
    .click();
  const detail = page.getByTestId('apps-app-detail');
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
