import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  mockActiveSubscription,
  mockAutomationData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

/**
 * E2E tests for Automation Programs and Messages outreach after the campaigns IA cut.
 *
 * - Agent Programs: `APP_ROUTES.AUTOMATION.CAMPAIGNS` (UI label Programs)
 * - Outreach sequences: `APP_ROUTES.MESSAGES.OUTREACH`
 * - Publish Campaigns: `APP_ROUTES.PUBLISHING.CAMPAIGNS`
 *
 * Sidebar nav item hrefs are org/brand-prefixed at render time by
 * `prefixHref()`, so assertions use `a[href$="..."]` on the route-constant
 * suffix — same technique as `../workflows/workflows.spec.ts`.
 */
const ORG_BRAND = '/test-org/brand-1';

const workflowsLinkSelector = `a[href$="${APP_ROUTES.AUTOMATION.WORKFLOWS}"]`;
const programsLinkSelector = `a[href$="${APP_ROUTES.AUTOMATION.CAMPAIGNS}"]`;

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
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.AUTOMATION.OVERVIEW,
      );
      // Current IA (AutomationOverviewPage): the page title is an sr-only
      // `<h1>Automation</h1>`; the visible section headings are "Active runs"
      // and "Recent activity" — see AutomationOverviewPage.tsx and its unit
      // test's `getByRole('heading', ...)` assertions for the same pair.
      await expect(
        authenticatedPage.getByRole('heading', { name: 'Active runs' }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', { name: 'Recent activity' }),
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
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.AUTOMATION.CAMPAIGNS,
      );
      // The page title "Programs" is an sr-only h1 owned by SectionTopbar;
      // the "All programs" section heading also contains "Programs" as a
      // substring, so the title assertion must scope to the topbar to avoid
      // a strict-mode violation.
      await expect(
        authenticatedPage
          .getByTestId('section-topbar')
          .getByRole('heading', { name: 'Programs', exact: true }),
      ).toBeVisible();
      // "Active Programs" is a stat in the summary strip (not a heading);
      // the listed programs sit under the "All programs" section.
      await expect(
        authenticatedPage
          .getByTestId('campaign-stats-strip')
          .getByText('Active Programs', { exact: true }),
      ).toBeVisible();
      await expect(
        authenticatedPage
          .getByTestId('campaign-all')
          .getByRole('heading', { name: 'All programs' }),
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
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.MESSAGES.OUTREACH,
      );
      // The page title is an sr-only h1 owned by SectionTopbar; the empty
      // state heading "No outreach sequences yet" also contains "Outreach
      // sequences" as a substring, so scope to the topbar.
      await expect(
        authenticatedPage
          .getByTestId('section-topbar')
          .getByRole('heading', { name: 'Outreach sequences', exact: true }),
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
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.AUTOMATION.WORKFLOWS,
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
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.AUTOMATION.CAMPAIGNS,
      );
    });

    test('messages outreach nav links to Outreach sequences', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(`${ORG_BRAND}${APP_ROUTES.MESSAGES.ROOT}`, {
        waitUntil: 'domcontentloaded',
      });

      // At the Inbox root, the conversation list owns the nav column and the
      // module's other destinations (Outreach sequences, Replies, Reply
      // drip) move into the "Message automations" dropdown in its header —
      // see MessageAutomationsMenu / messages-conversation-sidebar.tsx. The
      // link only mounts once the menu is opened.
      await authenticatedPage
        .getByRole('button', { name: 'Message automations' })
        .click();

      const outreachLink = authenticatedPage.getByRole('menuitem', {
        name: 'Outreach sequences',
      });
      await expect(outreachLink).toBeVisible();
      await expect(outreachLink).toHaveAttribute(
        'href',
        new RegExp(`${APP_ROUTES.MESSAGES.OUTREACH}$`),
      );
      await outreachLink.click();

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.MESSAGES.OUTREACH}$`),
      );
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.MESSAGES.OUTREACH,
      );
    });
  });

  test.describe('Publishing campaigns', () => {
    test('/publishing/campaigns stays on Publish Campaigns', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(`${ORG_BRAND}/publishing/campaigns`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${ORG_BRAND}${APP_ROUTES.PUBLISHING.CAMPAIGNS}$`),
      );
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.PUBLISHING.CAMPAIGNS,
      );
    });
  });
});
