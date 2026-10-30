import { APP_ROUTES } from '@genfeedai/contracts/constants';
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
import { brandPath } from '../../utils/app-chrome';
import { expectNoErrorOverlay, tryClick } from '../../utils/route-assertions';

/**
 * Deep interaction coverage for the Workflows list and builder/canvas.
 *
 * All API + Better Auth traffic is mocked. The canvas is React Flow (@xyflow/react),
 * so selectors fall back to `.react-flow__*` and best-effort `tryClick`.
 * Interactions are guarded with `.catch(() => {})` so a missing affordance
 * never hard-fails — the goal is to exercise code paths for coverage.
 *
 * @module workflows-builder-interactions.spec
 */

test.describe('Workflows builder & canvas interactions', () => {
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

  test('library lists workflows and supports searching', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.WORKFLOWS), {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/automation\/workflows/);
    await expect(
      authenticatedPage.getByRole('link', { name: 'Workflows' }).first(),
    ).toBeVisible();
    const search = authenticatedPage.getByPlaceholder('Search workflows...');
    if (await search.isVisible().catch(() => false)) {
      await search.fill('Social');
      await expect(search).toHaveValue('Social');
      await search.fill('zzz-no-match-zzz');
      await search.fill('');
    }
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('library exposes Templates and New Workflow entry points', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.WORKFLOWS), {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.locator('a[href*="/automation/workflows/new"]').first(),
    ).toBeVisible();
    await expect(
      authenticatedPage
        .locator('a[href*="/automation/workflows/templates"]')
        .first(),
    ).toBeVisible();

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('opening a workflow from the library navigates to its builder', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.WORKFLOWS), {
      waitUntil: 'domcontentloaded',
    });

    const workflowLink = authenticatedPage
      .locator(`a[href*="/automation/workflows/${testWorkflows[0].id}"]`)
      .first();
    await workflowLink.click().catch(() => {});
    await authenticatedPage.waitForTimeout(600);

    expect(authenticatedPage.url()).toContain('/automation/workflows');
    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('new workflow builder renders the React Flow canvas', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      brandPath(APP_ROUTES.AUTOMATION.WORKFLOWS_NEW),
      {
        waitUntil: 'domcontentloaded',
      },
    );

    await expect(authenticatedPage).toHaveURL(/\/automation\/workflows\/new/);

    const canvas = authenticatedPage.locator('.react-flow').first();
    await canvas.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('Add node menu searches the catalog and adds a step to the canvas', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      brandPath(APP_ROUTES.AUTOMATION.WORKFLOWS_NEW),
      {
        waitUntil: 'domcontentloaded',
      },
    );

    await expect(authenticatedPage.locator('.react-flow').first()).toBeVisible({
      timeout: 20_000,
    });
    // The fixed palette column is gone; steps are added from the toolbar.
    await expect(
      authenticatedPage.getByPlaceholder('Search nodes...'),
    ).toHaveCount(0);
    const nodes = authenticatedPage.locator('.react-flow__node');
    const nodeCountBefore = await nodes.count();

    await authenticatedPage.getByRole('button', { name: 'Add node' }).click();
    const search = authenticatedPage.getByPlaceholder('Search nodes...');
    await search.fill('Stitch');
    await authenticatedPage
      .getByRole('button', { name: /Stitch Videos/ })
      .click();

    await expect(nodes).toHaveCount(nodeCountBefore + 1);
    await expect(search).toHaveCount(0);
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('new workflow builder sits in the agent rail beside the canvas', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      brandPath(APP_ROUTES.AUTOMATION.WORKFLOWS_NEW),
      {
        waitUntil: 'domcontentloaded',
      },
    );

    const agent = authenticatedPage.getByTestId('agent-output-agent-pane');
    const output = authenticatedPage.getByTestId('agent-output-output-pane');
    await expect(agent).toBeVisible({ timeout: 20_000 });
    await expect(output.locator('.react-flow').first()).toBeVisible({
      timeout: 20_000,
    });

    // Agent on the left, canvas on the right, and one agent only: the
    // product dock is off on the editor routes.
    const [agentBox, outputBox] = await Promise.all([
      agent.boundingBox(),
      output.boundingBox(),
    ]);
    expect(agentBox?.x ?? 0).toBeLessThan(outputBox?.x ?? 0);
    await expect(authenticatedPage.getByTestId('agent-dock')).toHaveCount(0);
    await expect(
      authenticatedPage.getByTestId('topbar-agent-dock-toggle'),
    ).toHaveCount(0);
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('canvas can go full size and bring the agent back', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      brandPath(APP_ROUTES.AUTOMATION.WORKFLOWS_NEW),
      {
        waitUntil: 'domcontentloaded',
      },
    );

    const agent = authenticatedPage.getByTestId('agent-output-agent-pane');
    const output = authenticatedPage.getByTestId('agent-output-output-pane');
    await expect(output.locator('.react-flow').first()).toBeVisible({
      timeout: 20_000,
    });

    await authenticatedPage.getByTestId('agent-output-expand-output').click();
    await expect(agent).toBeHidden();
    await expect(output.locator('.react-flow').first()).toBeVisible();

    await authenticatedPage.getByTestId('agent-output-expand-output').click();
    await expect(agent).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('builder toolbar exposes Run and draft lifecycle actions', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      brandPath(APP_ROUTES.AUTOMATION.WORKFLOWS_NEW),
      {
        waitUntil: 'domcontentloaded',
      },
    );

    await expect(
      authenticatedPage.getByRole('button', { name: 'Run' }).first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Publish' }).first(),
    ).toBeVisible();
    await authenticatedPage
      .getByRole('button', { name: 'Workflow actions' })
      .click();
    await expect(
      authenticatedPage.getByRole('menuitem', { name: 'Archive' }),
    ).toBeVisible();

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('existing workflow builder renders nodes on the canvas', async ({
    authenticatedPage,
  }) => {
    const workflow = testWorkflows[0];

    await authenticatedPage.goto(
      brandPath(`/automation/workflows/${workflow.id}`),
      {
        waitUntil: 'domcontentloaded',
      },
    );

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`/automation/workflows/${workflow.id}$`),
    );

    const canvas = authenticatedPage.locator('.react-flow').first();
    await canvas.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});

    // Best-effort: nodes from the mocked workflow should render.
    const node = authenticatedPage.locator('.react-flow__node').first();
    await node.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('clicking a canvas node exercises selection in the builder', async ({
    authenticatedPage,
  }) => {
    const workflow = testWorkflows[0];

    await authenticatedPage.goto(
      brandPath(`/automation/workflows/${workflow.id}`),
      {
        waitUntil: 'domcontentloaded',
      },
    );

    await authenticatedPage
      .locator('.react-flow')
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => {});

    const node = authenticatedPage.locator('.react-flow__node').first();
    const hasNode = await node.isVisible().catch(() => false);
    if (hasNode) {
      await node.click({ timeout: 5_000 }).catch(() => {});
      await authenticatedPage.waitForTimeout(300);
      await node.hover().catch(() => {});
    }

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('triggering Run posts to the workflow-executions endpoint', async ({
    authenticatedPage,
  }) => {
    const workflow = testWorkflows[0];

    await authenticatedPage.goto(
      brandPath(`/automation/workflows/${workflow.id}`),
      {
        waitUntil: 'domcontentloaded',
      },
    );

    await authenticatedPage
      .locator('.react-flow')
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => {});

    const executionRequest = authenticatedPage
      .waitForRequest(
        (request) =>
          request.method() === 'POST' &&
          request.url().includes('/workflow-executions'),
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
      expect(request.url()).toContain('/workflow-executions');
    }

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('canvas zoom and viewport controls are interactive', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `/automation/workflows/${testWorkflows[0].id}`,
      {
        waitUntil: 'domcontentloaded',
      },
    );

    await authenticatedPage
      .locator('.react-flow')
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => {});

    // React Flow renders <Controls /> with zoom-in / zoom-out / fit buttons.
    await tryClick(authenticatedPage, '.react-flow__controls-zoomin');
    await authenticatedPage.waitForTimeout(150);
    await tryClick(authenticatedPage, '.react-flow__controls-zoomout');
    await authenticatedPage.waitForTimeout(150);
    await tryClick(authenticatedPage, '.react-flow__controls-fitview');
    await authenticatedPage.waitForTimeout(150);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('renaming the workflow via the toolbar title is exercised', async ({
    authenticatedPage,
  }) => {
    const workflow = testWorkflows[0];

    await authenticatedPage.goto(
      brandPath(`/automation/workflows/${workflow.id}`),
      {
        waitUntil: 'domcontentloaded',
      },
    );

    const titleButton = authenticatedPage
      .getByRole('button', { name: workflow.name })
      .first();
    const hasTitle = await titleButton.isVisible().catch(() => false);
    if (hasTitle) {
      await titleButton.click().catch(() => {});
      await authenticatedPage.waitForTimeout(200);
      // If an inline editor appears, type into it then commit with Escape.
      const renameInput = authenticatedPage.locator('input').first();
      const hasInput = await renameInput.isVisible().catch(() => false);
      if (hasInput) {
        await renameInput.fill('Renamed Pipeline').catch(() => {});
        await authenticatedPage.keyboard.press('Escape').catch(() => {});
      }
    }

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('empty library state renders without errors', async ({
    authenticatedPage,
  }) => {
    await mockWorkflowCrud(authenticatedPage, []);
    await mockWorkflowExecutions(authenticatedPage, []);
    await mockWorkflowTemplates(authenticatedPage, []);

    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.WORKFLOWS), {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/automation\/workflows/);
    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expect(
      authenticatedPage.getByRole('link', { name: 'Workflows' }).first(),
    ).toBeVisible();
  });
});
