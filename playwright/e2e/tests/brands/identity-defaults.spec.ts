import {
  mockActiveSubscription,
  mockBrandIdentityDefaults,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { BrandsPage } from '../../pages/brands.page';
import { brandPath } from '../../utils/app-chrome';
import { selectVisibleRadixOption } from '../../utils/radix-select';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

test.describe('Brand Identity Defaults', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockBrandIdentityDefaults(authenticatedPage);
  });

  test('shows organization fallback and lets a brand override the avatar default', async ({
    authenticatedPage,
  }) => {
    const brandsPage = new BrandsPage(authenticatedPage);

    // gotoBrandDetail() targets `/settings/brands/:id`, which has no page
    // component (only a brands *list* page exists under
    // `~/settings/brands/`). The brand identity defaults card
    // (BrandDetailIdentityCard, data-testid="brand-identity-card") actually
    // renders on the brand-scoped Agent Defaults page. brandPath() uses the
    // explicit E2E org+brand slugs (test-org/brand-1, matching this fixture's
    // mocked brand) rather than a bare path, since bare-path active-workspace
    // resolution is cached server-side per session and is not deterministic
    // across parallel workers sharing one dev server.
    const brandAgentDefaultsRoute = brandPath('/settings/agent-defaults');
    await authenticatedPage.goto(brandAgentDefaultsRoute, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await assertNoErrorBoundaryFallback(
      authenticatedPage,
      brandAgentDefaultsRoute,
    );

    await expect(brandsPage.brandIdentityCard).toBeVisible({ timeout: 30000 });
    await expect(
      authenticatedPage.getByText(
        'This brand is currently using organization identity defaults.',
      ),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      authenticatedPage.getByText(/Current avatar:\s+Fallback Avatar\./),
    ).toBeVisible({ timeout: 30000 });

    await brandsPage.brandDefaultAvatarTrigger.click();
    await expect(
      authenticatedPage.locator('[role="option"]', {
        hasText: 'Avatar Source One',
      }),
    ).toBeVisible();
    await expect(
      authenticatedPage.locator('[role="option"]', {
        hasText: 'Avatar Video One',
      }),
    ).toHaveCount(0);

    await selectVisibleRadixOption(
      authenticatedPage,
      brandsPage.brandDefaultAvatarTrigger,
      'Avatar Source One',
    );
    await brandsPage.saveBrandIdentityButton.click();

    await expect(
      authenticatedPage.getByText('Brand identity defaults saved'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(/Current avatar:\s+Avatar Source One\./),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(
        'This brand is currently using organization identity defaults.',
      ),
    ).toHaveCount(0);
  });
});
