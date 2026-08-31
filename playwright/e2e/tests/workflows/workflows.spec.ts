import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/constants';
import {
  mockActiveSubscription,
  mockBrandsData,
  mockNodeTypes,
  mockWorkflowCrud,
  mockWorkflowExecutions,
  mockWorkflowTemplates,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  testNodeTypes,
  testWorkflowExecutions,
  testWorkflows,
  testWorkflowTemplates,
} from '../../fixtures/test-data.fixture';
import { executionsHistoryLocator } from '../../pages/workflow.page';
import { skipIfPlaywrightAuthBypassed } from '../../utils/playwright-auth-bypass';

/**
 * The editor toolbar back-link renders `href(APP_ROUTES.AUTOMATION.WORKFLOWS)`
 * — an org/brand-scoped href, so only the suffix is stable. Built from the route
 * constant so a route rename travels with it instead of leaving a literal that
 * silently matches nothing (as `a[href="/workflows"]` did before the migration).
 */
const workflowsBackLinkSelector = `a[href$="${APP_ROUTES.AUTOMATION.WORKFLOWS}"]`;

test.describe('Workflows', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockWorkflowCrud(authenticatedPage, testWorkflows);
    await mockWorkflowExecutions(authenticatedPage, testWorkflowExecutions);
    await mockWorkflowTemplates(authenticatedPage, testWorkflowTemplates);
    await mockNodeTypes(authenticatedPage, testNodeTypes);
    await mockBrandsData(authenticatedPage, 3);
  });

  test('workflow detail renders restored editor chrome for an existing workflow', async ({
    authenticatedPage,
  }) => {
    const workflow = testWorkflows[1];

    const workflowPath = brandPath(
      `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${workflow.id}`,
    );

    await authenticatedPage.goto(workflowPath, {
      waitUntil: 'domcontentloaded',
    });

    await expect
      .poll(() => new URL(authenticatedPage.url()).pathname)
      .toBe(workflowPath);
    await expect(
      authenticatedPage.locator(workflowsBackLinkSelector).first(),
    ).toBeVisible();
    const editorToolbar = authenticatedPage.locator('.workflow-topbar-shell');
    await expect(editorToolbar).toBeVisible();
    const workspaceInspector = authenticatedPage.getByRole('complementary', {
      name: 'Workspace inspector',
    });
    await expect(workspaceInspector).toBeVisible();
    await expect(
      workspaceInspector.getByText(workflow.name, { exact: true }),
    ).toBeVisible();
    await expect(
      editorToolbar.getByRole('button', { name: 'Publish' }),
    ).toBeVisible();
    await editorToolbar
      .getByRole('button', { name: 'Workflow actions' })
      .click();
    await expect(
      authenticatedPage.getByRole('menuitem', { name: 'Archive' }),
    ).toBeVisible();
  });

  test('workflow creation route renders restored navigation and draft actions', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      brandPath(APP_ROUTES.AUTOMATION.WORKFLOWS_NEW),
      {
        waitUntil: 'domcontentloaded',
      },
    );

    await expect
      .poll(() => new URL(authenticatedPage.url()).pathname)
      .toBe(brandPath(APP_ROUTES.AUTOMATION.WORKFLOWS_NEW));
    await expect(
      authenticatedPage.locator(workflowsBackLinkSelector).first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Untitled Workflow' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Publish' }),
    ).toBeVisible();
    await authenticatedPage
      .getByRole('button', { name: 'Workflow actions' })
      .click();
    await expect(
      authenticatedPage.getByRole('menuitem', { name: 'Archive' }),
    ).toBeVisible();
  });

  test('workflow executions route renders execution history shell', async ({
    authenticatedPage,
  }) => {
    const executionsPath = brandPath(
      APP_ROUTES.AUTOMATION.WORKFLOWS_EXECUTIONS,
    );

    await authenticatedPage.goto(executionsPath, {
      waitUntil: 'domcontentloaded',
    });

    await expect
      .poll(() => new URL(authenticatedPage.url()).pathname)
      .toBe(executionsPath);
    await expect(
      executionsHistoryLocator(authenticatedPage).first(),
    ).toBeVisible();
  });

  test('unauthenticated user is redirected away from workflow editor routes', async ({
    unauthenticatedPage,
  }) => {
    skipIfPlaywrightAuthBypassed();
    await unauthenticatedPage.goto(APP_ROUTES.AUTOMATION.WORKFLOWS_NEW, {
      waitUntil: 'domcontentloaded',
    });

    await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
  });

  test('unauthenticated user is redirected away from workflow executions', async ({
    unauthenticatedPage,
  }) => {
    skipIfPlaywrightAuthBypassed();
    await unauthenticatedPage.goto(APP_ROUTES.AUTOMATION.WORKFLOWS_EXECUTIONS, {
      waitUntil: 'domcontentloaded',
    });

    await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
  });
});
