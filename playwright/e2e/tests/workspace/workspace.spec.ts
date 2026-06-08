import type { Page } from '@playwright/test';
import {
  mockActiveSubscription,
  mockAnalyticsData,
  mockWorkspaceTasks,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

async function mockAgentChatDependencies(page: Page) {
  await page.route('**/agent/credits', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        balance: 120,
        modelCosts: {
          'gpt-5-mini': 2,
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/runs/active', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ data: [] }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

test.describe('Workspace', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAnalyticsData(authenticatedPage);
    await mockWorkspaceTasks(authenticatedPage);
  });

  test('loads the new workspace home for authenticated users', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/workspace', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(
      /\/workspace\/overview(?:$|[?#])/,
    );
    await expect(
      authenticatedPage.getByRole('link', { name: 'Dashboard' }).first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('sidebar-brand-rail').first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('sidebar-primary-action').first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('link', { name: 'Inbox' }).first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('link', { name: 'Inbox' }).first(),
    ).toContainText(/\d+/);
    await expect(
      authenticatedPage.getByRole('link', { name: 'Tasks' }),
    ).toHaveCount(0);
    await expect(
      authenticatedPage.getByTestId('topbar-inbox-trigger'),
    ).toHaveCount(0);
    await expect(authenticatedPage.getByTestId('workspace-nav')).toHaveCount(0);
    await expect(
      authenticatedPage.getByTestId('workspace-new-task'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('workspace-task-list'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('workspace-inbox'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('workspace-in-progress'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('workspace-recent-outputs'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('workspace-history-preview'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('workspace-library-snapshot'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('workspace-advanced-tools'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('link', { name: 'Activity' }).first(),
    ).toBeVisible();
  });

  test('creates image, video, and caption tasks with the expected routing paths', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/workspace/overview', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.getByTestId('workspace-new-task'),
    ).toBeVisible();

    const requestInput = authenticatedPage.locator('#workspace-task-request');

    await authenticatedPage.getByRole('button', { name: 'Image' }).click();
    await requestInput.fill('Create a hero image for the April launch.');
    await authenticatedPage
      .getByRole('button', { name: 'Create Task' })
      .click();
    await expect(
      authenticatedPage.getByText(/routed it to the image generation path/i),
    ).toBeVisible();

    await authenticatedPage.getByRole('button', { name: 'Video' }).click();
    await requestInput.fill('Create a short launch reel for social.');
    await authenticatedPage
      .getByRole('button', { name: 'Create Task' })
      .click();
    await expect(
      authenticatedPage.getByText(/routed it to the video generation path/i),
    ).toBeVisible();

    await authenticatedPage.getByRole('button', { name: 'Caption' }).click();
    await requestInput.fill('Write a caption for the launch post.');
    await authenticatedPage
      .getByRole('button', { name: 'Create Task' })
      .click();
    await expect(
      authenticatedPage.getByText(
        /routed it to the caption generation path for review/i,
      ),
    ).toBeVisible();
  });

  test('opens the task composer from the workspace sidebar quick action', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/workspace/inbox/unread', {
      waitUntil: 'domcontentloaded',
    });

    const sidebarPrimaryAction = authenticatedPage.getByTestId(
      'sidebar-primary-action',
    );

    await expect(sidebarPrimaryAction).toContainText('New Task');
    await sidebarPrimaryAction.click();

    await expect(authenticatedPage).toHaveURL(
      /\/workspace\/overview#new-task$/,
    );
    await expect(authenticatedPage.getByText('Start a task')).toBeVisible();
  });

  test('supports inbox tabs and review actions from the workspace', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/workspace/inbox', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.getByTestId('workspace-inbox'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('workspace-inbox-tabs'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('workspace-inbox-tab-recent'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('workspace-inbox-tab-unread'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('workspace-inbox-tab-all'),
    ).toBeVisible();

    await authenticatedPage.getByTestId('workspace-inbox-tab-unread').click();

    const firstInboxRow = authenticatedPage
      .getByTestId('workspace-inbox')
      .getByTestId('workspace-task-row')
      .first();

    await expect(firstInboxRow).toBeVisible();
    await firstInboxRow.click();

    await expect(
      authenticatedPage.getByTestId('workspace-task-inspector'),
    ).toBeVisible();

    const approveButton = authenticatedPage
      .getByTestId('workspace-task-inspector')
      .getByRole('button', { name: 'Approve' })
      .first();

    await expect(approveButton).toBeVisible();
    await approveButton.click();

    await expect(
      authenticatedPage.getByTestId('workspace-inbox').getByText('Completed'),
    ).toBeVisible();
  });

  test('renders linked ingredient outputs in the workspace task inspector', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/workspace/overview', {
      waitUntil: 'domcontentloaded',
    });

    const taskRow = authenticatedPage
      .getByTestId('workspace-history-preview')
      .getByLabel('Open details for Launch caption');

    await expect(taskRow).toBeVisible();
    await taskRow.click();

    const inspector = authenticatedPage.getByTestId('workspace-task-inspector');

    await expect(inspector).toBeVisible();
    await expect(
      inspector.getByText('Linked ingredient outputs created for this task.'),
    ).toBeVisible();
    await expect(
      inspector.getByTestId('workspace-task-linked-outputs'),
    ).toBeVisible();
    await expect(inspector.getByText('Campaign Hook Pack')).toBeVisible();
    await expect(
      inspector.getByText('Hook variants for the campaign brief.'),
    ).toBeVisible();
  });

  test('keeps advanced-tool handoff links reachable from the workspace', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/workspace', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.getByRole('link', { name: 'Chat' }),
    ).toHaveAttribute('href', '/chat');
    await expect(
      authenticatedPage.getByRole('link', { name: 'Studio Image' }),
    ).toHaveAttribute('href', '/studio/image');
    await expect(
      authenticatedPage.getByRole('link', { name: 'Workflows' }),
    ).toHaveAttribute('href', '/orchestration/workflows');
    await expect(
      authenticatedPage.getByRole('link', { name: 'Runs' }),
    ).toHaveAttribute('href', '/orchestration/runs');
  });

  test('opens task-aware planning, reuses the canonical thread, and materializes follow-up tasks', async ({
    authenticatedPage,
  }) => {
    await mockAgentChatDependencies(authenticatedPage);

    await authenticatedPage.goto('/workspace/overview', {
      waitUntil: 'domcontentloaded',
    });

    const inProgressPlanningButton = authenticatedPage
      .getByTestId('workspace-in-progress')
      .getByRole('button', { name: 'Plan Next Steps' })
      .first();

    await expect(inProgressPlanningButton).toBeVisible();
    await inProgressPlanningButton.click();

    await expect(authenticatedPage).toHaveURL(
      /\/chat\/thread-plan-workspace-task-progress-1$/,
    );
    await expect(
      authenticatedPage.getByText(/Completed work so far:/),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(/SHOULD happen next:/),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(/COULD happen next:/),
    ).toBeVisible();

    await authenticatedPage.goto('/workspace/overview', {
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage
      .getByTestId('workspace-in-progress')
      .getByRole('button', { name: 'Plan Next Steps' })
      .first()
      .click();

    await expect(authenticatedPage).toHaveURL(
      /\/chat\/thread-plan-workspace-task-progress-1$/,
    );

    const createFollowUpTasksButton = authenticatedPage.getByRole('button', {
      name: 'Create Follow-up Tasks',
    });
    await expect(createFollowUpTasksButton).toBeVisible();
    await createFollowUpTasksButton.click();

    await expect(
      authenticatedPage.getByText('Created 2 follow-up tasks.'),
    ).toBeVisible();

    await authenticatedPage.goto('/workspace/tasks', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(
      /\/workspace\/overview#task-queue$/,
    );

    await expect(
      authenticatedPage.getByText(
        'Package April launch imagery into launch copy',
      ),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(
        'Create supporting visual for April launch imagery',
      ),
    ).toBeVisible();
  });
});
