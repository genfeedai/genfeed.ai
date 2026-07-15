import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

const BRAND_BASE = '/test-org/brand-1';

type PageContextContract = {
  route: string;
  currentApp:
    | 'analytics'
    | 'compose'
    | 'editor'
    | 'library'
    | 'posts'
    | 'studio'
    | 'workflows'
    | 'workspace';
  sectionLabel?: string;
  pageLabels?: string[];
  sidebarLabels?: string[];
};

const CONTRACTS: PageContextContract[] = [
  {
    route: `${BRAND_BASE}/workspace/overview`,
    currentApp: 'workspace',
    sectionLabel: 'Workspace',
    pageLabels: ['Dashboard'],
  },
  {
    route: `${BRAND_BASE}/library/images`,
    currentApp: 'library',
    sectionLabel: 'Workspace',
  },
  {
    route: `${BRAND_BASE}/studio/image`,
    currentApp: 'studio',
    sectionLabel: 'Workspace',
  },
  {
    route: `${BRAND_BASE}/posts/scheduled`,
    currentApp: 'posts',
    sectionLabel: 'Workspace',
    pageLabels: ['Drafts', 'Scheduled', 'Published'],
  },
  {
    route: `${BRAND_BASE}/orchestration/library`,
    currentApp: 'workflows',
    sectionLabel: 'Workflows',
    sidebarLabels: ['Runs', 'Workflows', 'Skills', 'Autopilot'],
  },
];

async function settle(page: Parameters<typeof expectNoErrorOverlay>[0]) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(300);
}

test.describe('Shell page context contract', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  for (const contract of CONTRACTS) {
    test(`${contract.currentApp} context renders expected shell for ${contract.route}`, async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(contract.route, {
        waitUntil: 'domcontentloaded',
      });
      await settle(authenticatedPage);

      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);
      await expectNoErrorOverlay(authenticatedPage);

      const sidebar = authenticatedPage.getByTestId('sidebar-shell').first();
      await expect(sidebar).toBeVisible();
      await expect(sidebar).toHaveAttribute(
        'data-shell-current-app',
        contract.currentApp,
      );

      if (contract.sectionLabel !== undefined) {
        await expect(sidebar).toHaveAttribute(
          'data-shell-section-label',
          contract.sectionLabel,
        );
      } else {
        await expect(sidebar).toHaveAttribute('data-shell-section-label', '');
      }

      for (const label of contract.sidebarLabels ?? []) {
        await expect(
          sidebar.getByText(label, { exact: true }).first(),
        ).toBeVisible();
      }

      for (const label of contract.pageLabels ?? []) {
        await expect(
          authenticatedPage.getByText(label, { exact: true }).first(),
        ).toBeVisible();
      }
    });
  }
});
