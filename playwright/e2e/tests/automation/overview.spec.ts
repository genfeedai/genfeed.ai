import { APP_ROUTES } from '@genfeedai/constants';
import {
  mockActiveSubscription,
  mockAutomationData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

/**
 * E2E tests for Automate surfaces after campaigns/outreach returned to Automate.
 *
 * Canonical campaign routes: `APP_ROUTES.AUTOMATE.CAMPAIGNS` /
 * `APP_ROUTES.AUTOMATE.OUTREACH_CAMPAIGNS`. Legacy `/publish/campaigns` and
 * `/publish/outreach-campaigns` permanently redirect there.
 *
 * Sidebar nav item hrefs are org/brand-prefixed at render time by
 * `prefixHref()`, so assertions use `a[href$="..."]` on the route-constant
 * suffix — same technique as `../workflows/workflows.spec.ts`.
 */
const ORG_BRAND = '/test-org/brand-1';

const workflowsLinkSelector = `a[href$="${APP_ROUTES.AUTOMATE.WORKFLOWS}"]`;
const campaignsLinkSelector = `a[href$="${APP_ROUTES.AUTOMATE.CAMPAIGNS}"]`;
const outreachCampaignsLinkSelector = `a[href$="${APP_ROUTES.AUTOMATE.OUTREACH_CAMPAIGNS}"]`;

test.describe('Automate & Publish surfaces', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAutomationData(authenticatedPage);
  });

  test.describe('Page Display', () => {
    test('automate root renders the Automate overview', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(`${ORG_BRAND}${APP_ROUTES.AUTOMATE.ROOT}`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.AUTOMATE.ROOT}$`),
      );
      await expect(
        authenticatedPage.getByRole('heading', { name: 'Agents Overview' }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', { name: 'Quick Actions' }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', { name: 'Activity Snapshot' }),
      ).toBeVisible();
    });

    test('campaigns page renders the Agent Campaigns surface', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(
        `${ORG_BRAND}${APP_ROUTES.AUTOMATE.CAMPAIGNS}`,
        { waitUntil: 'domcontentloaded' },
      );

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.AUTOMATE.CAMPAIGNS}$`),
      );
      await expect(
        authenticatedPage.getByRole('heading', { name: 'Agent Campaigns' }),
      ).toBeVisible();
      // mockAutomationData seeds one active campaign, so both the active-cards
      // section and the full table render — neither is behind a conditional
      // we control here, both are direct consequences of the fixed mock data.
      await expect(
        authenticatedPage.getByRole('heading', { name: 'Active Campaigns' }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', { name: 'All Campaigns' }),
      ).toBeVisible();
    });

    test('outreach campaigns page renders the Marketing Campaigns surface', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(
        `${ORG_BRAND}${APP_ROUTES.AUTOMATE.OUTREACH_CAMPAIGNS}`,
        { waitUntil: 'domcontentloaded' },
      );

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.AUTOMATE.OUTREACH_CAMPAIGNS}$`),
      );
      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Marketing Campaigns',
        }),
      ).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('automate root links into the Workflows surface', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(`${ORG_BRAND}${APP_ROUTES.AUTOMATE.ROOT}`, {
        waitUntil: 'domcontentloaded',
      });

      const workflowsLink = authenticatedPage
        .locator(workflowsLinkSelector)
        .first();
      await expect(workflowsLink).toBeVisible();
      await workflowsLink.click();

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.AUTOMATE.WORKFLOWS}$`),
      );
    });

    test('campaigns page links into the Outreach surface', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(
        `${ORG_BRAND}${APP_ROUTES.AUTOMATE.CAMPAIGNS}`,
        { waitUntil: 'domcontentloaded' },
      );

      const outreachLink = authenticatedPage
        .locator(outreachCampaignsLinkSelector)
        .first();
      await expect(outreachLink).toBeVisible();
      await outreachLink.click();

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.AUTOMATE.OUTREACH_CAMPAIGNS}$`),
      );
    });

    test('outreach campaigns page links back to Campaigns', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(
        `${ORG_BRAND}${APP_ROUTES.AUTOMATE.OUTREACH_CAMPAIGNS}`,
        { waitUntil: 'domcontentloaded' },
      );

      await expect(
        authenticatedPage.locator(campaignsLinkSelector).first(),
      ).toBeVisible();
    });
  });

  test.describe('Legacy redirects', () => {
    test('/automate/campaigns redirects to the Publish campaigns route', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(`${ORG_BRAND}/automate/campaigns`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.AUTOMATE.CAMPAIGNS}$`),
      );
    });

    test('/automate/outreach-campaigns redirects to the Publish outreach route', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(`${ORG_BRAND}/automate/outreach-campaigns`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.AUTOMATE.OUTREACH_CAMPAIGNS}$`),
      );
    });
  });
});
