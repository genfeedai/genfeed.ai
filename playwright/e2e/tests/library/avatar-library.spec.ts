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

async function openAvatarRow(page: Page, label: string): Promise<void> {
  const row = page.locator('tr', { hasText: label });
  await expect(row).toBeVisible({ timeout: 30000 });
  await row.locator('[data-testid="action-button"]').click();
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
    // Navigate with the explicit E2E org+brand slugs (brandPath), not the
    // bare path: the proxy's active-workspace resolution for a bare
    // `/library/*` path is cached server-side per session and is not
    // deterministic across parallel workers sharing one dev server.
    const avatarsRoute = brandPath(APP_ROUTES.LIBRARY.AVATARS);
    await authenticatedPage.goto(avatarsRoute, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await assertNoErrorBoundaryFallback(authenticatedPage, avatarsRoute);

    // Library moved to query-param routes (#5135): APP_ROUTES.LIBRARY.AVATARS
    // now resolves to /library/assets?categories=AVATAR, not /library/avatars.
    await expect(authenticatedPage).toHaveURL(
      /library\/assets\?categories=AVATAR/,
    );
    await useListView(authenticatedPage);
    await expect(
      authenticatedPage.getByText('Avatar Action Source'),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      authenticatedPage.getByText('Avatar Action Video'),
    ).toBeVisible({ timeout: 30000 });
  });

  test('opens avatar source details with default-avatar actions', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(brandPath(APP_ROUTES.LIBRARY.AVATARS), {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage.waitForLoadState('domcontentloaded');
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
    await authenticatedPage.goto(brandPath(APP_ROUTES.LIBRARY.AVATARS), {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage.waitForLoadState('domcontentloaded');
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
