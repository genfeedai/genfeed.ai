import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  mockActiveSubscription,
  mockLibraryData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

test('Library sub bar leads with the "..." menu, then Refresh, and keeps secondary actions in the menu', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await mockLibraryData(page);
  await page.goto(brandPath(APP_ROUTES.LIBRARY.ASSETS), {
    waitUntil: 'domcontentloaded',
  });

  const bar = page.getByTestId('section-topbar-actions');
  const more = bar.getByRole('button', { name: 'More actions', exact: true });
  const refresh = bar.getByRole('button', { name: 'Refresh', exact: true });
  await expect(more).toBeVisible();
  await expect(refresh).toBeVisible();

  // "..." is the first control of the right cluster, Refresh is next to it.
  const moreBox = await more.boundingBox();
  const refreshBox = await refresh.boundingBox();
  expect(moreBox).not.toBeNull();
  expect(refreshBox).not.toBeNull();
  expect(moreBox?.x ?? 0).toBeLessThan(refreshBox?.x ?? 0);

  // Upload and tags are not loose icons any more.
  await expect(
    bar.getByRole('button', { name: 'Upload', exact: true }),
  ).toHaveCount(0);
  await more.click();
  await expect(
    page.getByRole('menuitem', { name: 'Upload', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('menuitem', { name: 'Manage tags', exact: true }),
  ).toBeVisible();
});
