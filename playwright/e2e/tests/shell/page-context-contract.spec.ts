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
    | 'editor'
    | 'library'
    | 'publishing'
    | 'storyboard'
    | 'workspace';
  sectionLabel?: string;
  /** Buttons matched by accessible name — survives icon-only compaction. */
  pageButtons?: string[];
  pageLabels?: string[];
  breadcrumbLabels?: string[];
  sidebarLabels?: string[];
};

const CONTRACTS: PageContextContract[] = [
  {
    route: `${BRAND_BASE}/workspace`,
    currentApp: 'workspace',
    sectionLabel: 'Workspace',
    breadcrumbLabels: ['Overview'],
  },
  {
    route: `${BRAND_BASE}/library/images`,
    currentApp: 'library',
    sectionLabel: 'Library',
    sidebarLabels: ['Library', 'All assets'],
  },
  {
    // Studio tools are separate apps with their own nav (#5502).
    route: `${BRAND_BASE}/studio/storyboard`,
    currentApp: 'storyboard',
    sectionLabel: 'Storyboard',
  },
  {
    // The Remotion timeline is the Editor app (#5461).
    route: `${BRAND_BASE}/studio/editor`,
    currentApp: 'editor',
    sectionLabel: 'Editor',
    sidebarLabels: ['Editor'],
  },
  {
    route: `${BRAND_BASE}/publishing`,
    currentApp: 'publishing',
    sectionLabel: 'Publishing',
    pageLabels: ['Not posted'],
    // With the inspector open the Publishing toolbar collapses New post to
    // its icon, so assert the button rather than its visible text.
    pageButtons: ['New post'],
  },
  {
    route: `${BRAND_BASE}/publishing/campaigns`,
    currentApp: 'publishing',
    sectionLabel: 'Publishing',
    breadcrumbLabels: ['Campaigns'],
  },
  {
    route: `${BRAND_BASE}/automation/agents`,
    currentApp: 'automation',
    sectionLabel: 'Automation',
    sidebarLabels: ['Overview', 'Workflows', 'Runs', 'Agents', 'Programs'],
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

      const sidebar = authenticatedPage
        .getByTestId('desktop-sidebar-rail')
        .getByTestId('sidebar-shell');
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

      for (const name of contract.pageButtons ?? []) {
        await expect(
          authenticatedPage
            .getByRole('region', { name: 'Primary workspace canvas' })
            .getByRole('button', { exact: true, name })
            .first(),
        ).toBeVisible();
      }

      for (const label of contract.pageLabels ?? []) {
        await expect(
          authenticatedPage
            .getByRole('region', { name: 'Primary workspace canvas' })
            .getByText(label, { exact: true })
            .first(),
        ).toBeVisible();
      }
      for (const label of contract.breadcrumbLabels ?? []) {
        const breadcrumb = authenticatedPage.getByRole('navigation', {
          name: 'Breadcrumb',
        });
        await expect(breadcrumb).toBeVisible();
        await expect(
          breadcrumb.getByText(label, { exact: true }),
        ).toBeVisible();
      }
    });
  }
});
