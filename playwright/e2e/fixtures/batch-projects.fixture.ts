import {
  BatchProjectItemStatus,
  BatchProjectKind,
  BatchProjectStatus,
  BatchProjectStep,
} from '@genfeedai/contracts';
import type {
  IBatchProject,
  IBatchProjectItem,
  IBatchProjectSettings,
  IScheduleBatchProjectInput,
} from '@genfeedai/contracts/interfaces';
import type { Page, Route } from '@playwright/test';
import { playwrightApiEndpoint } from '../config/environment';
import { buildProtectedAppBootstrapPayload } from '../utils/api-interceptor';
import { mockActiveSubscription, mockReviewQueue } from './api-mocks.fixture';

const resource = (type: string, id: string, attributes: object) => ({
  type,
  id,
  attributes,
});
const json = (route: Route, payload: unknown) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
export async function mockBatchProject(
  page: Page,
  kind: BatchProjectKind,
  options: { deferGeneration?: boolean } = {},
) {
  const bootstrap = buildProtectedAppBootstrapPayload();
  const credential = {
    id: 'batch-instagram',
    label: 'Batch Instagram',
    platform: 'instagram',
    status: 'active',
    isConnected: true,
  };
  const readyBrand = {
    ...bootstrap.brands[0],
    credentials: [credential],
    agentConfig: { voice: { tone: 'Clear' } },
    references: [{ id: 'reference-1' }],
  };
  const ready = {
    ...bootstrap,
    brands: [readyBrand],
    settings: { ...bootstrap.settings, isFastlaneEnabled: true },
  };
  await page.route(`${playwrightApiEndpoint}/auth/bootstrap**`, (route) =>
    json(route, ready),
  );
  await page.route(`${playwrightApiEndpoint}/users/me/brands**`, (route) =>
    json(route, { data: [resource('brands', 'brand-1', readyBrand)] }),
  );
  await page.route(
    `${playwrightApiEndpoint}/organizations/*/settings`,
    (route) =>
      json(route, {
        data: resource('organization-settings', 'settings-1', ready.settings),
      }),
  );
  await mockActiveSubscription(page);
  let project: IBatchProject = {
    id: 'persisted-batch',
    name: 'Saved batch',
    brandId: 'brand-1',
    kind,
    status: BatchProjectStatus.DRAFT,
    step:
      kind === BatchProjectKind.IDEAS
        ? BatchProjectStep.IDEAS
        : BatchProjectStep.INPUTS,
    workflowId: kind === BatchProjectKind.WORKFLOW ? 'workflow-1' : null,
    revision: 0,
    settings: { ideas: { formats: ['image'], count: 3 } },
    items: [],
    itemCounts: {
      total: 0,
      pending: 0,
      generating: 0,
      ready: 0,
      failed: 0,
      approved: 0,
      rejected: 0,
      scheduled: 0,
    },
    updatedAt: new Date().toISOString(),
  };
  const scheduled: IScheduleBatchProjectInput[] = [];
  const item = (inputIngredientId?: string): IBatchProjectItem => ({
    id: 'item-1',
    projectId: project.id,
    position: 0,
    status: BatchProjectItemStatus.PENDING,
    retryCount: 0,
    scheduledTargets: [],
    inputIngredientId,
    ...(inputIngredientId
      ? { inputCategory: 'VIDEO' }
      : {
          idea: {
            id: 'idea-1',
            hook: 'Launch idea',
            caption: 'Saved caption',
            visualPrompt: 'A product image',
            format: 'image',
            platformHints: ['instagram'],
          },
        }),
  });
  await page.route(`${playwrightApiEndpoint}/workflows**`, (route) =>
    json(route, {
      data: [
        resource('workflows', 'workflow-1', {
          label: 'Saved workflow',
          name: 'Saved workflow',
          lifecycle: 'published',
          nodes: [],
          edges: [],
        }),
      ],
    }),
  );
  await page.route(`${playwrightApiEndpoint}/videos/upload`, (route) =>
    json(route, {
      data: resource('videos', 'video-input', {
        category: 'VIDEO',
        status: 'UPLOADED',
      }),
    }),
  );
  await page.route(`${playwrightApiEndpoint}/ingredients/*`, (route) =>
    json(route, {
      data: resource('ingredients', 'output-1', {
        category: kind === BatchProjectKind.WORKFLOW ? 'VIDEO' : 'IMAGE',
      }),
    }),
  );
  await mockReviewQueue(page, {
    batchId: 'review-batch',
    itemId: 'review-item',
    itemAttributes: {
      label: 'Saved batch output',
      prompt: 'Saved batch output',
      sourceActionId: 'batch-project-item:item-1',
      sourceWorkflowName: 'Saved workflow',
    },
  });
  const response = () => ({
    data: resource('batch-projects', project.id, project),
  });
  await page.route(
    `${playwrightApiEndpoint}/batch-projects**`,
    async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.split('/batch-projects')[1];
      const method = route.request().method();
      if (method === 'GET' && !path)
        return json(route, { data: [response().data] });
      if (method === 'PATCH') {
        const input = route.request().postDataJSON() as {
          name?: string;
          step?: BatchProjectStep;
          settings?: IBatchProjectSettings;
          caption?: string;
        };
        if (path.includes('/items/'))
          project.items = project.items?.map((entry) => ({
            ...entry,
            caption: input.caption,
          }));
        else
          project = {
            ...project,
            ...input,
            settings: { ...project.settings, ...input.settings },
          };
        return json(route, response());
      }
      if (method === 'POST') {
        if (!path) project = { ...project, ...route.request().postDataJSON() };
        else if (path.endsWith('/ideas')) project.items = [item()];
        else if (path.endsWith('/items')) project.items = [item('video-input')];
        else if (path.endsWith('/quote')) {
          project.quote = {
            id: 'quote-1',
            revision: project.revision,
            total: 4,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            items: [
              {
                itemId: 'item-1',
                key: 'generation-1',
                format: 'image',
                model: 'test-model',
                credits: 4,
                billingMode: 'platform',
                attempt: 1,
              },
            ],
          };
          return json(route, { data: project.quote });
        } else if (path.endsWith('/start')) {
          project.status = options.deferGeneration
            ? BatchProjectStatus.GENERATING
            : BatchProjectStatus.REVIEWING;
          project.step = BatchProjectStep.REVIEW;
          project.reviewBatchId = 'review-batch';
          if (project.quote)
            project.quote.acceptedAt = new Date().toISOString();
          project.items = project.items?.map((entry) => ({
            ...entry,
            status: options.deferGeneration
              ? BatchProjectItemStatus.GENERATING
              : BatchProjectItemStatus.READY,
            outputIngredientId: 'output-1',
            reviewBatchId: 'review-batch',
            reviewItemId: 'review-item',
          }));
        } else if (path.endsWith('/review'))
          project.items = project.items?.map((entry) => ({
            ...entry,
            status: BatchProjectItemStatus.APPROVED,
          }));
        else if (path.endsWith('/schedule')) {
          scheduled.push(
            route.request().postDataJSON() as IScheduleBatchProjectInput,
          );
          project.status = BatchProjectStatus.SCHEDULED;
          project.items = project.items?.map((entry) => ({
            ...entry,
            scheduledAt: new Date().toISOString(),
          }));
          return json(route, { scheduledCount: 1, failedCount: 0 });
        }
        project.itemCounts.total = project.items?.length ?? 0;
      }
      return json(route, response());
    },
  );
  return {
    getProject: () => project,
    scheduled,
    completeGeneration: () => {
      project.status = BatchProjectStatus.REVIEWING;
      project.items = project.items?.map((entry) => ({
        ...entry,
        status: BatchProjectItemStatus.READY,
      }));
    },
  };
}
