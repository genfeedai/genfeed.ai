import {
  mockActiveSubscription,
  mockBrandIdentityDefaults,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

const font = {
  attributes: {
    brandId: 'brand-1',
    category: 'FONT',
    contentHash: `sha256:${'a'.repeat(64)}`,
    createdAt: '2026-11-09T00:00:00.000Z',
    displayName: 'Acme Display',
    isDeleted: false,
    mimeType: 'font/woff2',
    originalFileName: 'Acme-Display.woff2',
    sizeBytes: 2048,
    updatedAt: '2026-11-09T00:00:00.000Z',
  },
  id: 'font-1',
  type: 'brand-font-asset',
};

test.describe('Brand kit fonts', () => {
  // Slot, font and kit-file controls are manager-only.
  test.use({ memberRole: 'admin' });

  test('lists uploaded fonts and explains how to supply a TTF font', async ({
    authenticatedPage,
  }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockBrandIdentityDefaults(authenticatedPage);
    await authenticatedPage.route('**/font-assets/font-1/file', (route) =>
      route.fulfill({ status: 404 }),
    );
    await authenticatedPage.route('**/font-assets?**', (route) =>
      route.fulfill({
        body: JSON.stringify({
          data: [font],
          links: { cursor: { hasMore: false, limit: 50, nextCursor: null } },
        }),
        contentType: 'application/json',
        status: 200,
      }),
    );

    const route = brandPath('/settings/brand-kit/visual');
    await authenticatedPage.goto(route, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await assertNoErrorBoundaryFallback(authenticatedPage, route);

    await authenticatedPage
      .getByRole('button', { name: /Assets, references & watermark/ })
      .click();

    await expect(
      authenticatedPage.getByRole('heading', { name: 'Brand fonts' }),
    ).toBeVisible({ timeout: 30000 });
    await expect(authenticatedPage.getByText('Acme Display')).toBeVisible();

    await authenticatedPage.getByLabel('Upload WOFF2 font').setInputFiles({
      buffer: Buffer.from('not a woff2 font'),
      mimeType: 'font/ttf',
      name: 'Acme.ttf',
    });

    await expect(
      authenticatedPage
        .getByRole('alert')
        .filter({ hasText: 'Only WOFF2 files can be uploaded' }),
    ).toBeVisible();
  });
});
