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

type BootstrapBrand = {
  organization?: { slug?: string } | null;
  slug?: string;
};

type BootstrapPayload = {
  brands?: BootstrapBrand[];
};

/**
 * Independent workspace oracle (#2162 / #2164).
 * Do NOT derive expected org/brand slugs from `page.url()` — that would let a
 * redirect to the wrong non-empty workspace pass. Read them from the
 * authenticated bootstrap payload instead.
 */
async function readWorkspaceOracleFromBootstrap(page: Page): Promise<{
  brandSlug: string;
  orgSlug: string;
}> {
  const bootstrapResponsePromise = page.waitForResponse(
    (response) => {
      try {
        const url = new URL(response.url());
        return (
          url.pathname.endsWith('/auth/bootstrap') &&
          response.request().method() === 'GET' &&
          response.ok()
        );
      } catch {
        return false;
      }
    },
    { timeout: 180_000 },
  );

  await assertRouteLoads(page, '/');
  const response = await bootstrapResponsePromise;
  const payload = (await response.json()) as BootstrapPayload;
  const brands = payload.brands ?? [];
  expect(
    brands.length,
    'bootstrap returned no brands for workspace oracle',
  ).toBeGreaterThan(0);

  const selected = brands.find(
    (brand) =>
      typeof brand.slug === 'string' &&
      brand.slug.length > 0 &&
      typeof brand.organization?.slug === 'string' &&
      brand.organization.slug.length > 0,
  );
  expect(
    selected,
    'bootstrap brand missing slug + organization.slug',
  ).toBeTruthy();

  return {
    brandSlug: selected?.slug as string,
    orgSlug: selected?.organization?.slug as string,
  };
}

test.describe('Authenticated route smoke (real Better Auth session)', () => {
  test.setTimeout(600_000);

  test('protected routes render under a real session', async ({ page }) => {
    const networkGuard = await setupStrictNetworkGuard(page, { strict: true });

    // `/` resolves the user's selected workspace from the authenticated
    // bootstrap payload and redirects to its scoped overview. Oracle slugs
    // come from the bootstrap response, not from the redirected URL.
    const { brandSlug, orgSlug } = await readWorkspaceOracleFromBootstrap(page);
    expect(new URL(page.url()).pathname).toBe(
      createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.WORKSPACE.OVERVIEW),
    );

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
