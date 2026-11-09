import { existsSync } from 'node:fs';
import { expect, test } from '../../../fixtures/auth.fixture';
import {
  adminRouteBuckets,
  adminRoutes,
  appRoot,
  assertRouteLoads,
  expectAllRoutesBucketed,
  expectEveryBucketHasOneTest,
  mockSocialTimelines,
  protectedRouteBuckets,
  protectedRoutes,
  routes,
  socialTimelinePayload,
  sweepProtectedBucket,
  useMockApiServer,
} from '../../../utils/app-page-sweep';

test.describe('All App Pages', () => {
  test.setTimeout(900_000);
  useMockApiServer();

  test('Following shows the empty raw-timeline response without an error boundary', async ({
    authenticatedPage,
  }) => {
    await mockSocialTimelines(authenticatedPage);
    const timelineResponse = authenticatedPage.waitForResponse((response) =>
      /\/social-timelines\/?$/.test(new URL(response.url()).pathname),
    );
    await assertRouteLoads(
      authenticatedPage,
      '/test-org/brand-1/discovery/following',
    );
    const body: unknown = await (await timelineResponse).json();
    expect(body).toEqual(socialTimelinePayload());
    await test.info().attach('raw-timeline-response', {
      body: JSON.stringify(body),
      contentType: 'application/json',
    });
    await expect(
      authenticatedPage.getByRole('button', { name: 'Refresh feeds' }),
    ).toBeDisabled();
    await expect(
      authenticatedPage.getByText('Connect an account'),
    ).toBeVisible();
  });

  test('protected content operations pages render', async ({
    authenticatedPage,
  }) => {
    await sweepProtectedBucket(
      authenticatedPage,
      'protected content operations',
    );
  });

  test('route discovery found app pages', () => {
    expect(existsSync(appRoot)).toBe(true);
    expect(routes.length).toBeGreaterThan(100);
    expectAllRoutesBucketed(protectedRoutes, protectedRouteBuckets);
    expectAllRoutesBucketed(adminRoutes, adminRouteBuckets);
    expectEveryBucketHasOneTest();
  });
});
