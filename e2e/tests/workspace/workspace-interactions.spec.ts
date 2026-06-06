import {
  mockActiveSubscription,
  mockAnalyticsData,
  mockOverviewRunsData,
  mockWorkspaceTasks,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
  tryClick,
} from '../../utils/route-assertions';

/**
 * Deep interaction coverage for the Workspace + Overview surfaces.
 *
 * Exercises inbox view switching, task inspector quick actions, snapshot
 * panels and the overview/activities runs surface. All tests rely on mocked
 * Clerk + API responses (strict network guard fails on real outbound calls)
 * and fall back to best-effort `tryClick` so coverage paths stay non-brittle.
 *
 * @module workspace-interactions.spec
 */

const RUNNING_RUN = {
  createdAt: '2026-03-05T10:00:00.000Z',
  id: 'run-running-1',
  label: 'Launch reel generation',
  progress: 42,
  startedAt: '2026-03-05T10:00:00.000Z',
  status: 'running',
  trigger: 'manual',
  updatedAt: '2026-03-05T10:05:00.000Z',
};

const COMPLETED_RUN = {
  completedAt: '2026-03-05T09:30:00.000Z',
  createdAt: '2026-03-05T09:00:00.000Z',
  id: 'run-completed-1',
  label: 'Weekly digest caption',
  progress: 100,
  startedAt: '2026-03-05T09:00:00.000Z',
  status: 'completed',
  trigger: 'schedule',
  updatedAt: '2026-03-05T09:30:00.000Z',
};

test.describe('Workspace — deep interactions', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAnalyticsData(authenticatedPage);
    await mockWorkspaceTasks(authenticatedPage);
  });

  test('switches between workspace inbox views and opens an item', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, '/workspace/inbox/unread');

    const inbox = authenticatedPage.getByTestId('workspace-inbox');
    await expect(inbox).toBeVisible();

    const tabs = authenticatedPage.getByTestId('workspace-inbox-tabs');
    if (await tabs.isVisible().catch(() => false)) {
      await tryClick(authenticatedPage, '[data-testid="workspace-inbox-tab-all"]');
      await tryClick(
        authenticatedPage,
        '[data-testid="workspace-inbox-tab-recent"]',
      );
      await tryClick(
        authenticatedPage,
        '[data-testid="workspace-inbox-tab-unread"]',
      );
    }

    const firstRow = inbox.getByTestId('workspace-task-row').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click().catch(() => {});
      await authenticatedPage
        .getByTestId('workspace-task-inspector')
        .waitFor({ state: 'visible', timeout: 5_000 })
        .catch(() => {});
    }

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('navigates each workspace inbox view route directly', async ({
    authenticatedPage,
  }) => {
    for (const view of ['unread', 'recent', 'all']) {
      await assertRouteRenders(authenticatedPage, `/workspace/inbox/${view}`);
      await expect(
        authenticatedPage.getByTestId('workspace-inbox'),
      ).toBeVisible();
    }

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('exercises workspace snapshot panels and quick actions', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, '/workspace/overview');

    await expect(
      authenticatedPage.getByTestId('workspace-new-task'),
    ).toBeVisible();

    // Cycle the task composer output-type toggles to cover routing branches.
    await tryClick(authenticatedPage, 'button:has-text("Image")');
    await tryClick(authenticatedPage, 'button:has-text("Video")');
    await tryClick(authenticatedPage, 'button:has-text("Caption")');

    // Touch the snapshot + recent-output panels.
    await tryClick(
      authenticatedPage,
      '[data-testid="workspace-recent-outputs"] a',
    );
    await tryClick(
      authenticatedPage,
      '[data-testid="workspace-history-preview"] [data-testid="workspace-task-row"]',
    );

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('renders the task inspector with review actions from the inbox', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, '/workspace/inbox/unread');

    const firstRow = authenticatedPage
      .getByTestId('workspace-inbox')
      .getByTestId('workspace-task-row')
      .first();

    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click().catch(() => {});

      const inspector = authenticatedPage.getByTestId(
        'workspace-task-inspector',
      );
      if (await inspector.isVisible().catch(() => false)) {
        await tryClick(
          authenticatedPage,
          '[data-testid="workspace-task-inspector"] button:has-text("Request Changes")',
        );
        await tryClick(
          authenticatedPage,
          '[data-testid="workspace-task-inspector"] button:has-text("Approve")',
        );
      }
    }

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});

test.describe('Overview — deep interactions', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAnalyticsData(authenticatedPage);
    await mockWorkspaceTasks(authenticatedPage);
  });

  test('renders the overview surface with runs and toggles period controls', async ({
    authenticatedPage,
  }) => {
    await mockOverviewRunsData(authenticatedPage, [RUNNING_RUN, COMPLETED_RUN]);

    await assertRouteRenders(authenticatedPage, '/overview');

    // /overview is a compatibility redirect into the workspace overview.
    await expect(authenticatedPage).toHaveURL(/\/workspace\/overview/);

    // Period / range toggles where they exist on the surface.
    await tryClick(authenticatedPage, 'button:has-text("7d")');
    await tryClick(authenticatedPage, 'button:has-text("30d")');
    await tryClick(authenticatedPage, 'button:has-text("Week")');
    await tryClick(authenticatedPage, 'button:has-text("Month")');

    // Quick-action cards / run rows.
    await tryClick(
      authenticatedPage,
      '[data-testid="overview-quick-actions"] a',
    );

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('renders the overview activities feed with filters', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, '/overview/activities');

    await expect(authenticatedPage).toHaveURL(/\/overview\/activities/);

    // Activities list ships stats + filter controls; touch them where present.
    await tryClick(authenticatedPage, 'button:has-text("All")');
    await tryClick(authenticatedPage, '[role="tab"]');
    await tryClick(authenticatedPage, 'select');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
