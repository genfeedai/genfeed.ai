import type { Page, Route } from '@playwright/test';
import { playwrightApiEndpoint } from '../../config/environment';
import {
  mockActiveSubscription,
  mockLibraryData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  buildProtectedAppBootstrapPayload,
  generateMockOrganizationSettings,
} from '../../utils/api-interceptor';
import { brandPath, orgPath } from '../../utils/app-chrome';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

/**
 * Playground, Storyboard and the Agent app are release items (#9902): a cloud
 * organization without release preview or a release for them does not see them
 * in the rail, on the Apps page or on their routes. The agent sidebar works
 * on every page either way, and only its "Open full page" action needs the
 * Agent app. The default e2e organization is on release preview, so every
 * other spec keeps seeing all three.
 */

const RELEASE_ITEM_IDS = ['playground', 'storyboard', 'agent'];

const json = (route: Route, payload: unknown) =>
  route.fulfill({
    body: JSON.stringify(payload),
    contentType: 'application/json',
    status: 200,
  });

/** Serves organization settings on a cloud organization with no release preview. */
async function useCloudOrganization(
  page: Page,
  releasedItemIds: string[],
): Promise<void> {
  const settings = generateMockOrganizationSettings({
    isReleasePreviewEnabled: false,
    moduleOverrides: {},
    releasedItemIds,
  });
  const bootstrap = buildProtectedAppBootstrapPayload();
  await page.route(`${playwrightApiEndpoint}/auth/bootstrap**`, (route) =>
    json(route, { ...bootstrap, settings }),
  );
  await page.route(
    `${playwrightApiEndpoint}/organizations/*/settings**`,
    (route) =>
      json(route, {
        data: {
          attributes: settings,
          id: settings.id,
          type: 'organization-settings',
        },
      }),
  );
}

test.describe('Unreleased Playground, Storyboard and Agent', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await mockLibraryData(page);
  });

  test('hides the three apps from the rail and the Apps page', async ({
    authenticatedPage: page,
  }) => {
    await useCloudOrganization(page, []);
    await page.goto(orgPath('/apps'), { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('app-rail-item-workspace')).toBeVisible();
    for (const appId of RELEASE_ITEM_IDS) {
      await expect(page.getByTestId(`app-rail-item-${appId}`)).toHaveCount(0);
    }
    for (const name of ['Playground', 'Storyboard']) {
      await expect(
        page.getByRole('button', { name: `Select ${name}`, exact: true }),
      ).toHaveCount(0);
    }
  });

  for (const [path, label] of [
    ['/playground', 'Playground'],
    ['/storyboard', 'Storyboard'],
    ['/agent', 'Agent'],
  ] as const) {
    test(`shows the hidden state on the ${label} route`, async ({
      authenticatedPage: page,
    }) => {
      await useCloudOrganization(page, []);
      await page.goto(brandPath(path), { waitUntil: 'domcontentloaded' });

      await expect(
        page
          .getByRole('status')
          .filter({ hasText: `${label} is not released yet` }),
      ).toBeVisible();
      await expectNoErrorOverlay(page);
    });
  }

  test('keeps the agent sidebar and hides Open full page', async ({
    authenticatedPage: page,
  }) => {
    await useCloudOrganization(page, []);
    await page.goto(brandPath('/library/images'), {
      waitUntil: 'domcontentloaded',
    });
    const toggle = page.getByTestId('topbar-agent-dock-toggle');
    await expect(toggle).toBeEnabled();

    await toggle.click();

    await expect(page.getByRole('region', { name: 'Agent' })).toBeVisible();
    await expect(page.getByTestId('workspace-panel-new-thread')).toBeVisible();
    await expect(page.getByTestId('workspace-panel-full-page')).toHaveCount(0);
  });

  test('shows all three once they are released to the organization', async ({
    authenticatedPage: page,
  }) => {
    await useCloudOrganization(page, RELEASE_ITEM_IDS);
    await page.goto(brandPath('/library/images'), {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByTestId('app-rail-item-agent')).toBeVisible();
    const toggle = page.getByTestId('topbar-agent-dock-toggle');
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect(page.getByTestId('workspace-panel-full-page')).toBeVisible();

    await page.goto(brandPath('/playground'), {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText('Playground is not released yet')).toHaveCount(
      0,
    );
    await expectNoErrorOverlay(page);
  });
});
