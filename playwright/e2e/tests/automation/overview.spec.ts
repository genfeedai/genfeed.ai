import { APP_ROUTES } from '@genfeedai/constants';
import {
  mockActiveSubscription,
  mockAutomationData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

/**
 * E2E tests for Automate Programs and Messages outreach after the campaigns IA cut.
 *
 * - Agent Programs: `APP_ROUTES.AUTOMATE.CAMPAIGNS` (UI label Programs)
 * - Outreach sequences: `APP_ROUTES.MESSAGES.OUTREACH`
 * - Legacy `/publish/campaigns` → Automate Programs
 * - Legacy `/publish/outreach-campaigns` and `/automate/outreach-campaigns` → Messages
 *
 * Sidebar nav item hrefs are org/brand-prefixed at render time by
 * `prefixHref()`, so assertions use `a[href$="..."]` on the route-constant
 * suffix — same technique as `../workflows/workflows.spec.ts`.
 */
const ORG_BRAND = '/test-org/brand-1';

const workflowsLinkSelector = `a[href$="${APP_ROUTES.AUTOMATE.WORKFLOWS}"]`;
const programsLinkSelector = `a[href$="${APP_ROUTES.AUTOMATE.CAMPAIGNS}"]`;
const outreachSequencesLinkSelector = `a[href$="${APP_ROUTES.MESSAGES.OUTREACH}"]`;

test.describe('Automate & Messages surfaces', () => {
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

    test('programs page renders the Programs surface', async ({
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

    test('automate Programs nav links to Programs', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(`${ORG_BRAND}${APP_ROUTES.AUTOMATE.ROOT}`, {
        waitUntil: 'domcontentloaded',
      });

      const programsLink = authenticatedPage
        .locator(programsLinkSelector)
        .first();
      await expect(programsLink).toBeVisible();
      await programsLink.click();

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.AUTOMATE.CAMPAIGNS}$`),
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
    test('/publish/campaigns redirects to Automate Programs', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(`${ORG_BRAND}/publish/campaigns`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.AUTOMATE.CAMPAIGNS}$`),
      );
    });

    test('/publish/outreach-campaigns redirects to Messages outreach', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(`${ORG_BRAND}/publish/outreach-campaigns`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.MESSAGES.OUTREACH}$`),
      );
    });

    test('/automate/outreach-campaigns redirects to Messages outreach', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(`${ORG_BRAND}/automate/outreach-campaigns`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.MESSAGES.OUTREACH}$`),
      );
    });
  });
});
