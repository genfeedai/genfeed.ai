import {
  mockActiveSubscription,
  mockLibraryData,
} from '@e2e/fixtures/api-mocks.fixture';
import { expect, test } from '@e2e/fixtures/auth.fixture';
import { buildProtectedAppBootstrapPayload } from '@e2e/utils/api-interceptor';
import { brandPath, orgSettingsRoute } from '@e2e/utils/app-chrome';
import { assertRouteRenders } from '@e2e/utils/route-assertions';
import { SubscriptionStatus } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';

const routes = [
  brandPath(APP_ROUTES.WORKSPACE.OVERVIEW),
  brandPath(APP_ROUTES.SETTINGS.BRAND_KIT),
  brandPath(APP_ROUTES.LIBRARY.ASSETS),
  brandPath(APP_ROUTES.STUDIO.PLAYGROUND),
  orgSettingsRoute(APP_ROUTES.SETTINGS.GENERAL),
  orgSettingsRoute(APP_ROUTES.SETTINGS.CREDITS),
];

for (const width of [390, 1440]) {
  for (const account of ['paid', 'unpaid'] as const) {
    test(`${account} protected pages hydrate at ${width}px`, async ({
      authenticatedPage: page,
    }, testInfo) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (
          message.type() === 'error' &&
          /hydration|hydrating|Minified React error #(418|423|425)\b/i.test(
            message.text(),
          )
        ) {
          errors.push(message.text());
        }
      });

      const bootstrap = buildProtectedAppBootstrapPayload();
      bootstrap.access.isSuperAdmin = false;
      bootstrap.access.creditsBalance = account === 'paid' ? 500 : 0;
      bootstrap.access.hasEverHadCredits = account === 'paid';
      bootstrap.access.subscriptionStatus =
        account === 'paid'
          ? SubscriptionStatus.ACTIVE
          : SubscriptionStatus.UNPAID;
      bootstrap.access.subscriptionTier = account === 'paid' ? 'pro' : 'free';
      let bootstrapReads = 0;
      await mockActiveSubscription(page, {
        credits: bootstrap.access.creditsBalance,
      });
      await mockLibraryData(page);
      await page.route('**/v1/auth/bootstrap**', async (route) => {
        bootstrapReads += 1;
        await route.fulfill({ json: bootstrap });
      });
      if (account === 'unpaid') {
        await page.route('**/v1/organizations/*/subscription', (route) =>
          route.fulfill({ json: { data: null } }),
        );
      }

      // #6666 keeps completed-onboarding workspaces readable when unpaid.
      // Full document loads exercise SSR/client hydration on every route.
      for (const [index, route] of routes.entries()) {
        await test.step(route, async () => {
          await assertRouteRenders(page, route);
          await expect(page).toHaveURL((url) => url.pathname === route);
          const canvas = page.getByRole('region', {
            name: 'Primary workspace canvas',
            exact: true,
          });
          await expect(canvas).toBeVisible();
          await expect(canvas).not.toBeEmpty();
          expect(errors, `Browser errors on ${route}`).toEqual([]);
          await page.screenshot({
            path: testInfo.outputPath(`protected-${index}.png`),
          });
        });
      }
      expect(bootstrapReads).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });
  }
}
