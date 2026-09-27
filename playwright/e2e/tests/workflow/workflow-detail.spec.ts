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
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

/**
 * E2E Tests for Workflow Detail (parameterized /automation/workflows/[id])
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur during tests.
 *
 * Tests verify that navigating to a specific workflow by ID loads correctly.
 */
test.describe('Workflow Detail — /automation/workflows/[id]', () => {
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
    const route = `automation/workflows/${workflow.id}`;

    await workflowPage.gotoEditorById(workflow.id);

    await expect(authenticatedPage).toHaveURL(new RegExp(route));
    await assertNoErrorBoundaryFallback(authenticatedPage, route);
    // The generic app-shell `<main>` renders on every authenticated route
    // regardless of whether this page's own content loaded, so it is not a
    // real positive signal on its own — assert the editor's actual canvas
    // (or its documented empty state) instead.
    await expect(
      workflowPage.canvas.first().or(workflowPage.canvasEmpty.first()),
    ).toBeVisible({ timeout: 15000 });
  });

  test('should not redirect away from workflow detail', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const workflow = testWorkflows[0];
    const route = `automation/workflows/${workflow.id}`;

    await workflowPage.gotoEditorById(workflow.id);
    await assertNoErrorBoundaryFallback(authenticatedPage, route);

    // Verify we stay on the workflow detail page, not redirected to list or login
    const url = authenticatedPage.url();
    expect(url).toContain(route);
    expect(url).not.toContain('/login');
  });

  test('should load a different workflow by ID', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const workflow = testWorkflows[1];
    const route = `automation/workflows/${workflow.id}`;

    await workflowPage.gotoEditorById(workflow.id);

    await expect(authenticatedPage).toHaveURL(new RegExp(route));
    await assertNoErrorBoundaryFallback(authenticatedPage, route);
    await expect(
      workflowPage.canvas.first().or(workflowPage.canvasEmpty.first()),
    ).toBeVisible({ timeout: 15000 });
  });

  test('should display editor canvas or empty state for workflow', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const workflow = testWorkflows[0];
    const route = `automation/workflows/${workflow.id}`;

    await workflowPage.gotoEditorById(workflow.id);
    await assertNoErrorBoundaryFallback(authenticatedPage, route);

    const hasCanvas = await workflowPage.canvas.first().isVisible();
    const hasEmpty = hasCanvas
      ? false
      : await workflowPage.canvasEmpty.first().isVisible();

    expect(hasCanvas || hasEmpty).toBe(true);
  });

  test('should render on mobile viewport without crash', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 667, width: 375 });

    const workflowPage = new WorkflowPage(authenticatedPage);
    const workflow = testWorkflows[0];
    const route = `automation/workflows/${workflow.id}`;

    await workflowPage.gotoEditorById(workflow.id);

    await expect(authenticatedPage).toHaveURL(new RegExp(route));
    await assertNoErrorBoundaryFallback(authenticatedPage, route);

    // On mobile, either a dedicated desktop gate takes over, or the editor
    // itself renders (canvas or its documented empty state) — the generic
    // app-shell `<main>` is not a real signal either way (see above).
    const hasDesktopGate = await workflowPage.desktopGate.first().isVisible();
    const hasCanvas = hasDesktopGate
      ? false
      : await workflowPage.canvas.first().isVisible();
    const hasEmpty =
      hasDesktopGate || hasCanvas
        ? false
        : await workflowPage.canvasEmpty.first().isVisible();

    expect(hasDesktopGate || hasCanvas || hasEmpty).toBe(true);
  });
});
