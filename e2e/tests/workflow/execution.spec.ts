import {
  mockActiveSubscription,
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
import { WorkflowPage } from '../../pages/workflow.page';

/**
 * E2E Tests for Workflow Execution
 *
 * CRITICAL: All tests use mocked API responses.
 * No real workflow execution occurs.
 */
test.describe('Workflow Execution', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockWorkflowCrud(authenticatedPage, testWorkflows);
    await mockWorkflowExecutions(authenticatedPage, testWorkflowExecutions);
    await mockWorkflowTemplates(authenticatedPage, testWorkflowTemplates);
    await mockNodeTypes(authenticatedPage, testNodeTypes);
  });

  test('should display execution list', async ({ authenticatedPage }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);

    await workflowPage.gotoExecutions();

    await expect(authenticatedPage).toHaveURL(/workflows\/executions/);
    await expect(workflowPage.mainContent).toBeVisible();
  });

  test('should show execution details by ID', async ({ authenticatedPage }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const execution = testWorkflowExecutions[0];

    await workflowPage.gotoExecutionById(execution.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`workflows/executions/${execution.id}`),
    );
    await expect(workflowPage.mainContent).toBeVisible();
  });

  test('should display execution status (completed)', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const completedExec = testWorkflowExecutions.find(
      (e) => e.status === 'completed',
    );

    await workflowPage.gotoExecutionById(completedExec?.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`workflows/executions/${completedExec?.id}`),
    );
    await expect(workflowPage.mainContent).toBeVisible();

    // Page should render without errors for completed execution
    const pageContent = await workflowPage.mainContent.textContent();
    expect(pageContent).toBeTruthy();
  });

  test('should display execution status (running)', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const runningExec = testWorkflowExecutions.find(
      (e) => e.status === 'running',
    );

    await workflowPage.gotoExecutionById(runningExec?.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`workflows/executions/${runningExec?.id}`),
    );
    await expect(workflowPage.mainContent).toBeVisible();
  });

  test('should display execution status (failed)', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const failedExec = testWorkflowExecutions.find(
      (e) => e.status === 'failed',
    );

    await workflowPage.gotoExecutionById(failedExec?.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`workflows/executions/${failedExec?.id}`),
    );
    await expect(workflowPage.mainContent).toBeVisible();
  });

  test('should show execution logs/results', async ({ authenticatedPage }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const execution = testWorkflowExecutions[0];

    // Mock single execution with detailed logs
    await authenticatedPage.route(
      `**/api.genfeed.ai/executions/${execution.id}`,
      async (route) => {
        await route.fulfill({
          body: JSON.stringify({
            data: {
              attributes: {
                completedAt: execution.completedAt,
                id: execution.id,
                logs: execution.logs,
                results: execution.results,
                startedAt: execution.startedAt,
                status: execution.status,
                workflowId: execution.workflowId,
              },
              id: execution.id,
              type: 'executions',
            },
          }),
          contentType: 'application/json',
          status: 200,
        });
      },
    );

    await workflowPage.gotoExecutionById(execution.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`workflows/executions/${execution.id}`),
    );
    await expect(workflowPage.mainContent).toBeVisible();

    // Content should be rendered
    const content = await workflowPage.mainContent.textContent();
    expect(content).toBeTruthy();
  });
});
