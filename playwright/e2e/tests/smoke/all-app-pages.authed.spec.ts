import { APP_ROUTES, createBrandAppRoute } from '@genfeedai/constants';
import { expect, type Page, type Response, test } from '@playwright/test';
import { setupStrictNetworkGuard } from '../../utils/network-guard';

/**
 * Real-Better Auth authenticated route smoke.
 *
 * Unlike all-app-pages.spec.ts (fully-mocked auth via fake cookies + Better Auth
 * FAPI mock + the __playwright_test bypass), this spec runs under a REAL Better
 * Auth session minted by playwright/e2e/auth.setup.ts against the job-local API
 * (sign-up + onboarding completion). It exercises the genuine proxy.ts /
 * authMiddleware path end-to-end: session cookie → /auth/token → /auth/bootstrap
 * → authenticated operational home — all against the hermetic local stack
 * (Postgres + Redis + real compiled API on :3010). No production dependency.
 */

async function assertRouteLoads(page: Page, route: string): Promise<void> {
  const response: Response | null = await page.goto(route, {
    timeout: 180_000,
    waitUntil: 'domcontentloaded',
  });

  expect(response?.status() ?? 0, `${route} returned HTTP error`).toBeLessThan(
    400,
  );
  expect(
    page.url(),
    `${route} bounced to /login (real session not honored)`,
  ).not.toMatch(/\/login/);
  await expect(
    page.locator('[data-nextjs-dialog]'),
    `${route} rendered a framework error overlay`,
  ).toHaveCount(0, { timeout: 1_000 });

  const bodySignal = await page.locator('body').evaluate((body) => ({
    textLength: body.textContent?.trim().length ?? 0,
    visibleNodeCount: body.querySelectorAll('*').length,
  }));
  expect(
    bodySignal.textLength + bodySignal.visibleNodeCount,
    `${route} rendered a blank body`,
  ).toBeGreaterThan(0);
}

/**
 * Auth-dependent routes that 500'd / bounced to /login under the broken bypass
 * and must now render with a real session. Limited to routes with a direct
 * page.tsx — index-less segments (overview/library/compose) redirect to a
 * data-dependent child and are non-deterministic for a smoke. Slugs come from
 * the workspace the API provisioned for the freshly signed-up user.
 */
function buildProtectedRoutes(orgSlug: string, brandSlug: string): string[] {
  return [
    APP_ROUTES.SETTINGS.ROOT,
    `/${orgSlug}`,
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.WORKFLOWS.ROOT),
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.POSTS.ROOT),
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.WORKSPACE.TASKS),
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.EDITOR.ROOT),
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.WORKSPACE.ROOT),
  ];
}

function readScopedOverviewSlugs(page: Page): {
  brandSlug: string;
  orgSlug: string;
} {
  const segments = new URL(page.url()).pathname.split('/').filter(Boolean);
  expect(segments.slice(2)).toEqual(['workspace', 'overview']);

  const [orgSlug = '', brandSlug = ''] = segments;
  expect(orgSlug).toBeTruthy();
  expect(brandSlug).toBeTruthy();

  return {
    brandSlug,
    orgSlug,
  };
}

test.describe('Authenticated route smoke (real Better Auth session)', () => {
  test.setTimeout(600_000);

  test('protected routes render under a real session', async ({ page }) => {
    const networkGuard = await setupStrictNetworkGuard(page, { strict: true });

    // `/` resolves the user's selected workspace from the authenticated
    // bootstrap payload and redirects to its scoped overview.
    await assertRouteLoads(page, '/');
    const { brandSlug, orgSlug } = readScopedOverviewSlugs(page);
    expect(new URL(page.url()).pathname).toBe(
      createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.WORKSPACE.OVERVIEW),
    );
    await expect(
      page.getByRole('navigation', { name: 'Breadcrumb' }),
    ).toContainText('Dashboard');

    const failures: string[] = [];
    for (const route of buildProtectedRoutes(orgSlug, brandSlug)) {
      await test.step(route, async () => {
        try {
          await assertRouteLoads(page, route);
        } catch (error) {
          failures.push(
            `${route}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });
    }
    expect(failures, failures.join('\n\n')).toEqual([]);

    networkGuard.assertNoBlockedRequests();
  });
});
