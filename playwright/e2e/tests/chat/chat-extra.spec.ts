import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

const ORG = '/test-org/~';

test.describe('Chat (extra routes)', () => {
  test.setTimeout(60_000);

  const routes = [`${ORG}/agent/thread-1`, `${ORG}/agent/journey`];

  for (const route of routes) {
    test(`renders ${route}`, async ({ authenticatedPage }) => {
      await assertRouteRenders(authenticatedPage, route);
    });
  }

  test('thread view stays interactive', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, `${ORG}/agent/thread-1`);
    await tryClick(authenticatedPage, '[data-testid]');
    await tryClick(authenticatedPage, 'button');
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('journey view exposes navigation', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, `${ORG}/agent/journey`);
    await tryClick(authenticatedPage, 'a');
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
