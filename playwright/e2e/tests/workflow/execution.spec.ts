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
import {
  executionsHistoryLocator,
  WorkflowPage,
} from '../../pages/workflow.page';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

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

    await expect(authenticatedPage).toHaveURL(/automation\/runs/);
    await assertNoErrorBoundaryFallback(authenticatedPage, 'automation/runs');
    // The generic app-shell `<main>` renders on every authenticated route
    // regardless of whether the executions list itself loaded, so it is not
    // a real signal — assert the surface's own populated/empty/error state
    // (same helper `workflows.spec.ts` / `workflows-templates-executions.spec.ts` use).
    // Multiple executions each render their own row/"View Details" link, so
    // several of `executionsHistoryLocator`'s alternatives legitimately match
    // more than once — `.first()` is the expected multiplicity here, not an
    // ambiguous locator being narrowed.
    await expect(
      executionsHistoryLocator(authenticatedPage).first(),
    ).toBeVisible();
  });

  test('should show execution details by ID', async ({ authenticatedPage }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const execution = testWorkflowExecutions[0];

    await workflowPage.gotoExecutionById(execution.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`automation/runs/${execution.id}`),
    );
    await assertNoErrorBoundaryFallback(
      authenticatedPage,
      `automation/runs/${execution.id}`,
    );
    // "Node Execution Log" only renders once `ExecutionDetailPage` has
    // loaded and mapped the execution successfully (not the loading,
    // error, or not-found branches) — a real signal, unlike the generic
    // app-shell `<main>`.
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Node Execution Log' }),
    ).toBeVisible();
  });

  test('should display execution status (completed)', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const completedExec = testWorkflowExecutions.find(
      (e) => e.status === 'COMPLETED',
    );
    if (!completedExec) {
      throw new Error(
        'testWorkflowExecutions fixture is missing a COMPLETED execution',
      );
    }

    await workflowPage.gotoExecutionById(completedExec.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`automation/runs/${completedExec.id}`),
    );
    await assertNoErrorBoundaryFallback(
      authenticatedPage,
      `automation/runs/${completedExec.id}`,
    );

    // Page should render without errors for completed execution. Assert the
    // real "Node Execution Log" heading, not the generic app-shell `<main>`
    // (always present regardless of this page's own load state) — see the
    // "should show execution details by ID" test above for why.
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Node Execution Log' }),
    ).toBeVisible();
  });

  test('should display execution status (running)', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const runningExec = testWorkflowExecutions.find(
      (e) => e.status === 'RUNNING',
    );
    if (!runningExec) {
      throw new Error(
        'testWorkflowExecutions fixture is missing a RUNNING execution',
      );
    }

    await workflowPage.gotoExecutionById(runningExec.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`automation/runs/${runningExec.id}`),
    );
    await assertNoErrorBoundaryFallback(
      authenticatedPage,
      `automation/runs/${runningExec.id}`,
    );
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Node Execution Log' }),
    ).toBeVisible();
  });

  test('should display execution status (failed)', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const failedExec = testWorkflowExecutions.find(
      (e) => e.status === 'FAILED',
    );
    if (!failedExec) {
      throw new Error(
        'testWorkflowExecutions fixture is missing a FAILED execution',
      );
    }

    await workflowPage.gotoExecutionById(failedExec.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`automation/runs/${failedExec.id}`),
    );
    await assertNoErrorBoundaryFallback(
      authenticatedPage,
      `automation/runs/${failedExec.id}`,
    );
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Node Execution Log' }),
    ).toBeVisible();
  });

  test('should show execution logs/results', async ({ authenticatedPage }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const execution = testWorkflowExecutions[0];

    // `mockWorkflowExecutions` (registered in `beforeEach`) already serves
    // this execution by ID with its logs/results normalized against the
    // real `ExecutionResult` contract (`nodeResults`, `progress`, `trigger`,
    // etc). A previous per-test override here posted a hand-built,
    // non-normalized payload (missing `nodeResults`, using fields the real
    // contract doesn't have) at an endpoint the app doesn't even call
    // (`/executions/:id` instead of `/workflow-executions/:id`), so it was
    // silently inert. There is nothing left for this test to add on top of
    // the shared mock.
    await workflowPage.gotoExecutionById(execution.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`automation/runs/${execution.id}`),
    );
    await assertNoErrorBoundaryFallback(
      authenticatedPage,
      `automation/runs/${execution.id}`,
    );

    // Content should be rendered — see the "should show execution details
    // by ID" test above for why this asserts the heading, not `mainContent`.
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Node Execution Log' }),
    ).toBeVisible();
  });
});
