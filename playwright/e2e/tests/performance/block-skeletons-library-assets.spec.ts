import { expect, test } from '../../fixtures/auth.fixture';
import { holdRequests } from '../../utils/block-skeleton-helpers';

const ROUTE = '/test-org/brand-1/library/assets';

test.describe('Library assets — block skeletons', () => {
  test.setTimeout(90_000);

  test('shows the page frame before the asset list and fills the grid on its own', async ({
    authenticatedPage: page,
  }) => {
    const held = await holdRequests(page, (url) =>
      url.pathname.endsWith('/ingredients'),
    );

    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await held.whenHeld;

    // The browser frame (search and filters) does not wait for the list.
    await expect(page.getByRole('button', { name: 'Filters' })).toBeVisible();
    await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();

    held.release();
    await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  });
});
