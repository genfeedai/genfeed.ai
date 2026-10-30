import {
  mockActiveSubscription,
  mockBrandIdentityDefaults,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

const brandAttributes = {
  createdAt: '2026-10-29T00:00:00.000Z',
  credentials: [],
  description: 'Brand detail fixture',
  id: 'brand-1',
  imageUrl: 'https://cdn.genfeed.ai/mock/brands/brand-1.png',
  label: 'Brand 1',
  links: [],
  name: 'Brand 1',
  scope: 'private',
  slug: 'brand-1',
  updatedAt: '2026-10-29T00:00:00.000Z',
  watermarkInsetXRatio: 0.096,
  watermarkOpacity: 0.35,
  watermarkPosition: 'top-right',
  watermarkSizeRatio: 0.0667,
  watermarkText: null,
};

test.describe('Brand watermark placement', () => {
  test('shows the saved size and distances as percents and saves them as ratios of the width', async ({
    authenticatedPage,
  }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockBrandIdentityDefaults(authenticatedPage);

    let patchBody: Record<string, unknown> | undefined;
    // Registered after the shared mocks, so these win for the brand routes.
    await authenticatedPage.route('**/brands/brand-1', async (route) => {
      if (route.request().method() === 'PATCH') {
        patchBody = route.request().postDataJSON() as Record<string, unknown>;
      }
      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: { ...brandAttributes, ...(patchBody ?? {}) },
            id: 'brand-1',
            type: 'brand',
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
    });
    await authenticatedPage.route('**/brands/slug**', async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: {
            attributes: { ...brandAttributes, ...(patchBody ?? {}) },
            id: 'brand-1',
            type: 'brand',
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
    });

    const route = brandPath('/settings/brand-kit/visual');
    await authenticatedPage.goto(route, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await assertNoErrorBoundaryFallback(authenticatedPage, route);

    await authenticatedPage
      .getByRole('button', { name: /Assets, references & watermark/ })
      .click();
    const size = authenticatedPage.getByLabel('Size (% of width)');
    await expect(size).toHaveValue('6.67', { timeout: 30000 });
    await expect(
      authenticatedPage.getByLabel('From side edge (% of width)'),
    ).toHaveValue('9.6');

    await authenticatedPage
      .getByLabel('From top or bottom edge (% of width)')
      .fill('23.5');
    await authenticatedPage
      .getByRole('button', { name: 'Save watermark', exact: true })
      .click();

    await expect(
      authenticatedPage.getByText('Watermark settings saved.'),
    ).toBeVisible();
    expect(patchBody).toMatchObject({
      watermarkInsetXRatio: 0.096,
      watermarkInsetYRatio: 0.235,
      watermarkPosition: 'top-right',
      watermarkSizeRatio: 0.0667,
    });

    // A size outside the allowed range cannot be saved.
    await size.fill('80');
    await expect(
      authenticatedPage.getByRole('button', {
        name: 'Save watermark',
        exact: true,
      }),
    ).toBeDisabled();
  });
});
