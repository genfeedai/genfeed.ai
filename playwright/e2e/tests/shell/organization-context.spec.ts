import type { Page, Route } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';

const ALPHA_ORGANIZATION_ID = 'org_alpha_e2e';
const BRAVO_ORGANIZATION_ID = 'org_bravo_e2e';
const ROUTED_ORGANIZATION_STORAGE_KEY =
  'genfeed:routed-organization-context:v1';

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
      const url = new URL(request.url());
      if (
        !url.pathname.startsWith('/v1/') ||
        url.pathname.startsWith('/v1/auth/') ||
        url.pathname.startsWith('/v1/organizations')
      ) {
        return;
      }

      tenantRequestOrganizationIds.push(
        request.headers()['x-genfeed-organization-id'],
      );
    });

    await authenticatedPage.goto('/alpha/~/workspace', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage
        .getByTestId('desktop-sidebar-rail')
        .getByTestId('organization-switcher-trigger'),
    ).toContainText('Alpha Organization');
    await expect.poll(contextMock.getSwitchCount).toBe(1);
    await expect
      .poll(() => tenantRequestOrganizationIds.length)
      .toBeGreaterThan(0);
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
      const url = new URL(request.url());
      if (
        url.pathname.startsWith('/v1/') &&
        !url.pathname.startsWith('/v1/auth/') &&
        !url.pathname.startsWith('/v1/organizations')
      ) {
        tenantRequests.push(request.url());
      }
    });

    await authenticatedPage.goto('/alpha/~/workspace', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.getByText('Organization switch failed'),
    ).toBeVisible();
    // The token/context remount retries the same routed confirmation once.
    // Both attempts fail closed before any tenant-scoped request is released.
    await expect.poll(contextMock.getSwitchCount).toBe(2);
    expect(tenantRequests).toEqual([]);
    await expect(authenticatedPage.getByTestId('sidebar-shell')).toHaveCount(0);
  });

  test('an organization change moves every open tab to the same organization and keeps each surface', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('about:blank');
    const otherTab = await authenticatedPage.context().newPage();
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
    await expect(
      otherTab
        .getByTestId('desktop-sidebar-rail')
        .getByTestId('organization-switcher-trigger'),
    ).toContainText('Alpha Organization');

    sharedState.activeOrganizationId = BRAVO_ORGANIZATION_ID;
    await authenticatedPage.evaluate((storageKey) => {
      window.localStorage.setItem(storageKey, `${Date.now()}:${Math.random()}`);
    }, ROUTED_ORGANIZATION_STORAGE_KEY);

    await expect(otherTab).toHaveURL(/\/bravo\/~\/studio\/generate$/);
    await expect(
      otherTab
        .getByTestId('desktop-sidebar-rail')
        .getByTestId('organization-switcher-trigger'),
    ).toContainText('Bravo Organization');
    await expect(
      otherTab.getByText('Organization context changed'),
    ).toHaveCount(0);
  });
});
