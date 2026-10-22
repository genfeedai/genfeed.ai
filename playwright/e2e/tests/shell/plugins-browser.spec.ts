import { expect, test } from '../../fixtures/auth.fixture';
import { orgPath } from '../../utils/app-chrome';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

// Uses the existing isolated auth/API fixture; no live installations or providers.
test('organization Plugins browser keeps scope, filters and previews usable on desktop and mobile', async ({
  authenticatedPage: page,
}, testInfo) => {
  await page.goto(orgPath('/plugins'), { waitUntil: 'domcontentloaded' });
  const chooser = page.getByTestId('plugins-apps');
  const detail = page.getByTestId('plugins-app-detail');
  await expect(chooser.getByRole('button')).toHaveCount(9);
  await expect(page.getByRole('tablist', { name: 'App status' })).toHaveCount(
    1,
  );
  await expect(
    page.getByRole('tab', { name: 'ALL', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('combobox', { name: 'Category' })).toBeVisible();
  await expect(page.getByTestId('organization-switcher-trigger')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveText(
    'Plugins',
  );
  await expect(
    page.getByRole('button', { name: /select brand|brand 1/i }),
  ).toHaveCount(0);

  await chooser
    .getByRole('button', { name: 'Select Storyboard', exact: true })
    .click();
  await expect(
    detail.getByRole('heading', { name: 'Storyboard' }),
  ).toBeVisible();
  await expect(
    detail.getByRole('link', { name: 'Open Storyboard' }),
  ).toHaveAttribute('href', /\/studio\/storyboard$/);
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

  await page.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name: 'Publish & grow' }).click();
  await expect(chooser.getByRole('button')).toHaveCount(2);
  await expect(detail.getByRole('heading', { name: 'Messages' })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Search plugins' })
    .fill('nothing-matches');
  await expect(page.getByTestId('plugins-empty')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(chooser.getByRole('button')).toHaveCount(9);

  await page.getByRole('tab', { name: 'Available' }).click();
  await expect(page.getByTestId('plugins-empty')).toBeVisible();
  await page.getByRole('tab', { name: 'ALL', exact: true }).click();
  await page.getByRole('tab', { name: 'ALL', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('tab', { name: 'Installed', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'ALL', exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath('plugins-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await chooser
    .getByRole('button', { name: 'Select Discovery', exact: true })
    .click();
  await expect(
    detail.getByRole('heading', { name: 'Discovery' }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveText(
    'Plugins',
  );
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
  await page.getByTestId('plugins-app-storyboard').click();
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
