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

test.describe('Core Automation Loop', () => {
  test.beforeEach(async ({ automationPage }) => {
    await mockActiveSubscription(automationPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockWorkflowCrud(automationPage, testWorkflows);
    await mockWorkflowExecutions(automationPage, testWorkflowExecutions);
    await mockWorkflowTemplates(automationPage, testWorkflowTemplates);
    await mockNodeTypes(automationPage, testNodeTypes);
  });

  test('workflow library stays available inside the agent-first canvas', async ({
    automationPage,
  }) => {
    await automationPage.goto('/workflows');

    await expect(automationPage).toHaveURL(/\/workflows$/);
    await expect(
      automationPage.getByTestId('sidebar-shell').first(),
    ).toHaveAttribute('data-shell-section-label', 'Workspace');
    await expect(
      automationPage.getByTestId('universal-workspace-shell'),
    ).toHaveAttribute('data-workspace-surface', 'workflows');
    await expect(
      automationPage.getByTestId('workspace-canvas-layout'),
    ).toBeVisible();
    await expect(
      automationPage.getByRole('heading', { name: 'Workflows' }),
    ).toBeVisible();
    await expect(
      automationPage.getByRole('link', { name: 'New Workflow' }).first(),
    ).toHaveAttribute('href', /\/workflows\/new$/);
    await expect(
      automationPage.getByRole('link', { name: 'Templates' }).first(),
    ).toBeVisible();
    await expect(
      automationPage.getByRole('link', { name: 'Autopilot' }).first(),
    ).toHaveAttribute('href', /\/orchestration\/autopilot$/);
  });

  test('template install flows into the editor bootstrap path', async ({
    automationPage,
  }) => {
    const workflowPage = new WorkflowPage(automationPage);

    await workflowPage.gotoTemplates();

    await expect(automationPage.getByText('Templates').first()).toBeVisible();
    await automationPage
      .locator('a[href*="/workflows/templates?template="]')
      .first()
      .click({ force: true });

    await expect(automationPage).toHaveURL(/\/workflows\/workflow-new$/);
    await expect(automationPage.locator('.workflow-scope')).toBeVisible();
  });

  test('editor renders the canvas and stable workflow controls', async ({
    automationPage,
  }) => {
    const workflowPage = new WorkflowPage(automationPage);

    await workflowPage.gotoEditorById(testWorkflows[0].id);

    await expect(automationPage).toHaveURL(/\/workflows\/workflow-001/);
    await expect(workflowPage.canvas.first()).toBeVisible();
    await expect(
      automationPage.getByText(/draft|published|archived/i).first(),
    ).toBeVisible();
    await expect(
      automationPage.getByRole('button', { name: 'Archive' }).first(),
    ).toBeVisible();
    await expect(
      automationPage.getByRole('button', { name: 'Run' }).first(),
    ).toBeVisible();
    await expect(
      automationPage.getByRole('heading', { name: 'Nodes' }),
    ).toBeVisible();
  });

  test('execution history and failed execution detail stay inspectable', async ({
    automationPage,
  }) => {
    const workflowPage = new WorkflowPage(automationPage);

    await workflowPage.gotoExecutions();

    await expect(automationPage).toHaveURL(/\/workflows\/executions/);
    await expect(automationPage.getByText('Execution History')).toBeVisible();
    await expect(automationPage.getByText('completed').first()).toBeVisible();
    await expect(automationPage.getByText('failed').first()).toBeVisible();

    await workflowPage.gotoExecutionById('exec-003');

    await expect(automationPage).toHaveURL(/\/workflows\/executions\/exec-003/);
    await expect(
      automationPage.getByRole('button', { name: 'Resume Execution' }),
    ).toBeVisible();
    await expect(automationPage.getByText('Node Execution Log')).toBeVisible();
  });
});
