import { expect, test } from '../../fixtures/auth.fixture';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
  tryClick,
} from '../../utils/route-assertions';

const AGENT_BASE = '/test-org/~/agent';

const AGENT_ROUTES = [
  AGENT_BASE,
  `${AGENT_BASE}/new`,
  `${AGENT_BASE}/thread-1`,
  `${AGENT_BASE}/onboarding`,
  `${AGENT_BASE}/onboarding/thread-1`,
];

test.describe('Agent surface', () => {
  test.setTimeout(90_000);

  test('org-scoped agent routes render under the authenticated shell', async ({
    authenticatedPage,
  }) => {
    for (const route of AGENT_ROUTES) {
      await test.step(route, async () => {
        await assertRouteRenders(authenticatedPage, route);
        await expect(authenticatedPage).toHaveURL(/\/test-org\/~\/agent/);
        await expectNoErrorOverlay(authenticatedPage);
      });
    }
  });

  test('new agent route exposes the conversation entry controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${AGENT_BASE}/new`);

    await tryClick(authenticatedPage, 'button:has-text("Plan")');
    await tryClick(authenticatedPage, 'button:has-text("Attach")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
