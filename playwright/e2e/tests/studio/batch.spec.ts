import {
  IngredientCategory,
  IngredientStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page, Route } from '@playwright/test';
import { playwrightApiEndpoint } from '../../config/environment';
import {
  buildExecutionJsonApiResource,
  mockActiveSubscription,
  mockWorkflowCrud,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

const LOCAL_API = playwrightApiEndpoint;

const workflow = {
  createdAt: '2026-03-15T12:00:00.000Z',
  description: 'Run a workflow across uploaded images',
  edges: [],
  id: 'workflow-1',
  name: 'Batch Video Workflow',
  nodes: [],
  status: 'published',
  updatedAt: '2026-03-15T12:00:00.000Z',
};

// `BatchWorkflowExecutionService.startBatchExecution` (apps/server/api/src/
// collections/workflows/services/batch-workflow-execution.service.ts) caps a
// batch at `MAX_BATCH_ITEMS = 100` — the real DTO/service ceiling, not 500.
const BATCH_VIDEO_COUNT = 100;
const BATCH_VIDEO_DURATION_SECONDS = 5;
const BATCH_EXECUTION_ID = 'job-1';
const BATCH_CHILD_WORKFLOW_VERSION_ID = 'workflow-1-version-1';

/**
 * Batch runs are ordinary workflow executions with a for-each shape, not a
 * separate `/workflows/batch` resource — see
 * `BATCH_WORKFLOW_EXECUTION_CANONICAL_ID` and `toBatchExecution` /
 * `toBatchExecutionSummary` in
 * `apps/app/src/features/workflows/utils/batch-execution.ts`. The composer
 * (`useBatchWorkflowPage`) fetches them through the same
 * `service.listExecutions()` / `service.getExecution()` calls as the regular
 * Runs surface, i.e. `GET /workflow-executions` and
 * `GET /workflow-executions/:id`. Mocking a `/workflows/batch` endpoint (as
 * this spec previously did) mocks an endpoint the app never calls.
 */
const BATCH_WORKFLOW_EXECUTION_CANONICAL_ID = 'workflow.batch.execute';

/**
 * One child result entry inside the parent execution's for-each node output.
 * Mirrors `executeAwaitedForEach`'s real success shape (`system-workflow-
 * for-each.util.ts`): `{ index, provenance, result }`, where the child's
 * execution id lives under `provenance.executionId` — never a top-level
 * `executionId` (that field only exists on the *failed*-item shape). The
 * client's `toExecutionItem` (batch-execution.ts) supports both as a
 * fallback, so a top-level id here would silently exercise the wrong path.
 */
function createBatchVideoResult(index: number) {
  const id = `video-output-${index}`;

  return {
    index: index - 1,
    provenance: {
      executionId: `exec-${index}`,
      workflowId: workflow.id,
      workflowLabel: workflow.name,
    },
    result: {
      category: IngredientCategory.VIDEO,
      duration: BATCH_VIDEO_DURATION_SECONDS,
      id,
      ingredientUrl: `https://cdn.example.com/ingredients/videos/${id}`,
      status: IngredientStatus.GENERATED,
      thumbnailUrl: `https://cdn.example.com/ingredients/thumbnails/${id}`,
    },
  };
}

const batchVideoResults = Array.from(
  { length: BATCH_VIDEO_COUNT },
  (_, index) => createBatchVideoResult(index + 1),
);

/** Builds a `workflow-executions` resource shaped like a real batch parent run. */
function buildBatchExecutionAttributes({
  status,
  results,
}: {
  status: WorkflowExecutionStatus;
  results: typeof batchVideoResults;
}): Record<string, unknown> {
  const ingredientIds = Array.from(
    { length: BATCH_VIDEO_COUNT },
    (_, index) => `input-${index + 1}`,
  );

  return {
    createdAt: '2026-03-15T12:01:00.000Z',
    inputValues: {
      childWorkflowId: workflow.id,
      childWorkflowVersionId: BATCH_CHILD_WORKFLOW_VERSION_ID,
      items: ingredientIds,
    },
    metadata: {
      batchExecution: {
        childWorkflowId: workflow.id,
        childWorkflowVersionId: BATCH_CHILD_WORKFLOW_VERSION_ID,
        itemCount: ingredientIds.length,
      },
      canonicalId: BATCH_WORKFLOW_EXECUTION_CANONICAL_ID,
    },
    nodeResults: [
      {
        nodeId: 'execute-items',
        nodeType: 'genfeedAction',
        output: { results },
        status,
      },
    ],
    progress: results.length === 0 ? 0 : 100,
    startedAt: '2026-03-15T12:01:00.000Z',
    status,
    trigger: 'api',
    updatedAt: '2026-03-15T12:02:10.000Z',
    // The batch's *effective* workflow id (shown in the UI) comes from
    // `inputValues.childWorkflowId` above, not this top-level field — the
    // parent execution runs the internal for-each system workflow.
    workflowId: 'batch-parent-workflow',
  };
}

const recentExecutionResource = buildExecutionJsonApiResource(
  BATCH_EXECUTION_ID,
  buildBatchExecutionAttributes({
    results: [],
    status: WorkflowExecutionStatus.RUNNING,
  }),
);

const completedExecutionResource = buildExecutionJsonApiResource(
  BATCH_EXECUTION_ID,
  buildBatchExecutionAttributes({
    results: batchVideoResults,
    status: WorkflowExecutionStatus.COMPLETED,
  }),
);

/** Local copy of the fixture's host-fanout helper (kept test-local; see lane contract). */
async function routeApiPattern(
  page: Page,
  pathPattern: string,
  handler: (route: Route) => Promise<void>,
): Promise<void> {
  await page.route(`**/api.genfeed.ai${pathPattern}`, handler);
  await page.route(`**/api.genfeed.ai/v1${pathPattern}`, handler);
  await page.route(`${LOCAL_API}${pathPattern}`, handler);
}

async function routeBatchWorkflow(page: Page): Promise<void> {
  // Collection — registered first so the by-ID handler below (registered
  // after, and thus matched first) can fall through to it for plain
  // `?limit=` list requests. Same ordering as `mockWorkflowExecutions`.
  await routeApiPattern(page, '/workflow-executions**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ data: [recentExecutionResource] }),
      contentType: 'application/json',
      status: 200,
    });
  });
  await routeApiPattern(page, '/workflow-executions/*', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ data: completedExecutionResource }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

test('batch generation mocks 100 five-second videos in one job', () => {
  const attributes = completedExecutionResource.attributes as {
    inputValues: { items: string[] };
    nodeResults: Array<{ output: { results: typeof batchVideoResults } }>;
  };

  expect(attributes.inputValues.items).toHaveLength(BATCH_VIDEO_COUNT);
  expect(attributes.nodeResults[0]?.output.results).toHaveLength(
    BATCH_VIDEO_COUNT,
  );
  expect(
    attributes.nodeResults[0]?.output.results.every(
      (entry) => entry.result.duration === BATCH_VIDEO_DURATION_SECONDS,
    ),
  ).toBe(true);
});

test.describe('Batch Workflow Runner', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockWorkflowCrud(authenticatedPage, [workflow]);
    await routeBatchWorkflow(authenticatedPage);
  });

  test('keeps Batch in studio navigation and opens the composer', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.STUDIO.BATCH);

    await expect(authenticatedPage).toHaveURL(/\/studio\/batch(?:\/new)?$/);
    await assertNoErrorBoundaryFallback(
      authenticatedPage,
      APP_ROUTES.STUDIO.BATCH,
    );
    await expect(
      authenticatedPage.getByRole('link', { name: 'Batch', exact: true }),
    ).toBeVisible();
  });

  test('loads the composer with New and History tabs and keeps Run Batch disabled before setup', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.STUDIO.BATCH);

    await expect(authenticatedPage).toHaveURL(/\/studio\/batch(?:\/new)?$/);
    await assertNoErrorBoundaryFallback(
      authenticatedPage,
      APP_ROUTES.STUDIO.BATCH,
    );
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Batch Workflow Runner' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('link', { name: 'New', exact: true }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('link', { name: 'History', exact: true }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: /Run Batch \(0\)/i }),
    ).toBeDisabled();
  });

  test('shows recent executions on the history tab', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.STUDIO.BATCH_HISTORY);

    await assertNoErrorBoundaryFallback(
      authenticatedPage,
      APP_ROUTES.STUDIO.BATCH_HISTORY,
    );
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Recent executions' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: /Batch Video Workflow/i }),
    ).toBeVisible();
  });

  test('shows terminal batch results and MVP actions when opened from a job URL', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${APP_ROUTES.STUDIO.BATCH_HISTORY}?execution=${BATCH_EXECUTION_ID}`,
    );

    await assertNoErrorBoundaryFallback(
      authenticatedPage,
      APP_ROUTES.STUDIO.BATCH_HISTORY,
    );
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Batch Results' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Download all' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Publish all' }),
    ).toBeVisible();
    await expect(
      authenticatedPage
        .getByRole('button', { name: 'Open in library' })
        .first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('video-output-1', { exact: true }),
    ).toBeVisible();
  });
});
