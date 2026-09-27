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
    // `executionsHistoryLocator().first()` alone can match the "Recent runs"
    // heading even while the table is still loading or came back empty — it
    // is a health check for the surface, not proof the seeded rows rendered.
    // Assert an actual detail link per seeded execution ID instead.
    for (const execution of testWorkflowExecutions) {
      await expect(
        authenticatedPage
          .locator(`a[href$="/automation/runs/${execution.id}"]`)
          .first(),
      ).toBeVisible();
    }
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

    // `ExecutionSummaryBar` renders the status as `{getStatusIcon(status)}
    // {status}` — assert the real displayed status, not just the "Node
    // Execution Log" section title, which renders identically regardless of
    // which execution loaded. Icon + `exact: true` avoids a real collision:
    // the workspace inspector panel also renders a same-named, differently-
    // cased status badge ("Running"/"Failed") that a bare case-insensitive
    // text match picks up too (see `status-helpers.ts` for the icon map).
    await expect(
      authenticatedPage.getByText(`✅ ${completedExec.status}`, {
        exact: true,
      }),
    ).toBeVisible();

    // Expand the last ("publish") node and assert its real output —
    // `testWorkflowExecutions[0].results` (`nodesCompleted`, `outputUrl`) —
    // rendered, not just the section being present with no content.
    await authenticatedPage.getByRole('button', { name: /publish/i }).click();
    await expect(
      authenticatedPage.getByText(String(completedExec.results.outputUrl)),
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
      authenticatedPage.getByText(`⏳ ${runningExec.status}`, { exact: true }),
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
      authenticatedPage.getByText(`❌ ${failedExec.status}`, { exact: true }),
    ).toBeVisible();

    // The global "Execution Error" banner (`ExecutionDetailPage.tsx`) is
    // always visible for a failed execution — not gated behind expanding a
    // node — and carries the real fixture error text.
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Execution Error' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(String(failedExec.results.error)),
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

    // "Node Execution Log" renders whether or not there are any node
    // results (the empty state is "No node results recorded" under the same
    // heading) — assert the fixture's 5 logs actually produced 5 rendered
    // node rows, not the empty state.
    await expect(
      authenticatedPage.getByText('No node results recorded'),
    ).toHaveCount(0);
    const nodeButtons = authenticatedPage.getByRole('button', {
      name: /\(node-\d+\)/,
    });
    await expect(nodeButtons).toHaveCount(execution.logs.length);

    // Expand the last ("publish") node and assert its real output —
    // `testWorkflowExecutions[0].results` — rendered.
    await authenticatedPage.getByRole('button', { name: /publish/i }).click();
    await expect(
      authenticatedPage.getByText(String(execution.results.outputUrl)),
    ).toBeVisible();
  });
});
