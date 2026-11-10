import {
  mockActiveSubscription,
  mockBrandIdentityDefaults,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

test.describe('Brand kit file', () => {
  // Slot, font and kit-file controls are manager-only.
  test.use({ memberRole: 'admin' });

  test('imports a kit ZIP and reports what it added', async ({
    authenticatedPage,
  }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockBrandIdentityDefaults(authenticatedPage);
    let importRequests = 0;
    await authenticatedPage.route('**/kit/import', (route) => {
      importRequests += 1;
      return route.fulfill({
        body: JSON.stringify({
          data: {
            banners: ['X_HEADER'],
            fontCount: 1,
            hasColors: true,
            hasFontRoles: true,
            hasPalette: true,
            logos: ['LOGO_PRIMARY', 'LOGO_ICON'],
            skipped: [
              { file: 'logos/logo_dark.png', reason: 'unsupported_image' },
            ],
          },
        }),
        contentType: 'application/json',
        status: 201,
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

    await expect(
      authenticatedPage.getByRole('heading', { name: 'Kit file' }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      authenticatedPage.getByRole('button', { name: 'Download kit' }),
    ).toBeVisible();

    await authenticatedPage.getByLabel('Import kit ZIP').setInputFiles({
      buffer: Buffer.from('PK'),
      mimeType: 'application/zip',
      name: 'acme-brand-kit.zip',
    });

    const status = authenticatedPage
      .getByRole('status')
      .filter({ hasText: 'Kit imported' });
    await expect(status).toContainText(
      'Kit imported: 2 logos, 1 platform image and 1 font.',
    );
    await expect(status).toContainText(
      'Left out logos/logo_dark.png: the image is not a PNG, JPEG, WebP or GIF.',
    );
    expect(importRequests).toBe(1);
  });
});
