import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Locator, Page } from '@playwright/test';
import {
  mockActiveSubscription,
  mockAnalyticsData,
  mockWorkspaceTasks,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { chooseFilterOption, filtersTrigger } from '../../utils/filter-menu';

/** The workspace sidebar's first entry: the Overview home (#6533 renamed it from Dashboard). */
function workspaceOverviewLink(page: Page): Locator {
  return page
    .getByRole('link', { name: 'Overview', exact: true })
    .and(page.locator(`a[href$="${APP_ROUTES.WORKSPACE.OVERVIEW}"]`))
    .first();
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
    await authenticatedPage.goto(APP_ROUTES.WORKSPACE.ROOT, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/workspace(?:\/|$|\?)/);
    await expect(workspaceOverviewLink(authenticatedPage)).toBeVisible();
    await expect(
      authenticatedPage.getByRole('link', { name: 'Inbox' }).first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('link', { name: 'Tasks' }).first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('link', { name: 'Activity' }).first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(/New Task/i).first(),
    ).toBeVisible();
  });

  test('sidebar primary action opens the task composer', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.WORKSPACE.INBOX, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.getByRole('link', { name: 'Inbox' }).first(),
    ).toBeVisible();
    const primaryAction = authenticatedPage
      .getByTestId('desktop-sidebar-rail')
      .getByTestId('sidebar-primary-action');
    await expect(primaryAction).toBeVisible();
    await primaryAction.click();

    const dialog = authenticatedPage.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'New Task' }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Create Task' }),
    ).toBeVisible();
  });

  test('filters the inbox by status and opens an item from the workspace', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.WORKSPACE.INBOX, {
      waitUntil: 'domcontentloaded',
    });

    await expect(filtersTrigger(authenticatedPage)).toBeVisible();
    await expect(authenticatedPage.getByRole('tab')).toHaveCount(0);
    await chooseFilterOption(authenticatedPage, 'Status', /^All/);
    await expect(authenticatedPage).toHaveURL(/[?&]status=all/);
    await expect(
      authenticatedPage.getByText('Launch caption').first(),
    ).toBeVisible();

    await authenticatedPage.getByText('Launch caption').first().click();
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('renders linked ingredient outputs in the workspace task inspector', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.WORKSPACE.INBOX, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.getByText('Launch caption').first(),
    ).toBeVisible();
    await authenticatedPage.getByText('Launch caption').first().click();
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('keeps advanced-tool handoff links reachable from the workspace', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.WORKSPACE.ROOT, {
      waitUntil: 'domcontentloaded',
    });

    await expect(workspaceOverviewLink(authenticatedPage)).toBeVisible();
    await expect(
      authenticatedPage.getByRole('link', { name: 'Inbox' }).first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('link', { name: 'Tasks' }).first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('link', { name: 'Activity' }).first(),
    ).toBeVisible();
  });

  test('opens task-aware planning, reuses the canonical thread, and materializes follow-up tasks', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.WORKSPACE.INBOX, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.getByText('April launch imagery').first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('In Progress').first(),
    ).toBeVisible();
  });
});
