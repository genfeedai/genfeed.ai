import { IngredientCategory } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Locator, Page } from '@playwright/test';
import {
  mockActiveSubscription,
  mockAvatarIngredientActions,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { openFilterFacet } from '../../utils/filter-menu';
import { waitForIngredientsRead } from '../../utils/ingredients-requests';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';
import { chooseView } from '../../utils/view-menu';

/**
 * The avatar library defaults to Canvas view (LibraryCanvas — a free-placement
 * preview board with no text labels), not List (IngredientsListContent's
 * `<AppTable>`, real `<tr>` rows with visible labels). Force List so item
 * names are actual text and `openAvatarRow`'s `tr` locator has something to
 * match.
 */
async function useListView(page: Page): Promise<void> {
  await chooseView(page, 'List');
}

/**
 * Navigate with the explicit E2E org+brand slugs (brandPath), not the bare
 * path: the proxy's active-workspace resolution for a bare `/library/*` path
 * is cached server-side per session and is not deterministic across parallel
 * workers sharing one dev server. A library type is its own route (#8067),
 * so the avatars route stays on `/library/avatars`.
 */
async function gotoAvatarLibrary(page: Page): Promise<void> {
  const avatarsRoute = brandPath(APP_ROUTES.LIBRARY.AVATARS);
  // The avatars route seeds the AVATAR type into the library read.
  const avatarsRead = waitForIngredientsRead(page, [IngredientCategory.AVATAR]);
  await page.goto(avatarsRoute, {
    timeout: 60000,
    waitUntil: 'domcontentloaded',
  });
  await assertNoErrorBoundaryFallback(page, avatarsRoute);
  await expect(page).toHaveURL(/library\/avatars/);
  await avatarsRead;
}

/**
 * A row click opens the asset in the shell's right context sidebar (#7589);
 * the Library has no per-asset page to follow (only the admin lists link the
 * name to one). Returns the sidebar's "Asset details" panel.
 */
async function openAvatarRow(page: Page, label: string): Promise<Locator> {
  const row = page.locator('tr', { hasText: label });
  await expect(row).toBeVisible({ timeout: 30000 });
  await row.click();
  const inspector = page.getByRole('complementary', {
    name: 'Asset details',
    exact: true,
  });
  await expect(
    inspector.getByRole('heading', { name: label, exact: true }),
  ).toBeVisible();
  return inspector;
}

test.describe('Avatar Library', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAvatarIngredientActions(authenticatedPage);
  });

  test('shows avatar source and video assets in the filtered avatar library', async ({
    authenticatedPage,
  }) => {
    await gotoAvatarLibrary(authenticatedPage);
    await useListView(authenticatedPage);
    await expect(
      authenticatedPage.locator('tr', { hasText: 'Avatar Action Source' }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      authenticatedPage.locator('tr', { hasText: 'Avatar Action Video' }),
    ).toBeVisible({ timeout: 30000 });

    // Status reads /ingredients/summary (ILibrarySummary). It is a facet of
    // the shared Filters menu (#7567): one radio row per shelf.
    const status = await openFilterFacet(authenticatedPage, 'Status');
    // The shelf count is a trailing badge (#8054), not part of the label.
    const needsReview = status.getByRole('menuitemradio', {
      name: /^Needs review\b/,
    });
    await expect(needsReview).toBeVisible();
    await expect(needsReview).toContainText('2');
  });

  // Choosing the organization and brand default avatar moved out of the asset
  // details (#7584) to the organization and brand identity settings, which
  // list only avatar source images (settings/organization-identity.spec.ts).
  // The Library keeps the asset side of that flow: each avatar opens in the
  // sidebar and offers no default-avatar actions of its own.
  test('opens avatar source details in the right sidebar', async ({
    authenticatedPage,
  }) => {
    await gotoAvatarLibrary(authenticatedPage);
    await useListView(authenticatedPage);

    const inspector = await openAvatarRow(
      authenticatedPage,
      'Avatar Action Source',
    );

    await expect(
      inspector.getByTestId('ingredient-set-org-avatar'),
    ).toHaveCount(0);
    await expect(
      inspector.getByTestId('ingredient-set-brand-avatar'),
    ).toHaveCount(0);
  });

  test('opens avatar video variant details in the right sidebar', async ({
    authenticatedPage,
  }) => {
    await gotoAvatarLibrary(authenticatedPage);
    await useListView(authenticatedPage);

    const inspector = await openAvatarRow(
      authenticatedPage,
      'Avatar Action Video',
    );

    await expect(
      inspector.getByTestId('ingredient-set-org-avatar'),
    ).toHaveCount(0);
    await expect(
      inspector.getByTestId('ingredient-set-brand-avatar'),
    ).toHaveCount(0);
  });
});
