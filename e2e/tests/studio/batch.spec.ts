import {
  mockActiveSubscription,
  mockWorkflowCrud,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

const LOCAL_API = 'http://local.genfeed.ai:3001/v1';

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

const recentJob = {
  _id: 'job-1',
  completedCount: 0,
  createdAt: '2026-03-15T12:01:00.000Z',
  failedCount: 0,
  status: 'processing',
  totalCount: 2,
  workflowId: workflow.id,
};

const completedBatchJob = {
  _id: 'job-1',
  completedCount: 2,
  createdAt: '2026-03-15T12:01:00.000Z',
  failedCount: 0,
  items: [
    {
      _id: 'item-1',
      completedAt: '2026-03-15T12:02:00.000Z',
      executionId: 'exec-1',
      ingredientId: 'input-1',
      outputCategory: 'video',
      outputIngredientId: 'video-output-1',
      outputSummary: {
        category: 'video',
        id: 'video-output-1',
        ingredientUrl:
          'https://cdn.example.com/ingredients/videos/video-output-1',
        status: 'generated',
        thumbnailUrl:
          'https://cdn.example.com/ingredients/thumbnails/video-output-1',
      },
      status: 'completed',
    },
    {
      _id: 'item-2',
      completedAt: '2026-03-15T12:02:10.000Z',
      executionId: 'exec-2',
      ingredientId: 'input-2',
      outputCategory: 'video',
      outputIngredientId: 'video-output-2',
      outputSummary: {
        category: 'video',
        id: 'video-output-2',
        ingredientUrl:
          'https://cdn.example.com/ingredients/videos/video-output-2',
        status: 'generated',
        thumbnailUrl:
          'https://cdn.example.com/ingredients/thumbnails/video-output-2',
      },
      status: 'completed',
    },
  ],
  status: 'completed',
  totalCount: 2,
  updatedAt: '2026-03-15T12:02:10.000Z',
  workflowId: workflow.id,
};

async function routeBatchWorkflow(
  page: Parameters<typeof mockWorkflowCrud>[0],
): Promise<void> {
  await page.route('**/api.genfeed.ai/v1/workflows/batch**', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ data: [recentJob] }),
      contentType: 'application/json',
      status: 200,
    });
  });
  await page.route(`${LOCAL_API}/workflows/batch**`, async (route) => {
    await route.fulfill({
      body: JSON.stringify({ data: [recentJob] }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/api.genfeed.ai/v1/workflows/batch/*', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ data: completedBatchJob }),
      contentType: 'application/json',
      status: 200,
    });
  });
  await page.route(`${LOCAL_API}/workflows/batch/*`, async (route) => {
    await route.fulfill({
      body: JSON.stringify({ data: completedBatchJob }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

test.describe('Batch Workflow Runner', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockWorkflowCrud(authenticatedPage, [workflow]);
    await routeBatchWorkflow(authenticatedPage);
  });

  test('remains hidden from the studio navigation while still supporting direct access', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/studio/batch');

    await expect(authenticatedPage).toHaveURL(/\/studio\/batch$/);
    await expect(
      authenticatedPage.getByRole('link', { name: /batch/i }),
    ).toHaveCount(0);
  });

  test('loads on the direct hidden route, shows recent jobs, and keeps Run Batch disabled before setup', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/studio/batch');

    await expect(authenticatedPage).toHaveURL(/\/studio\/batch$/);
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Batch Workflow Runner' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: /Run Batch \(0\)/i }),
    ).toBeDisabled();
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Recent jobs' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: /Batch Video Workflow/i }),
    ).toBeVisible();
  });

  test('shows terminal batch results and MVP actions when opened from a job URL', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/studio/batch?job=job-1');

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
    await expect(authenticatedPage.getByText('video-output-1')).toBeVisible();
  });
});
