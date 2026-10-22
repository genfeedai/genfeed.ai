import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { createPlaywrightApiRoutePattern } from '../../config/environment';
import {
  mockActiveSubscription,
  mockAnalyticsData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';

test.describe('Import published posts for analytics', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAnalyticsData(authenticatedPage);
  });

  test('imports a LinkedIn article with honest availability and an Imported badge', async ({
    authenticatedPage: page,
  }, testInfo) => {
    let hasImported = false;
    let hasRejected = false;
    await page.route(
      createPlaywrightApiRoutePattern('posts/track-link$'),
      async (route) => {
        const input = route.request().postDataJSON();
        if (input.url.includes('example.com')) {
          hasRejected = true;
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              message: 'Supported platforms are X, YouTube and LinkedIn',
            }),
          });
          return;
        }
        expect(input.title).toBe('Original article');
        expect(input.url).toBe('https://linkedin.com/pulse/hello-alice');
        expect(input.brandId).toBeTruthy();
        expect(input).not.toHaveProperty('organizationId');
        hasImported = true;
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              type: 'post-link-tracking',
              id: 'imported-post',
              attributes: {
                postId: 'imported-post',
                created: true,
                source: 'extension',
                analyticsAvailability: 'api-access-required',
                url: input.url,
                externalId: null,
                credentialId: null,
              },
            },
          }),
        });
      },
    );
    await page.route(
      createPlaywrightApiRoutePattern('analytics/top[?]'),
      async (route) => {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            data: hasImported
              ? [
                  {
                    type: 'analytics-top-post',
                    id: 'imported-post',
                    attributes: {
                      postId: 'imported-post',
                      label: 'Original article',
                      platform: 'linkedin',
                      brandName: 'Brand 1',
                      source: 'extension',
                      metricsStatus: 'unavailable',
                      totalViews: 0,
                      totalEngagement: 0,
                      engagementRate: 0,
                    },
                  },
                ]
              : [],
          }),
        });
      },
    );
    await page.goto(brandPath(APP_ROUTES.ANALYTICS.POSTS));
    await page
      .getByRole('button', { name: 'Track a post', exact: true })
      .click();
    const modal = page.getByRole('dialog', { name: 'Track a post' });
    await expect(modal).toBeVisible();
    await modal.getByLabel(/Post link/).fill('https://example.com/post');
    await modal
      .getByRole('button', { name: 'Import post', exact: true })
      .click();
    await expect(modal.getByRole('alert')).toContainText('Supported platforms');
    expect(hasRejected).toBe(true);
    await modal
      .getByLabel(/Post link/)
      .fill('https://linkedin.com/pulse/hello-alice');
    await modal.getByLabel('Title (optional)').fill('Original article');
    await expect(modal.getByRole('alert')).toHaveCount(0);
    await expect(
      modal.getByText(/LinkedIn metrics are unavailable/),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('track-post-modal.png'),
      timeout: 10000,
      animations: 'disabled',
    });
    await modal
      .getByRole('button', { name: 'Import post', exact: true })
      .click();
    await expect(modal).not.toBeVisible();
    await expect(page).toHaveURL(/postId=imported-post/);
    await expect(
      page.getByRole('status').filter({ hasText: 'Post imported' }),
    ).toContainText('LinkedIn metrics are unavailable');
    const imported = page
      .getByTestId('analytics-post-card')
      .filter({ hasText: 'Original article' });
    await expect(imported.getByText('Imported', { exact: true })).toBeVisible();
    await expect(
      imported.getByText('Metrics unavailable', { exact: true }),
    ).toBeVisible();
    await expect(imported.getByText('0.00%')).toHaveCount(0);
    await expect(page).toHaveURL(/postId=imported-post/);
  });

  test('opens the existing post on a duplicate import', async ({
    authenticatedPage: page,
  }) => {
    await page.route(
      createPlaywrightApiRoutePattern('posts/track-link$'),
      async (route) => {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              type: 'post-link-tracking',
              id: 'existing-post',
              attributes: {
                postId: 'existing-post',
                created: false,
                source: 'extension',
                analyticsAvailability: 'eligible',
              },
            },
          }),
        });
      },
    );
    await page.goto(brandPath(APP_ROUTES.ANALYTICS.POSTS));
    await page
      .getByRole('button', { name: 'Track a post', exact: true })
      .click();
    const modal = page.getByRole('dialog', { name: 'Track a post' });
    await modal.getByLabel(/Post link/).fill('https://x.com/alice/status/123');
    await modal
      .getByRole('button', { name: 'Import post', exact: true })
      .click();
    await expect(page).toHaveURL(/postId=existing-post/);
    await expect(
      page.getByRole('status').filter({ hasText: 'Already tracked' }),
    ).toBeVisible();
    await page.getByPlaceholder('Search posts...').fill('existing-post');
    await expect(page).toHaveURL(/postId=existing-post/);
  });
});
