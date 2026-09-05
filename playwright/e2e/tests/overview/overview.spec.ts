import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  mockActiveSubscription,
  mockAnalyticsData,
  mockWorkspaceTasks,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { skipIfPlaywrightAuthBypassed } from '../../utils/playwright-auth-bypass';

test.describe('Overview Compatibility Redirect', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAnalyticsData(authenticatedPage);
    await mockWorkspaceTasks(authenticatedPage);
  });

  test('redirects authenticated users from /overview to /workspace', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.WORKSPACE.OVERVIEW, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(
      /\/workspace\/overview(?:$|[?#])/,
    );
    await expect(
      authenticatedPage.getByTestId('sidebar-shell').first(),
    ).toBeVisible();
  });
});

// A sibling describe (no `beforeEach` requiring `authenticatedPage`) — the
// suite above's beforeEach shares the default `page`/`context` with any
// fixture requested by a test in the same describe block, so an
// unauthenticated test nested inside it would inherit the authenticated
// cookies before its own null-session mocks ever apply (nightly full tier,
// #2982). Every other unauthenticated-access suite in this repo
// (discovery.spec.ts, tasks.spec.ts, post-detail.spec.ts, etc.) isolates the
// test the same way.
test.describe('Overview Compatibility Redirect — Unauthenticated Access', () => {
  test('keeps /overview as a compatibility redirect for unauthenticated users', async ({
    unauthenticatedPage,
  }) => {
    skipIfPlaywrightAuthBypassed();
    await unauthenticatedPage.goto(APP_ROUTES.WORKSPACE.OVERVIEW, {
      waitUntil: 'domcontentloaded',
    });

    await expect(unauthenticatedPage).toHaveURL(
      /\/workspace\/overview(?:$|[?#])/,
    );
  });
});
