import { APP_ROUTES } from '@genfeedai/constants';
import {
  mockActiveSubscription,
  mockAutomationData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

/**
 * E2E tests for Automation Programs and Messages outreach after the campaigns IA cut.
 *
 * - Agent Programs: `APP_ROUTES.AUTOMATION.CAMPAIGNS` (UI label Programs)
 * - Outreach sequences: `APP_ROUTES.MESSAGES.OUTREACH`
 * - Publish Campaigns: `APP_ROUTES.PUBLISHING.CAMPAIGNS`
 * - Legacy `/publishing/outreach-campaigns` and `/automation/outreach-campaigns` → Messages
 *
 * Sidebar nav item hrefs are org/brand-prefixed at render time by
 * `prefixHref()`, so assertions use `a[href$="..."]` on the route-constant
 * suffix — same technique as `../workflows/workflows.spec.ts`.
 */
const ORG_BRAND = '/test-org/brand-1';

const workflowsLinkSelector = `a[href$="${APP_ROUTES.AUTOMATION.WORKFLOWS}"]`;
const programsLinkSelector = `a[href$="${APP_ROUTES.AUTOMATION.CAMPAIGNS}"]`;
const outreachSequencesLinkSelector = `a[href$="${APP_ROUTES.MESSAGES.OUTREACH}"]`;

test.describe('Automation & Messages surfaces', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAutomationData(authenticatedPage);
  });

  test.describe('Page Display', () => {
    test('automation root renders the Automation overview', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(
        `${ORG_BRAND}${APP_ROUTES.AUTOMATION.ROOT}`,
        {
          waitUntil: 'domcontentloaded',
        },
      );

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.AUTOMATION.OVERVIEW}$`),
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

    test('programs page renders the Programs surface', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(
        `${ORG_BRAND}${APP_ROUTES.AUTOMATION.CAMPAIGNS}`,
        { waitUntil: 'domcontentloaded' },
      );

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.AUTOMATION.CAMPAIGNS}$`),
      );
      await expect(
        authenticatedPage.getByRole('heading', { name: 'Programs' }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', { name: 'Active Programs' }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', { name: 'All Programs' }),
      ).toBeVisible();
    });

    test('outreach sequences page renders under Messages', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(
        `${ORG_BRAND}${APP_ROUTES.MESSAGES.OUTREACH}`,
        { waitUntil: 'domcontentloaded' },
      );

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.MESSAGES.OUTREACH}$`),
      );
      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Outreach sequences',
        }),
      ).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('automation root links into the Workflows surface', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(
        `${ORG_BRAND}${APP_ROUTES.AUTOMATION.ROOT}`,
        {
          waitUntil: 'domcontentloaded',
        },
      );

      const workflowsLink = authenticatedPage
        .locator(workflowsLinkSelector)
        .first();
      await expect(workflowsLink).toBeVisible();
      await workflowsLink.click();

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.AUTOMATION.WORKFLOWS}$`),
      );
    });

    test('Automation Programs nav links to Programs', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(
        `${ORG_BRAND}${APP_ROUTES.AUTOMATION.ROOT}`,
        {
          waitUntil: 'domcontentloaded',
        },
      );

      const programsLink = authenticatedPage
        .locator(programsLinkSelector)
        .first();
      await expect(programsLink).toBeVisible();
      await programsLink.click();

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.AUTOMATION.CAMPAIGNS}$`),
      );
    });

    test('messages outreach nav links to Outreach sequences', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(`${ORG_BRAND}${APP_ROUTES.MESSAGES.ROOT}`, {
        waitUntil: 'domcontentloaded',
      });

      const outreachLink = authenticatedPage
        .locator(outreachSequencesLinkSelector)
        .first();
      await expect(outreachLink).toBeVisible();
      await outreachLink.click();

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.MESSAGES.OUTREACH}$`),
      );
    });
  });

  test.describe('Legacy redirects', () => {
    test('/publishing/campaigns stays on Publish Campaigns', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(`${ORG_BRAND}/publishing/campaigns`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.PUBLISHING.CAMPAIGNS}$`),
      );
    });

    test('/publishing/outreach-campaigns redirects to Messages outreach', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(
        `${ORG_BRAND}/publishing/outreach-campaigns`,
        {
          waitUntil: 'domcontentloaded',
        },
      );

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.MESSAGES.OUTREACH}$`),
      );
    });

    test('/automation/outreach-campaigns redirects to Messages outreach', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(
        `${ORG_BRAND}/automation/outreach-campaigns`,
        {
          waitUntil: 'domcontentloaded',
        },
      );

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.MESSAGES.OUTREACH}$`),
      );
    });
  });
});
