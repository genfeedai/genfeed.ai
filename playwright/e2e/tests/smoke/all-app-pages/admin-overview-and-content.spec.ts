import { test } from '../../../fixtures/auth.fixture';
import {
  sweepAdminBucket,
  useMockApiServer,
} from '../../../utils/app-page-sweep';

test.describe('All App Pages', () => {
  test.setTimeout(900_000);
  useMockApiServer();

  test('admin accounts overview pages render', async ({ adminPage }) => {
    await sweepAdminBucket(adminPage, 'admin accounts overview');
  });

  test('admin administration automation pages render', async ({
    adminPage,
  }) => {
    await sweepAdminBucket(adminPage, 'admin administration automation');
  });

  test('admin configuration pages render', async ({ adminPage }) => {
    await sweepAdminBucket(adminPage, 'admin configuration');
  });

  test('admin content pages render', async ({ adminPage }) => {
    await sweepAdminBucket(adminPage, 'admin content');
  });

  test('admin settings pages render', async ({ adminPage }) => {
    await sweepAdminBucket(adminPage, 'admin settings');
  });
});
