import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { expect, type Page, type Response, test } from '@playwright/test';
import { playwrightApiEndpoint } from '../../config/environment';
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
 * page.tsx — index-less segments (overview/library) redirect to a
 * data-dependent child and are non-deterministic for a smoke. Slugs come from
 * the workspace the API provisioned for the freshly signed-up user.
 */
function buildProtectedRoutes(orgSlug: string, brandSlug: string): string[] {
  return [
    APP_ROUTES.SETTINGS.ROOT,
    `/${orgSlug}`,
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.AUTOMATION.WORKFLOWS),
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.PUBLISHING.ROOT),
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.WORKSPACE.TASKS),
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.STUDIO.EDIT),
    createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.WORKSPACE.ROOT),
  ];
}

type BootstrapBrand = {
  _id?: string;
  id?: string;
  organization?: { slug?: string } | null;
  slug?: string;
};

type BootstrapPayload = {
  access?: { brandId?: string };
  brands?: BootstrapBrand[];
};

function resolveWorkspaceOracle(payload: BootstrapPayload): {
  brandSlug: string;
  orgSlug: string;
} {
  const brands = payload.brands ?? [];
  const activeBrandId = payload.access?.brandId ?? '';
  const matchedBrand = activeBrandId
    ? brands.find(
        (brand) => String(brand.id ?? brand._id ?? '') === activeBrandId,
      )
    : undefined;
  const selectedBrand =
    activeBrandId && matchedBrand?.slug
      ? matchedBrand
      : (brands.find((brand) => Boolean(brand.slug)) ?? matchedBrand);
  const orgSlug =
    selectedBrand?.organization?.slug ??
    brands.find((brand) => Boolean(brand.organization?.slug))?.organization
      ?.slug;

  expect(
    selectedBrand?.slug,
    'bootstrap workspace oracle missing brand slug',
  ).toBeTruthy();
  expect(
    orgSlug,
    'bootstrap workspace oracle missing organization slug',
  ).toBeTruthy();

  return {
    brandSlug: selectedBrand?.slug as string,
    orgSlug: orgSlug as string,
  };
}

/**
 * Independent workspace oracle (#2162 / #2164).
 * Do NOT derive expected org/brand slugs from `page.url()` — that would let a
 * redirect to the wrong non-empty workspace pass. Read them from the
 * authenticated bootstrap payload instead.
 *
 * Bootstrap for workspace resolution runs server-side in `proxy.ts` and is
 * invisible to `page.waitForResponse`. Mint a JWT the same way proxy does
 * (session cookie → `/auth/token`) and call bootstrap over the API request
 * context so the oracle does not depend on a client re-fetch.
 */
async function readWorkspaceOracleFromBootstrap(page: Page): Promise<{
  brandSlug: string;
  orgSlug: string;
}> {
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find(
    (cookie) =>
      cookie.name === 'better-auth.session_token' ||
      cookie.name === '__Secure-better-auth.session_token',
  );
  expect(
    sessionCookie?.value,
    'Better Auth session cookie missing from storageState',
  ).toBeTruthy();

  const tokenResponse = await page.request.get(
    `${playwrightApiEndpoint}/auth/token`,
    {
      headers: {
        cookie: `${sessionCookie?.name}=${sessionCookie?.value}`,
      },
      timeout: 60_000,
    },
  );
  expect(
    tokenResponse.ok(),
    `GET ${playwrightApiEndpoint}/auth/token returned ${tokenResponse.status()}`,
  ).toBeTruthy();
  const tokenPayload = (await tokenResponse.json()) as { token?: string };
  expect(tokenPayload.token, 'token exchange returned no JWT').toBeTruthy();

  const bootstrapResponse = await page.request.get(
    `${playwrightApiEndpoint}/auth/bootstrap`,
    {
      headers: {
        Authorization: `Bearer ${tokenPayload.token}`,
      },
      timeout: 60_000,
    },
  );
  expect(
    bootstrapResponse.ok(),
    `GET ${playwrightApiEndpoint}/auth/bootstrap returned ${bootstrapResponse.status()}`,
  ).toBeTruthy();

  const payload = (await bootstrapResponse.json()) as BootstrapPayload;
  const oracle = resolveWorkspaceOracle(payload);

  await assertRouteLoads(page, '/');
  return oracle;
}

test.describe('Authenticated route smoke (real Better Auth session)', () => {
  test.setTimeout(600_000);

  test('workspace oracle follows the active bootstrap brand', () => {
    expect(
      resolveWorkspaceOracle({
        access: { brandId: 'brand-selected' },
        brands: [
          {
            id: 'brand-wrong',
            organization: { slug: 'org-wrong' },
            slug: 'brand-wrong',
          },
          {
            id: 'brand-selected',
            organization: { slug: 'org-selected' },
            slug: 'brand-selected',
          },
        ],
      }),
    ).toEqual({
      brandSlug: 'brand-selected',
      orgSlug: 'org-selected',
    });
  });

  test('protected routes render under a real session', async ({ page }) => {
    const networkGuard = await setupStrictNetworkGuard(page, { strict: true });

    // `/` resolves the user's selected workspace from the authenticated
    // bootstrap payload and redirects to its scoped Workspace overview — the
    // returning-user landing owned by `root-resolver-client.tsx`. Oracle slugs
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
