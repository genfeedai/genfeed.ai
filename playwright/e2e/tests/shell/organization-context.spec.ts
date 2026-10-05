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
  failSwitch?: boolean;
}

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

    if (request.method() === 'GET' && url.searchParams.get('mine') === 'true') {
      await fulfillOrganizations(route);
      return;
    }

    if (
      request.method() === 'PATCH' &&
      url.pathname.endsWith(`/organizations/${ALPHA_ORGANIZATION_ID}/activate`)
    ) {
      state.switchCount += 1;
      if (options.failSwitch) {
        await route.fulfill({
          body: JSON.stringify({ message: 'switch rejected' }),
          contentType: 'application/json',
          status: 503,
        });
        return;
      }

      state.activeOrganizationId = ALPHA_ORGANIZATION_ID;
      await route.fulfill({
        body: JSON.stringify({
          brand: { id: 'brand-alpha', label: 'Alpha Brand' },
          organization: {
            id: ALPHA_ORGANIZATION_ID,
            label: 'Alpha Organization',
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
    await otherTab.goto('/alpha/moonrise/studio/generate', {
      waitUntil: 'domcontentloaded',
    });
    await expect(organizationSwitcher(otherTab)).toHaveAccessibleName(
      'Switch organization, Alpha Organization',
    );

    sharedState.activeOrganizationId = BRAVO_ORGANIZATION_ID;
    await authenticatedPage.evaluate((storageKey) => {
      window.localStorage.setItem(storageKey, `${Date.now()}:${Math.random()}`);
    }, ROUTED_ORGANIZATION_STORAGE_KEY);

    await expect(otherTab).toHaveURL(/\/bravo\/~\/studio\/generate$/);
    await expect(organizationSwitcher(otherTab)).toHaveAccessibleName(
      'Switch organization, Bravo Organization',
    );
    await expect(
      otherTab.getByText('Organization context changed'),
    ).toHaveCount(0);
    await assertNoErrorBoundaryFallback(otherTab, '/bravo/~/studio/generate');
  });
});
