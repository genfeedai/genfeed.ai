import type { Page, Route } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';

const ALPHA_ORGANIZATION_ID = 'org_alpha_e2e';
const BRAVO_ORGANIZATION_ID = 'org_bravo_e2e';

interface OrganizationContextMockOptions {
  failSwitch?: boolean;
}

async function mockOrganizationContext(
  page: Page,
  options: OrganizationContextMockOptions = {},
) {
  let activeOrganizationId = BRAVO_ORGANIZATION_ID;
  let switchCount = 0;

  const fulfillOrganizations = async (route: Route): Promise<void> => {
    const organizations = [
      {
        brand: { id: 'brand-alpha', label: 'Alpha Brand' },
        id: ALPHA_ORGANIZATION_ID,
        isActive: activeOrganizationId === ALPHA_ORGANIZATION_ID,
        isOwner: true,
        label: 'Alpha Organization',
        slug: 'alpha',
      },
      {
        brand: { id: 'brand-bravo', label: 'Bravo Brand' },
        id: BRAVO_ORGANIZATION_ID,
        isActive: activeOrganizationId === BRAVO_ORGANIZATION_ID,
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
      request.method() === 'POST' &&
      url.pathname.endsWith(`/switch/${ALPHA_ORGANIZATION_ID}`)
    ) {
      switchCount += 1;
      if (options.failSwitch) {
        await route.fulfill({
          body: JSON.stringify({ message: 'switch rejected' }),
          contentType: 'application/json',
          status: 503,
        });
        return;
      }

      activeOrganizationId = ALPHA_ORGANIZATION_ID;
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
    getSwitchCount: () => switchCount,
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
      authenticatedPage.getByTestId('organization-switcher-trigger'),
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
    await expect.poll(contextMock.getSwitchCount).toBe(1);
    expect(tenantRequests).toEqual([]);
    await expect(authenticatedPage.getByTestId('sidebar-shell')).toHaveCount(0);
  });
});
