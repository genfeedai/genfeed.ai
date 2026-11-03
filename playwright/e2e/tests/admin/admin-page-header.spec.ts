import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders } from '../../utils/route-assertions';

/**
 * The page header contract on admin pages: the organization and brand are
 * facets of the one Filters menu, never dropdowns of their own, and the date
 * range sits right before the primary action.
 *
 * Uses the adminPage fixture; unknown API routes auto-return empty
 * collections, so each page renders without bespoke mocks.
 */

const DATE_RANGE_NAME =
  /^[A-Z][a-z]{2} \d{1,2}(, \d{4})? - [A-Z][a-z]{2} \d{1,2}, \d{4}$/;

async function openFiltersMenu(page: Page): Promise<void> {
  await page
    .getByRole('main')
    .getByRole('button', { name: /^Filters/ })
    .click();
}

test.describe('Admin page header', () => {
  test.setTimeout(90_000);

  for (const route of [
    APP_ROUTES.ADMIN.AUTOMATION.TRAININGS,
    APP_ROUTES.ADMIN.CONFIGURATION.PRESETS,
  ]) {
    test(`${route} offers the organization as a Filters facet`, async ({
      adminPage,
    }) => {
      await assertRouteRenders(adminPage, route);

      await expect(
        adminPage.getByRole('button', { name: /^Filter by organization/i }),
      ).toHaveCount(0);

      await openFiltersMenu(adminPage);
      await expect(
        adminPage.getByRole('menuitem', { name: /^Organization/ }),
      ).toBeVisible();
      // No organization picked yet, so no brand facet either.
      await expect(
        adminPage.getByRole('menuitem', { name: /^Brand/ }),
      ).toHaveCount(0);
    });
  }

  test('the organization in the URL is a counted Filters facet with a brand facet next to it', async ({
    adminPage,
  }) => {
    await assertRouteRenders(
      adminPage,
      `${APP_ROUTES.ADMIN.AUTOMATION.TRAININGS}?organization=org-e2e-1`,
    );

    await expect(
      adminPage.getByRole('main').getByRole('button', { name: /^Filters/ }),
    ).toContainText('1');

    await openFiltersMenu(adminPage);
    await expect(
      adminPage.getByRole('menuitem', { name: /^Organization/ }),
    ).toBeVisible();
    await expect(
      adminPage.getByRole('menuitem', { name: /^Brand/ }),
    ).toBeVisible();

    await adminPage.getByRole('menuitem', { name: 'Clear filters' }).click();
    await expect(adminPage).not.toHaveURL(/organization=/);
  });

  test('the organizations list puts the date range right before the primary action', async ({
    adminPage,
  }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.ORGANIZATIONS);

    const actions = adminPage.getByTestId('section-topbar-actions');
    const dateRange = actions.getByRole('button', { name: DATE_RANGE_NAME });
    const primaryAction = actions.getByRole('button', {
      name: 'Provision concierge account',
    });
    await expect(dateRange).toBeVisible();
    await expect(primaryAction).toBeVisible();

    const dateRangeBox = await dateRange.boundingBox();
    const primaryActionBox = await primaryAction.boundingBox();
    expect(dateRangeBox).not.toBeNull();
    expect(primaryActionBox).not.toBeNull();
    expect(dateRangeBox?.x ?? Number.POSITIVE_INFINITY).toBeLessThan(
      primaryActionBox?.x ?? Number.NEGATIVE_INFINITY,
    );
  });
});
