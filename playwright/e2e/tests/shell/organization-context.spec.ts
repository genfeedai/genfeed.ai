import type { Page, Request, Route } from '@playwright/test';
import {
  createAuthenticatedPage,
  expect,
  test,
} from '../../fixtures/auth.fixture';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

const ALPHA_ORGANIZATION_ID = 'org_alpha_e2e';
const BRAVO_ORGANIZATION_ID = 'org_bravo_e2e';
const ROUTED_ORGANIZATION_STORAGE_KEY =
  'genfeed:routed-organization-context:v1';

/**
 * The organization switcher lives in the topbar (#5777) and renders the
 * active organization as an initial tile; its full name is the accessible name.
 */
function organizationSwitcher(page: Page) {
  return page
    .getByTestId('app-topbar-shell')
    .getByTestId('organization-switcher-trigger');
}

/**
 * Tenant-scoped API requests only: auth, organization-context and the
 * unauthenticated `/v1/public/*` endpoints (e.g. the platform-flags read the
 * shell issues on load, #5468) carry no tenant data and never send the
 * organization header, so they are outside the routed-context contract.
 */
function isTenantScopedRequest(request: Request): boolean {
  const { pathname } = new URL(request.url());

  return (
    pathname.startsWith('/v1/') &&
    !pathname.startsWith('/v1/auth/') &&
    !pathname.startsWith('/v1/organizations') &&
    !pathname.startsWith('/v1/public/')
  );
}

interface OrganizationContextMockOptions {
  /** Added to every organization call, to make a request chain visible. */
  apiDelayMs?: number;
  failSwitch?: boolean;
  /** Receives `METHOD path` for each organization call, in arrival order. */
  requestLog?: string[];
}

const ORGANIZATION_BRANDS: Record<
  string,
  { brand: { id: string; label: string }; label: string }
> = {
  [ALPHA_ORGANIZATION_ID]: {
    brand: { id: 'brand-alpha', label: 'Alpha Brand' },
    label: 'Alpha Organization',
  },
  [BRAVO_ORGANIZATION_ID]: {
    brand: { id: 'brand-bravo', label: 'Bravo Brand' },
    label: 'Bravo Organization',
  },
};

const ACTIVATE_PATH_PATTERN = /\/organizations\/([^/]+)\/activate$/;

interface OrganizationContextMockState {
  activeOrganizationId: string;
  switchCount: number;
}

async function mockOrganizationContext(
  page: Page,
  options: OrganizationContextMockOptions = {},
  state: OrganizationContextMockState = {
    activeOrganizationId: BRAVO_ORGANIZATION_ID,
    switchCount: 0,
  },
) {
  const fulfillOrganizations = async (route: Route): Promise<void> => {
    const organizations = [
      {
        brand: { id: 'brand-alpha', label: 'Alpha Brand' },
        id: ALPHA_ORGANIZATION_ID,
        isActive: state.activeOrganizationId === ALPHA_ORGANIZATION_ID,
        isOwner: true,
        label: 'Alpha Organization',
        slug: 'alpha',
      },
      {
        brand: { id: 'brand-bravo', label: 'Bravo Brand' },
        id: BRAVO_ORGANIZATION_ID,
        isActive: state.activeOrganizationId === BRAVO_ORGANIZATION_ID,
        isOwner: true,
        label: 'Bravo Organization',
        slug: 'bravo',
      },
    ];

    await route.fulfill({
      body: JSON.stringify(organizations),
      contentType: 'application/json',
      status: 200,
    });
  };

  await page.route('**/v1/organizations**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const activatedOrganizationId = ACTIVATE_PATH_PATTERN.exec(
      url.pathname,
    )?.[1];
    const isMembershipRead =
      request.method() === 'GET' && url.searchParams.get('mine') === 'true';
    const isActivation =
      request.method() === 'PATCH' && activatedOrganizationId !== undefined;

    if (isMembershipRead || isActivation) {
      options.requestLog?.push(`${request.method()} ${url.pathname}`);
      if (options.apiDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.apiDelayMs));
      }
    }

    if (isMembershipRead) {
      await fulfillOrganizations(route);
      return;
    }

    if (isActivation && ORGANIZATION_BRANDS[activatedOrganizationId]) {
      state.switchCount += 1;
      if (options.failSwitch) {
        await route.fulfill({
          body: JSON.stringify({ message: 'switch rejected' }),
          contentType: 'application/json',
          status: 403,
        });
        return;
      }

      state.activeOrganizationId = activatedOrganizationId;
      const activated = ORGANIZATION_BRANDS[activatedOrganizationId];
      await route.fulfill({
        body: JSON.stringify({
          brand: activated.brand,
          organization: {
            id: activatedOrganizationId,
            label: activated.label,
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    await route.fallback();
  });

  return {
    getSwitchCount: () => state.switchCount,
  };
}

test.describe('Routed organization context', () => {
  test('direct links confirm the routed organization before tenant requests execute', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('about:blank');
    const contextMock = await mockOrganizationContext(authenticatedPage);
    const tenantRequestOrganizationIds: Array<string | undefined> = [];

    authenticatedPage.on('request', (request) => {
      if (!isTenantScopedRequest(request)) {
        return;
      }

      tenantRequestOrganizationIds.push(
        request.headers()['x-genfeed-organization-id'],
      );
    });

    await authenticatedPage.goto('/alpha/~/workspace', {
      waitUntil: 'domcontentloaded',
    });

    await expect(organizationSwitcher(authenticatedPage)).toHaveAccessibleName(
      'Switch organization, Alpha Organization',
    );
    await expect.poll(contextMock.getSwitchCount).toBe(1);
    // Settle first so late requests (e.g. the composer's mention prefetch)
    // are part of the check, not only the ones that beat the assertion.
    await assertNoErrorBoundaryFallback(
      authenticatedPage,
      '/alpha/~/workspace',
    );
    expect(tenantRequestOrganizationIds.length).toBeGreaterThan(0);
    expect(tenantRequestOrganizationIds).toEqual(
      tenantRequestOrganizationIds.map(() => ALPHA_ORGANIZATION_ID),
    );
  });

  test('a failed direct-link switch keeps the shell closed to stale tenant data', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('about:blank');
    const contextMock = await mockOrganizationContext(authenticatedPage, {
      failSwitch: true,
    });
    const tenantRequests: string[] = [];

    authenticatedPage.on('request', (request) => {
      if (isTenantScopedRequest(request)) {
        tenantRequests.push(request.url());
      }
    });

    await authenticatedPage.goto('/alpha/~/workspace', {
      waitUntil: 'domcontentloaded',
    });

    // Every attempt must fail closed; session timing determines how many run,
    // so the total attempt count is not asserted.
    await expect.poll(contextMock.getSwitchCount).toBeGreaterThanOrEqual(1);
    const switchFailed = authenticatedPage.getByText(
      'Organization switch failed',
    );
    let previousSwitchCount = contextMock.getSwitchCount();
    let stableFailureChecks = 0;

    // Settle only after the failure stays visible and the count is unchanged
    // across three consecutive observations, including any auth reconciliation.
    await expect
      .poll(
        async () => {
          const switchCount = contextMock.getSwitchCount();
          stableFailureChecks =
            (await switchFailed.isVisible()) &&
            switchCount === previousSwitchCount
              ? stableFailureChecks + 1
              : 0;
          previousSwitchCount = switchCount;
          return stableFailureChecks;
        },
        { intervals: [250], timeout: 5_000 },
      )
      .toBeGreaterThanOrEqual(3);
    expect(tenantRequests).toEqual([]);
    await expect(authenticatedPage.getByTestId('sidebar-shell')).toHaveCount(0);
  });

  test('switching organization keeps the shell on screen and reads the organization list once', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('about:blank');
    const requestLog: string[] = [];
    const contextMock = await mockOrganizationContext(
      authenticatedPage,
      { apiDelayMs: 200, requestLog },
      { activeOrganizationId: ALPHA_ORGANIZATION_ID, switchCount: 0 },
    );

    await authenticatedPage.goto('/alpha/~/workspace', {
      waitUntil: 'domcontentloaded',
    });
    await expect(organizationSwitcher(authenticatedPage)).toHaveAccessibleName(
      'Switch organization, Alpha Organization',
    );
    await expect(authenticatedPage.getByTestId('app-rail-mark')).toBeVisible();
    await authenticatedPage.waitForLoadState('networkidle');
    requestLog.length = 0;

    // Watches the document from before the click: whether the rail or the top
    // bar ever leaves it, whether the full-app skeleton ever replaces it, and
    // how long the new organization's name takes to show.
    await authenticatedPage.evaluate(() => {
      const probe = {
        chromeMissing: false,
        clickedAt: 0,
        frameSkeletonShown: false,
        nameShownAfterMs: null as number | null,
      };
      (window as unknown as { __switchProbe: typeof probe }).__switchProbe =
        probe;
      // The very nodes on screen now must stay in the document: a shell that
      // is torn down and rebuilt within one commit is not "staying".
      const rail = document.querySelector('[data-testid="app-rail-mark"]');
      const topbar = document.querySelector('[data-testid="app-topbar-shell"]');
      document.addEventListener(
        'click',
        () => {
          probe.clickedAt = performance.now();
        },
        { capture: true },
      );
      const check = () => {
        if (probe.clickedAt === 0) {
          return;
        }
        if (!rail?.isConnected || !topbar?.isConnected) {
          probe.chromeMissing = true;
        }
        if (
          document.querySelector('[data-testid="workspace-frame-skeleton"]')
        ) {
          probe.frameSkeletonShown = true;
        }
        const label = document
          .querySelector('[data-testid="organization-switcher-trigger"]')
          ?.getAttribute('aria-label');
        if (
          probe.nameShownAfterMs === null &&
          label?.includes('Bravo Organization')
        ) {
          probe.nameShownAfterMs = performance.now() - probe.clickedAt;
        }
      };
      new MutationObserver(check).observe(document, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    });

    await organizationSwitcher(authenticatedPage).click();
    await authenticatedPage
      .getByRole('option', { name: 'Bravo Organization' })
      .click();

    await expect(authenticatedPage).toHaveURL(/\/bravo\/~\/workspace/);
    await expect(organizationSwitcher(authenticatedPage)).toHaveAccessibleName(
      'Switch organization, Bravo Organization',
    );
    await authenticatedPage.waitForLoadState('networkidle');

    const probe = await authenticatedPage.evaluate(
      () =>
        (
          window as unknown as {
            __switchProbe: {
              chromeMissing: boolean;
              frameSkeletonShown: boolean;
              nameShownAfterMs: number | null;
            };
          }
        ).__switchProbe,
    );
    expect(probe.chromeMissing).toBe(false);
    expect(probe.frameSkeletonShown).toBe(false);
    expect(probe.nameShownAfterMs).not.toBeNull();
    expect(probe.nameShownAfterMs).toBeLessThan(100);
    expect(contextMock.getSwitchCount()).toBe(1);
    expect(requestLog.filter((entry) => entry.startsWith('GET '))).toHaveLength(
      1,
    );
    expect(
      requestLog.filter((entry) => entry.startsWith('PATCH ')),
    ).toHaveLength(1);
  });

  test('a refused switch puts the previous organization back with an error', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('about:blank');
    await mockOrganizationContext(
      authenticatedPage,
      { failSwitch: true },
      { activeOrganizationId: ALPHA_ORGANIZATION_ID, switchCount: 0 },
    );

    await authenticatedPage.goto('/alpha/~/workspace', {
      waitUntil: 'domcontentloaded',
    });
    await expect(organizationSwitcher(authenticatedPage)).toHaveAccessibleName(
      'Switch organization, Alpha Organization',
    );

    await organizationSwitcher(authenticatedPage).click();
    await authenticatedPage
      .getByRole('option', { name: 'Bravo Organization' })
      .click();

    await expect(
      authenticatedPage.getByText(
        'Could not switch organization. You are still in the previous one.',
      ),
    ).toBeVisible();
    await expect(organizationSwitcher(authenticatedPage)).toHaveAccessibleName(
      'Switch organization, Alpha Organization',
    );
    await expect(authenticatedPage).toHaveURL(/\/alpha\/~\/workspace/);
  });

  test('an organization change moves every open tab to the same organization and keeps each surface', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('about:blank');
    const otherTab = await authenticatedPage.context().newPage();
    await createAuthenticatedPage(otherTab, authenticatedPage.context());
    const sharedState: OrganizationContextMockState = {
      activeOrganizationId: ALPHA_ORGANIZATION_ID,
      switchCount: 0,
    };
    await mockOrganizationContext(authenticatedPage, {}, sharedState);
    await mockOrganizationContext(otherTab, {}, sharedState);

    await authenticatedPage.goto('/alpha/~/workspace', {
      waitUntil: 'domcontentloaded',
    });
    await otherTab.goto('/alpha/moonrise/playground', {
      waitUntil: 'domcontentloaded',
    });
    await expect(organizationSwitcher(otherTab)).toHaveAccessibleName(
      'Switch organization, Alpha Organization',
    );

    sharedState.activeOrganizationId = BRAVO_ORGANIZATION_ID;
    await authenticatedPage.evaluate((storageKey) => {
      window.localStorage.setItem(storageKey, `${Date.now()}:${Math.random()}`);
    }, ROUTED_ORGANIZATION_STORAGE_KEY);

    await expect(otherTab).toHaveURL(/\/bravo\/~\/playground$/);
    await expect(organizationSwitcher(otherTab)).toHaveAccessibleName(
      'Switch organization, Bravo Organization',
    );
    await expect(
      otherTab.getByText('Organization context changed'),
    ).toHaveCount(0);
    await assertNoErrorBoundaryFallback(otherTab, '/bravo/~/playground');
  });
});
