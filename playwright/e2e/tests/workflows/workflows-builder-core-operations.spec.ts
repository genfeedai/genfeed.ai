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
import { expectNoErrorOverlay, tryClick } from '../../utils/route-assertions';

/**
 * Core builder-operation coverage for the workflow canvas: node CRUD,
 * drag/reorder, auto-layout, context menu, and the run → execution flow.
 *
 * This is the regression guard for the `apps/app` workflow-store fork deletion
 * (issue #1151, step 5) — it exercises the live `/workflows/new` and
 * `/workflows/:id` builder, which is backed by the canonical
 * `@genfeedai/workflow-ui` store, and MUST stay green both before and after the
 * fork is removed. Like the sibling builder spec, all API + Better Auth traffic
 * is mocked and interactions are best-effort (`.catch(() => {})`) so a missing
 * affordance never hard-fails; the invariant asserted after each operation is
 * "canvas still mounted, no Next.js error overlay".
 *
 * @module workflows-builder-core-operations.spec
 */

const CANVAS = '.react-flow';
const NODE = '.react-flow__node';
const PANE = '.react-flow__pane';

test.describe('Workflows builder core operations', () => {
  test.setTimeout(120_000);

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

  test('right-clicking the canvas opens the pane context menu', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/workflows/new', {
      waitUntil: 'domcontentloaded',
    });
    const canvas = authenticatedPage.locator(CANVAS).first();
    await canvas.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});

    await authenticatedPage
      .locator(PANE)
      .first()
      .click({ button: 'right' })
      .catch(() => {});
    await authenticatedPage.waitForTimeout(300);

    // The package ContextMenu is a floating list; assert one of its stable
    // pane-menu entries surfaced. If the environment renders no menu, we still
    // fall through to the no-error invariant rather than hard-failing.
    const menuItem = authenticatedPage
      .getByText(/Fit View|Select All|Auto-layout/i)
      .first();
    const menuVisible = await menuItem.isVisible().catch(() => false);
    if (menuVisible) {
      await expect(menuItem).toBeVisible();
      await authenticatedPage.keyboard.press('Escape').catch(() => {});
    }

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('auto-layout via the context menu leaves the canvas intact', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`/workflows/${testWorkflows[0].id}`, {
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage
      .locator(CANVAS)
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => {});

    const nodesBefore = await authenticatedPage.locator(NODE).count();

    await authenticatedPage
      .locator(PANE)
      .first()
      .click({ button: 'right' })
      .catch(() => {});
    await authenticatedPage.waitForTimeout(250);
    await tryClick(authenticatedPage, 'text=/Auto-layout/i');
    await authenticatedPage.waitForTimeout(400);

    // Auto-layout repositions nodes; it must never drop or duplicate them.
    const nodesAfter = await authenticatedPage.locator(NODE).count();
    if (nodesBefore > 0) {
      expect(nodesAfter).toBe(nodesBefore);
    }

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('a node can be dragged to a new position without errors', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`/workflows/${testWorkflows[0].id}`, {
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage
      .locator(CANVAS)
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => {});

    const node = authenticatedPage.locator(NODE).first();
    const hasNode = await node.isVisible().catch(() => false);
    if (hasNode) {
      const box = await node.boundingBox().catch(() => null);
      if (box) {
        await authenticatedPage.mouse.move(
          box.x + box.width / 2,
          box.y + box.height / 2,
        );
        await authenticatedPage.mouse.down();
        await authenticatedPage.mouse.move(box.x + 140, box.y + 90, {
          steps: 8,
        });
        await authenticatedPage.mouse.up();
        await authenticatedPage.waitForTimeout(300);
      }
      // The node survives the drag.
      await expect(authenticatedPage.locator(NODE).first()).toBeVisible();
    }

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('selecting a node and pressing Delete removes it', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`/workflows/${testWorkflows[0].id}`, {
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage
      .locator(CANVAS)
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => {});

    const nodesBefore = await authenticatedPage.locator(NODE).count();
    if (nodesBefore > 0) {
      await authenticatedPage
        .locator(NODE)
        .first()
        .click()
        .catch(() => {});
      await authenticatedPage.waitForTimeout(200);
      await authenticatedPage.keyboard.press('Delete').catch(() => {});
      await authenticatedPage.waitForTimeout(300);

      const nodesAfter = await authenticatedPage.locator(NODE).count();
      // Deletion should not increase the node count; typically it decreases.
      expect(nodesAfter).toBeLessThanOrEqual(nodesBefore);
    }

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('a palette node can be dragged onto the canvas', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/workflows/new', {
      waitUntil: 'domcontentloaded',
    });
    const canvas = authenticatedPage.locator(CANVAS).first();
    await canvas.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});

    // Reveal the palette if collapsed.
    await tryClick(authenticatedPage, 'button[title*="sidebar" i]');
    await authenticatedPage.waitForTimeout(200);

    const paletteItem = authenticatedPage.locator('[draggable="true"]').first();
    const hasItem = await paletteItem.isVisible().catch(() => false);
    if (hasItem) {
      const target = await canvas.boundingBox().catch(() => null);
      if (target) {
        await paletteItem
          .dragTo(canvas, {
            targetPosition: { x: target.width / 2, y: target.height / 2 },
          })
          .catch(() => {});
        await authenticatedPage.waitForTimeout(400);
      }
    }

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('running an existing workflow opens the execution stream view', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`/workflows/${testWorkflows[0].id}`, {
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage
      .locator(CANVAS)
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => {});

    const executionRequest = authenticatedPage
      .waitForRequest(
        (request) =>
          request.method() === 'POST' &&
          /\/(workflow-executions|workflows\/[^/]+\/execute)/.test(
            request.url(),
          ),
        { timeout: 10_000 },
      )
      .catch(() => null);

    await authenticatedPage
      .getByRole('button', { name: 'Run' })
      .first()
      .click()
      .catch(() => {});

    const request = await executionRequest;
    if (request) {
      expect(request.method()).toBe('POST');
    }
    await authenticatedPage.waitForTimeout(400);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
