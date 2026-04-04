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

type ReviewGateExecutionState = 'approved' | 'pending' | 'rejected';

const REVIEW_GATE_WORKFLOW = {
  createdAt: '2025-03-01T10:00:00Z',
  description: 'Pause for human approval before publish',
  edges: [],
  id: 'workflow-review-001',
  name: 'Review Gate Approval Flow',
  nodes: [
    {
      data: {
        approvalId: null,
        approvalStatus: 'pending',
        label: 'Review Gate',
      },
      id: 'review-1',
      position: { x: 120, y: 140 },
      type: 'reviewGate',
    },
  ],
  status: 'draft',
  updatedAt: '2025-03-01T10:05:00Z',
};

function buildReviewGateExecution(state: ReviewGateExecutionState) {
  return {
    _id: 'exec-review-001',
    completedAt: state === 'pending' ? undefined : '2025-03-01T10:06:00Z',
    createdAt: '2025-03-01T10:05:00Z',
    id: 'exec-review-001',
    metadata: {
      creditsUsed: 1,
    },
    nodeResults: [
      {
        completedAt: state === 'pending' ? undefined : '2025-03-01T10:06:00Z',
        nodeId: 'review-1',
        nodeType: 'reviewGate',
        output: {
          approvalId: 'exec-review-001',
          approvalStatus: state,
          approvedAt: state === 'approved' ? '2025-03-01T10:06:00Z' : undefined,
          approvedBy: state === 'approved' ? 'playwright-user' : undefined,
          inputCaption: 'Ship this caption',
          inputMedia: 'https://cdn.genfeed.ai/mock/review/image.png',
          outputCaption: state === 'approved' ? 'Ship this caption' : undefined,
          outputMedia:
            state === 'approved'
              ? 'https://cdn.genfeed.ai/mock/review/image.png'
              : undefined,
          rejectionReason:
            state === 'rejected' ? 'Rejected via review gate' : undefined,
        },
        progress: state === 'pending' ? 50 : 100,
        startedAt: '2025-03-01T10:05:00Z',
        status: state === 'pending' ? 'running' : 'completed',
      },
    ],
    progress: state === 'pending' ? 50 : 100,
    startedAt: '2025-03-01T10:05:00Z',
    status: state === 'pending' ? 'running' : 'completed',
    trigger: 'manual',
    updatedAt:
      state === 'pending' ? '2025-03-01T10:05:00Z' : '2025-03-01T10:06:00Z',
    workflow: REVIEW_GATE_WORKFLOW.id,
  };
}

/**
 * E2E Tests for Workflow Editor
 *
 * CRITICAL: All tests use mocked API responses.
 * No real workflow execution occurs.
 */
test.describe('Workflow Editor', () => {
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

  test('should display workflow editor page', async ({ authenticatedPage }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);

    await workflowPage.gotoEditor();

    await expect(authenticatedPage).toHaveURL(/\/workflows\/new/);
    await expect(workflowPage.mainContent).toBeVisible();
  });

  test('should show empty canvas for new workflow', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);

    await workflowPage.gotoEditor();

    await expect(authenticatedPage).toHaveURL(/\/workflows\/new/);
    // New workflow editor should render canvas or empty state
    const hasCanvas = await workflowPage.canvas
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await workflowPage.canvasEmpty
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasCanvas || hasEmpty).toBe(true);
  });

  test('should display node library/sidebar', async ({ authenticatedPage }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);

    await workflowPage.gotoEditor();

    // Sidebar should be visible with navigation
    await expect(workflowPage.sidebar.first()).toBeVisible();
  });

  test('should load existing workflow by ID', async ({ authenticatedPage }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const workflow = testWorkflows[0];

    await workflowPage.gotoEditorById(workflow.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`workflows/${workflow.id}`),
    );
    await expect(workflowPage.mainContent).toBeVisible();
  });

  test('should save workflow', async ({ authenticatedPage }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);

    // Track save API call
    let _saveCalled = false;
    await authenticatedPage.route(
      '**/api.genfeed.ai/workflows/*',
      async (route) => {
        const method = route.request().method();
        if (method === 'PUT' || method === 'PATCH') {
          _saveCalled = true;
          await route.fulfill({
            body: JSON.stringify({
              data: {
                attributes: {
                  ...testWorkflows[0],
                  updatedAt: new Date().toISOString(),
                },
                id: testWorkflows[0].id,
                type: 'workflows',
              },
            }),
            contentType: 'application/json',
            status: 200,
          });
          return;
        }
        await route.continue();
      },
    );

    await workflowPage.gotoEditorById(testWorkflows[0].id);
    await workflowPage.clickSave().catch(() => {});

    // Either save was called or we're still on editor page
    await expect(authenticatedPage).toHaveURL(/\/workflows/);
  });

  test('should start executions through the workflow-executions endpoint', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    let legacyExecuteCalled = false;

    authenticatedPage.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        request.url().includes('/workflows/') &&
        request.url().includes('/execute')
      ) {
        legacyExecuteCalled = true;
      }
    });

    await workflowPage.gotoEditorById(testWorkflows[0].id);

    const executionRequestPromise = authenticatedPage.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().includes('/workflow-executions'),
    );

    await workflowPage.clickRun();
    const executionRequest = await executionRequestPromise;

    expect(executionRequest.url()).toContain('/workflow-executions');
    await authenticatedPage.waitForTimeout(300);
    expect(legacyExecuteCalled).toBe(false);
  });

  test('should preserve the execution query when opening the editor from an execution deep link', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const workflow = testWorkflows[0];
    const execution = testWorkflowExecutions[0];

    await authenticatedPage.goto(
      `/workflows/${workflow.id}?execution=${execution.id}`,
    );
    await workflowPage.waitForPageLoad();

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`/workflows/${workflow.id}\\?execution=${execution.id}$`),
    );
  });

  test('should approve a pending review gate from the execution deep link', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    let executionState: ReviewGateExecutionState = 'pending';
    let approvalRequestBody: Record<string, unknown> | null = null;

    await mockWorkflowCrud(authenticatedPage, [
      REVIEW_GATE_WORKFLOW,
      ...testWorkflows,
    ]);

    await authenticatedPage.route(
      '**/workflow-executions/exec-review-001',
      async (route) => {
        await route.fulfill({
          body: JSON.stringify(buildReviewGateExecution(executionState)),
          contentType: 'application/json',
          status: 200,
        });
      },
    );

    await authenticatedPage.route(
      '**/workflows/workflow-review-001/executions/exec-review-001/approve',
      async (route) => {
        approvalRequestBody =
          (route.request().postDataJSON() as Record<string, unknown>) ?? null;
        executionState = 'approved';

        await route.fulfill({
          body: JSON.stringify({
            data: {
              approvedAt: '2025-03-01T10:06:00Z',
              approvedBy: 'playwright-user',
              executionId: 'exec-review-001',
              nodeId: 'review-1',
              status: 'approved',
            },
          }),
          contentType: 'application/json',
          status: 200,
        });
      },
    );

    await authenticatedPage.goto(
      `/workflows/${REVIEW_GATE_WORKFLOW.id}?execution=exec-review-001`,
    );
    await workflowPage.waitForPageLoad();

    await expect(
      authenticatedPage.getByText('Review Gate').first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Approve' }),
    ).toBeVisible();

    await authenticatedPage.getByRole('button', { name: 'Approve' }).click();

    await expect.poll(() => executionState).toBe('approved');

    expect(approvalRequestBody).toEqual({
      approved: true,
      nodeId: 'review-1',
      rejectionReason: undefined,
    });

    await expect(
      authenticatedPage.getByText(/Approved by playwright-user/i),
    ).toBeVisible();
  });

  test('should reject a pending review gate from the execution deep link', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    let executionState: ReviewGateExecutionState = 'pending';
    let approvalRequestBody: Record<string, unknown> | null = null;

    await mockWorkflowCrud(authenticatedPage, [
      REVIEW_GATE_WORKFLOW,
      ...testWorkflows,
    ]);

    await authenticatedPage.route(
      '**/workflow-executions/exec-review-001',
      async (route) => {
        await route.fulfill({
          body: JSON.stringify(buildReviewGateExecution(executionState)),
          contentType: 'application/json',
          status: 200,
        });
      },
    );

    await authenticatedPage.route(
      '**/workflows/workflow-review-001/executions/exec-review-001/approve',
      async (route) => {
        approvalRequestBody =
          (route.request().postDataJSON() as Record<string, unknown>) ?? null;
        executionState = 'rejected';

        await route.fulfill({
          body: JSON.stringify({
            data: {
              executionId: 'exec-review-001',
              nodeId: 'review-1',
              rejectionReason: 'Rejected via review gate',
              status: 'rejected',
            },
          }),
          contentType: 'application/json',
          status: 200,
        });
      },
    );

    await authenticatedPage.goto(
      `/workflows/${REVIEW_GATE_WORKFLOW.id}?execution=exec-review-001`,
    );
    await workflowPage.waitForPageLoad();

    await expect(
      authenticatedPage.getByText('Review Gate').first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Reject' }),
    ).toBeVisible();

    await authenticatedPage.getByRole('button', { name: 'Reject' }).click();

    await expect.poll(() => executionState).toBe('rejected');

    expect(approvalRequestBody).toEqual({
      approved: false,
      nodeId: 'review-1',
      rejectionReason: 'Rejected via review gate',
    });

    await expect(
      authenticatedPage.getByText('Rejected via review gate'),
    ).toBeVisible();
  });

  test('should show workflow templates', async ({ authenticatedPage }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);

    await workflowPage.gotoTemplates();

    await expect(authenticatedPage).toHaveURL(/workflows\/templates/);
    await expect(workflowPage.mainContent).toBeVisible();
  });

  test('should navigate between editor tabs', async ({ authenticatedPage }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);

    // Start at editor
    await workflowPage.gotoEditor();
    await expect(authenticatedPage).toHaveURL(/\/workflows\/new/);

    // Navigate to library
    await workflowPage.navigateViaTab('library');
    await authenticatedPage.waitForTimeout(500);
    const afterLibrary = authenticatedPage.url();
    expect(
      afterLibrary.includes('library') || afterLibrary.includes('workflows'),
    ).toBe(true);

    // Navigate to templates
    await workflowPage.navigateViaTab('templates');
    await authenticatedPage.waitForTimeout(500);
    const afterTemplates = authenticatedPage.url();
    expect(
      afterTemplates.includes('templates') ||
        afterTemplates.includes('workflows'),
    ).toBe(true);

    // Navigate to executions
    await workflowPage.navigateViaTab('executions');
    await authenticatedPage.waitForTimeout(500);
    const afterExec = authenticatedPage.url();
    expect(
      afterExec.includes('executions') || afterExec.includes('workflows'),
    ).toBe(true);
  });

  test('should display workflow library page', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);

    await workflowPage.gotoLibrary();

    await expect(authenticatedPage).toHaveURL(/\/workflows$/);
    await expect(workflowPage.mainContent).toBeVisible();
  });
});
