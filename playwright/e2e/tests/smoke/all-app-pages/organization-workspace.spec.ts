import { test } from '../../../fixtures/auth.fixture';
import {
  sweepAdminBucket,
  sweepProtectedBucket,
  useMockApiServer,
} from '../../../utils/app-page-sweep';

test.describe('All App Pages', () => {
  test.setTimeout(900_000);
  useMockApiServer();

  test('protected organization workspace pages render', async ({
    authenticatedPage,
  }) => {
    await sweepProtectedBucket(
      authenticatedPage,
      'protected organization workspace',
    );
  });

  test('admin core pages render', async ({ adminPage }) => {
    await sweepAdminBucket(adminPage, 'admin core');
  });

  test('admin flags pages render', async ({ adminPage }) => {
    await sweepAdminBucket(adminPage, 'admin flags');
  });

  test('admin library media pages render', async ({ adminPage }) => {
    await sweepAdminBucket(adminPage, 'admin library media');
  });
});
