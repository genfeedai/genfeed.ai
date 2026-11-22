import { existsSync } from 'node:fs';
import { expect, test } from '../../../fixtures/auth.fixture';
import {
  adminRouteBuckets,
  adminRoutes,
  appRoot,
  expectAllRoutesBucketed,
  expectEveryBucketHasOneTest,
  protectedRouteBuckets,
  protectedRoutes,
  routes,
  sweepProtectedBucket,
  useMockApiServer,
} from '../../../utils/app-page-sweep';

test.describe('All App Pages', () => {
  test.setTimeout(900_000);
  useMockApiServer();

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
