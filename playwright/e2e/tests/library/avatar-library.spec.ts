import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page } from '@playwright/test';
import {
  mockActiveSubscription,
  mockAvatarIngredientActions,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

/**
 * The avatar library defaults to Canvas view (LibraryCanvas — a free-placement
 * preview board with no text labels), not List (IngredientsListContent's
 * `<AppTable>`, real `<tr>` rows with visible labels). Force List so item
 * names are actual text and `openAvatarRow`'s `tr` locator has something to
 * match.
 */
async function useListView(page: Page): Promise<void> {
  await page.getByRole('radio', { name: 'List' }).click();
}

/**
 * Navigate with the explicit E2E org+brand slugs (brandPath), not the bare
 * path: the proxy's active-workspace resolution for a bare `/library/*` path
 * is cached server-side per session and is not deterministic across parallel
 * workers sharing one dev server. Library places are query filters on
 * `/library/assets` (#5135), so the avatars route lands on
 * `/library/assets?categories=AVATAR`.
 */
async function gotoAvatarLibrary(page: Page): Promise<void> {
  const avatarsRoute = brandPath(APP_ROUTES.LIBRARY.AVATARS);
  await page.goto(avatarsRoute, {
    timeout: 60000,
    waitUntil: 'domcontentloaded',
  });
  await assertNoErrorBoundaryFallback(page, avatarsRoute);
  await expect(page).toHaveURL(/library\/assets\?categories=AVATAR/);
}

async function openAvatarRow(page: Page, label: string): Promise<void> {
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
  await inspector
    .getByRole('button', { name: 'View full details', exact: true })
    .click();

  // The details panel (IngredientTabsInfo) is open once its label field shows
  // this ingredient's metadata label — the positive signal the absence checks
  // below depend on.
  await expect(
    page.getByRole('textbox', { name: 'Label', exact: true }),
  ).toBeVisible();
  await expect(page.locator('input[name="label"]')).toHaveValue(label);
}

test.describe('Avatar Library', () => {
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

    // Library sidebar counters come from /ingredients/summary (ILibrarySummary).
    await expect(
      authenticatedPage
        .getByRole('complementary', { exact: true, name: 'Navigation' })
        .getByRole('link', { exact: true, name: 'Needs review' }),
    ).toContainText('2');
  });

  test('opens avatar source details with default-avatar actions', async ({
    authenticatedPage,
  }) => {
    await gotoAvatarLibrary(authenticatedPage);
    await useListView(authenticatedPage);

    await openAvatarRow(authenticatedPage, 'Avatar Action Source');

    await expect(
      authenticatedPage.getByTestId('ingredient-set-org-avatar'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('ingredient-set-brand-avatar'),
    ).toBeVisible();
  });

  test('hides default-avatar actions for avatar video variants', async ({
    authenticatedPage,
  }) => {
    await gotoAvatarLibrary(authenticatedPage);
    await useListView(authenticatedPage);

    await openAvatarRow(authenticatedPage, 'Avatar Action Video');

    await expect(
      authenticatedPage.getByTestId('ingredient-set-org-avatar'),
    ).toHaveCount(0);
    await expect(
      authenticatedPage.getByTestId('ingredient-set-brand-avatar'),
    ).toHaveCount(0);
  });
});
