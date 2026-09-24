import { expect, test } from '../../fixtures/auth.fixture';

const USAGE_ROUTES = [
  '/test-org/~/settings/usage',
  '/test-org/brand-1/settings/usage',
];

test.describe('Usage with the default API fixtures', () => {
  for (const path of USAGE_ROUTES) {
    test(`renders an empty cost summary at ${path}`, async ({
      authenticatedPage,
    }) => {
      const summaryResponse = authenticatedPage.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === '/v1/costs/summary' &&
          response.request().method() === 'GET'
        );
      });

      await authenticatedPage.goto(path, { waitUntil: 'domcontentloaded' });
      expect((await summaryResponse).ok()).toBe(true);

      await expect(
        authenticatedPage.getByRole('heading', { name: 'Usage', exact: true }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByText('0 GEN', { exact: true }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Daily credit burn (GEN)',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Daily generations',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        authenticatedPage
          .getByText('No usage in this period', { exact: true })
          .first(),
      ).toBeVisible();
    });
  }
});
