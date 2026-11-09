import {
  mockActiveSubscription,
  mockBrandIdentityDefaults,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const logo = (id: string, kitSlot: string) => ({
  category: 'LOGO',
  cdnUrl: PIXEL,
  id,
  kitSlot,
});

const brandAttributes = {
  banner: { category: 'BANNER', cdnUrl: PIXEL, id: 'banner-master', kitSlot: 'BANNER_MASTER' },
  banners: [
    { category: 'BANNER', cdnUrl: PIXEL, id: 'banner-master', kitSlot: 'BANNER_MASTER' },
    { category: 'BANNER', cdnUrl: PIXEL, id: 'banner-x', kitSlot: 'X_HEADER' },
  ],
  createdAt: '2026-11-09T00:00:00.000Z',
  credentials: [],
  description: 'Brand kit fixture',
  id: 'brand-1',
  label: 'Brand 1',
  links: [],
  logo: logo('logo-primary', 'LOGO_PRIMARY'),
  logos: [logo('logo-primary', 'LOGO_PRIMARY'), logo('logo-icon', 'LOGO_ICON')],
  name: 'Brand 1',
  scope: 'private',
  slug: 'brand-1',
  updatedAt: '2026-11-09T00:00:00.000Z',
  watermarkOpacity: 0.35,
  watermarkPosition: 'bottom-right',
};

test.describe('Brand kit logo variants and platform images', () => {
  test('lists every slot and fills the empty platform slots from the master banner', async ({
    authenticatedPage,
  }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockBrandIdentityDefaults(authenticatedPage);

    const brandBody = JSON.stringify({
      data: { attributes: brandAttributes, id: 'brand-1', type: 'brand' },
    });
    // Registered after the shared mocks, so these win for the brand routes.
    for (const pattern of ['**/brands/brand-1', '**/brands/slug**']) {
      await authenticatedPage.route(pattern, (route) =>
        route.fulfill({
          body: brandBody,
          contentType: 'application/json',
          status: 200,
        }),
      );
    }
    let fillBody: { slots?: string[] } | undefined;
    await authenticatedPage.route(
      '**/brands/brand-1/kit/platform-images/from-master',
      async (route) => {
        fillBody = route.request().postDataJSON() as { slots?: string[] };
        await route.fulfill({
          body: JSON.stringify({
            data: (fillBody?.slots ?? []).map((slot) => ({
              assetId: `filled-${slot}`,
              slot,
              status: 'filled',
            })),
          }),
          contentType: 'application/json',
          status: 201,
        });
      },
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
      authenticatedPage.getByRole('heading', { name: 'Logo variants' }),
    ).toBeVisible({ timeout: 30000 });
    const primary = authenticatedPage.getByRole('figure', { name: 'Primary' });
    await expect(primary.getByText('Default')).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Replace Icon or mark' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Upload Wordmark' }),
    ).toBeVisible();

    const youtube = authenticatedPage.getByRole('figure', {
      name: 'YouTube channel banner',
    });
    await expect(youtube.getByText(/2560 × 1440 px/)).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Replace X header' }),
    ).toBeVisible();

    await authenticatedPage
      .getByRole('button', { name: 'Fill empty slots from master banner' })
      .click();

    await expect(authenticatedPage.getByText('7 slots filled')).toBeVisible();
    expect(fillBody?.slots).toEqual([
      'X_PROFILE',
      'YOUTUBE_BANNER',
      'YOUTUBE_PROFILE',
      'LINKEDIN_COVER',
      'LINKEDIN_LOGO',
      'FACEBOOK_COVER',
      'FACEBOOK_PROFILE',
    ]);
  });
});
