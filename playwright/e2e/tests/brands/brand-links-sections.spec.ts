import {
  mockActiveSubscription,
  mockBrandWithMedia,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

// Connected accounts and website links are two sections of the brand page.
// Like every other section, their title and action sit above the card.
test.describe('Brand connected accounts and website links', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockBrandWithMedia(authenticatedPage);
  });

  test('each section keeps its title and action outside the card', async ({
    authenticatedPage,
  }) => {
    const route = brandPath('/settings');
    await authenticatedPage.goto(route, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await assertNoErrorBoundaryFallback(authenticatedPage, route);

    for (const [title, action] of [
      ['Connected accounts', 'Manage'],
      ['Website links', 'Add link'],
    ] as const) {
      const heading = authenticatedPage.getByRole('heading', {
        exact: true,
        name: title,
      });
      await expect(heading).toBeVisible({ timeout: 30000 });
      await expect(
        heading.locator('xpath=ancestor::*[contains(@class,"rounded-card")]'),
      ).toHaveCount(0);
      await expect(
        heading
          .locator('xpath=ancestor::section[1]')
          .getByRole(action === 'Manage' ? 'link' : 'button', {
            name: action,
          }),
      ).toBeVisible();
    }

    await expect(
      authenticatedPage.getByRole('heading', { name: 'Social & links' }),
    ).toHaveCount(0);
  });
});
