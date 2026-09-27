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
    // `canvas.or(canvasEmpty)` alone still passes when the workflow fetch
    // fails: `loadFromCloud` clears `isCloudLoading` on failure (leaving the
    // shared workflow store's pre-load — effectively empty — state in
    // place) and `WorkflowDetailPageClient` renders `WorkflowEditorShell`
    // right alongside `cloudError`, not instead of it. Assert the real
    // mocked workflow loaded: its name in the toolbar title (falls back to
    // "Untitled Workflow" on failure) and its exact node count (0 on
    // failure), and that the cloud-error banner never appeared.
    await expect(
      authenticatedPage.getByRole('button', { name: workflow.name }),
    ).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => workflowPage.getNodeCount())
      .toBe(workflow.nodes.length);
    await expect(
      authenticatedPage.locator('.border-destructive\\/20.bg-destructive\\/10'),
    ).toHaveCount(0);
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
    // See "should load workflow detail page by ID" above for why this
    // asserts the real name/node count/no-error-banner instead of the
    // canvas-or-empty-state OR, which also passes on a failed fetch.
    await expect(
      authenticatedPage.getByRole('button', { name: workflow.name }),
    ).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => workflowPage.getNodeCount())
      .toBe(workflow.nodes.length);
    await expect(
      authenticatedPage.locator('.border-destructive\\/20.bg-destructive\\/10'),
    ).toHaveCount(0);
  });

  test('should display editor canvas or empty state for workflow', async ({
    authenticatedPage,
  }) => {
    const workflowPage = new WorkflowPage(authenticatedPage);
    const workflow = testWorkflows[0];
    const route = `automation/workflows/${workflow.id}`;

    await workflowPage.gotoEditorById(workflow.id);
    await assertNoErrorBoundaryFallback(authenticatedPage, route);

    // This fixture always has nodes, so the real, non-vacuous assertion is
    // that they actually rendered — not "canvas or its empty state", which
    // also passes on a failed fetch (see the by-ID tests above).
    await expect(
      authenticatedPage.getByRole('button', { name: workflow.name }),
    ).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => workflowPage.getNodeCount())
      .toBe(workflow.nodes.length);
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

    // `DesktopGate.tsx` unconditionally gates any viewport under 1024px —
    // there is no legitimate case where the canvas renders instead at
    // 375px. An OR against the canvas would silently accept a broken gate
    // (e.g. its `isMobile` check regressing) as long as *something* showed.
    await expect(workflowPage.desktopGate).toBeVisible();
    await expect(workflowPage.canvas).toHaveCount(0);
  });
});
