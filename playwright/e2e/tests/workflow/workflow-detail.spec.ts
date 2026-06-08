import {
  mockActiveSubscription,
  mockWorkflowCrud,
  mockWorkflowExecutions,
  mockWorkflowTemplates,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  testWorkflowExecutions,
  testWorkflows,
  testWorkflowTemplates,
} from '../../fixtures/test-data.fixture';
import { WorkflowPage } from '../../pages/workflow.page';

/**
 * E2E Tests for Workflow Detail (parameterized /agents/workflows/[id])
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur during tests.
 *
 * Tests verify that navigating to a specific workflow by ID loads correctly.
 */
test.describe('Workflow Detail — /agents/workflows/[id]', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockWorkflowCrud(authenticatedPage, testWorkflows);
    await mockWorkflowExecutions(authenticatedPage, testWorkflowExecutions);
    await mockWorkflowTemplates(authenticatedPage, testWorkflowTemplates);
  });

  test('should load workflow detail page by ID', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const workflow = testWorkflows[0];

    await workflowPage.gotoEditorById(workflow.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`agents/workflows/${workflow.id}`),
    );
    await expect(workflowPage.mainContent).toBeVisible({ timeout: 15000 });
  });

  test('should not redirect away from workflow detail', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const workflow = testWorkflows[0];

    await workflowPage.gotoEditorById(workflow.id);

    // Verify we stay on the workflow detail page, not redirected to list or login
    const url = authenticatedPage.url();
    expect(url).toContain(`agents/workflows/${workflow.id}`);
    expect(url).not.toContain('/login');
  });

  test('should load a different workflow by ID', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const workflow = testWorkflows[1];

    await workflowPage.gotoEditorById(workflow.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`agents/workflows/${workflow.id}`),
    );
    await expect(workflowPage.mainContent).toBeVisible({ timeout: 15000 });
  });

  test('should display editor canvas or empty state for workflow', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const workflow = testWorkflows[0];

    await workflowPage.gotoEditorById(workflow.id);

    const hasCanvas = await workflowPage.canvas
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await workflowPage.canvasEmpty
      .first()
      .isVisible()
      .catch(() => false);
    const hasMain = await workflowPage.mainContent
      .isVisible()
      .catch(() => false);

    expect(hasCanvas || hasEmpty || hasMain).toBe(true);
  });

  test('should render on mobile viewport without crash', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 667, width: 375 });

    const workflowPage = new WorkflowPage(authenticatedPage);
    const workflow = testWorkflows[0];

    await workflowPage.gotoEditorById(workflow.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`agents/workflows/${workflow.id}`),
    );

    // On mobile, a desktop gate or the main content should be visible
    const hasDesktopGate = await workflowPage.desktopGate
      .first()
      .isVisible()
      .catch(() => false);
    const hasMain = await workflowPage.mainContent
      .isVisible()
      .catch(() => false);

    expect(hasDesktopGate || hasMain).toBe(true);
  });
});
