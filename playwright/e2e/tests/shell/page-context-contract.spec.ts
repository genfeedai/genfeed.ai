import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

const BRAND_BASE = '/test-org/brand-1';

type PageContextContract = {
  route: string;
  currentApp:
    | 'analytics'
    | 'automation'
    | 'compose'
    | 'library'
    | 'publishing'
    | 'studio'
    | 'workspace';
  sectionLabel?: string;
  pageLabels?: string[];
  sidebarLabels?: string[];
};

const CONTRACTS: PageContextContract[] = [
  {
    route: `${BRAND_BASE}/workspace`,
    currentApp: 'workspace',
    sectionLabel: 'Workspace',
    pageLabels: ['Overview'],
  },
  {
    route: `${BRAND_BASE}/library/images`,
    currentApp: 'library',
    sectionLabel: 'Library',
  },
  {
    route: `${BRAND_BASE}/studio/storyboard`,
    currentApp: 'studio',
    sectionLabel: 'Studio',
  },
  {
    // #2309: the Remotion editor is Studio's Edit surface, so it renders the
    // Studio sidebar instead of the old menu-less "Editor" shell.
    route: `${BRAND_BASE}/studio/edit`,
    currentApp: 'studio',
    sectionLabel: 'Studio',
    sidebarLabels: ['Edit'],
  },
  {
    route: `${BRAND_BASE}/publishing`,
    currentApp: 'publishing',
    sectionLabel: 'Publishing',
    pageLabels: ['Not posted', 'New content'],
  },
  {
    route: `${BRAND_BASE}/automation/agents`,
    currentApp: 'automation',
    sectionLabel: 'Automation',
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
