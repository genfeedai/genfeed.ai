import { expect, test } from '../../fixtures/auth.fixture';

/**
 * One load of the workspace Overview sent 32 API calls, some of them twice, and
 * two of them for a thread called `undefined` (epic #10926, #10929). A read two
 * parts of the shell both need is one request, and nothing is asked for before
 * the id it needs exists.
 */
const READS_MADE_AT_MOST_ONCE = [
  '/agent/threads/master',
  '/auth/bootstrap',
  '/auth/bootstrap/overview',
  '/subscriptions/current/credits',
  '/tasks/inbox/read-state',
];

test.describe('Workspace overview — requests on a hard load', () => {
  test.setTimeout(90_000);

  test('asks for each shared read once and never for an id of undefined', async ({
    authenticatedPage: page,
  }) => {
    const apiRequests: string[] = [];
    const requestLog: string[] = [];
    const startedAt = Date.now();
    page.on('request', (request) => {
      const { pathname, search } = new URL(request.url());
      const apiPath = pathname.split('/v1').at(1);
      if (apiPath !== undefined && pathname.includes('/v1/')) {
        apiRequests.push(`${apiPath}${search}`);
        requestLog.push(`+${Date.now() - startedAt}ms ${apiPath}${search}`);
      }
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('app-content-shell')).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect(apiRequests.length).toBeGreaterThan(0);
    expect(apiRequests.filter((path) => path.includes('undefined'))).toEqual(
      [],
    );
    for (const read of READS_MADE_AT_MOST_ONCE) {
      const requestsForRead = apiRequests.filter(
        (path) => path.split('?').at(0) === read,
      );
      expect(
        requestsForRead.length,
        `${read} requested; every request: ${requestLog.join(' | ')}`,
      ).toBeLessThanOrEqual(1);
    }
  });
});
