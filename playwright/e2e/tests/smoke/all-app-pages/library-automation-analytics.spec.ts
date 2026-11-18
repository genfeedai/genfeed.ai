import { test } from '../../../fixtures/auth.fixture';
import {
  sweepProtectedBucket,
  useMockApiServer,
} from '../../../utils/app-page-sweep';

test.describe('All App Pages', () => {
  test.setTimeout(900_000);
  useMockApiServer();

  test('protected edit library pages render', async ({ authenticatedPage }) => {
    await sweepProtectedBucket(authenticatedPage, 'protected edit library');
  });

  test('protected automation pages render', async ({ authenticatedPage }) => {
    await sweepProtectedBucket(authenticatedPage, 'protected automation');
  });

  test('protected analytics pages render', async ({ authenticatedPage }) => {
    await sweepProtectedBucket(authenticatedPage, 'protected analytics');
  });
});
