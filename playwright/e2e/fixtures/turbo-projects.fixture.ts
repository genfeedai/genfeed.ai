import {
  TurboProjectItemStatus,
  TurboProjectKind,
  TurboProjectStatus,
  TurboProjectStep,
} from '@genfeedai/contracts';
import type {
  ITurboProject,
  ITurboProjectItem,
  ITurboProjectSettings,
  IScheduleTurboProjectInput,
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
export async function mockTurboProject(
  page: Page,
  kind: TurboProjectKind,
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
  let project: ITurboProject = {
    id: 'persisted-batch',
    name: 'Saved batch',
    brandId: 'brand-1',
    kind,
    status: TurboProjectStatus.DRAFT,
    step:
      kind === TurboProjectKind.IDEAS
        ? TurboProjectStep.IDEAS
        : TurboProjectStep.INPUTS,
    workflowId: kind === TurboProjectKind.WORKFLOW ? 'workflow-1' : null,
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
  const scheduled: IScheduleTurboProjectInput[] = [];
  const item = (inputIngredientId?: string): ITurboProjectItem => ({
    id: 'item-1',
    projectId: project.id,
    position: 0,
    status: TurboProjectItemStatus.PENDING,
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
        category: kind === TurboProjectKind.WORKFLOW ? 'VIDEO' : 'IMAGE',
      }),
    }),
  );
  await mockReviewQueue(page, {
    turboRunId: 'review-batch',
    itemId: 'review-item',
    itemAttributes: {
      label: 'Saved batch output',
      prompt: 'Saved batch output',
      sourceActionId: 'turbo-project-item:item-1',
      sourceWorkflowName: 'Saved workflow',
    },
  });
  const response = () => ({
    data: resource('turbo-projects', project.id, project),
  });
  await page.route(
    `${playwrightApiEndpoint}/turbo-projects**`,
    async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.split('/turbo-projects')[1];
      const method = route.request().method();
      if (method === 'GET' && !path)
        return json(route, { data: [response().data] });
      if (method === 'PATCH') {
        const input = route.request().postDataJSON() as {
          name?: string;
          step?: TurboProjectStep;
          settings?: ITurboProjectSettings;
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
            ? TurboProjectStatus.GENERATING
            : TurboProjectStatus.REVIEWING;
          project.step = TurboProjectStep.REVIEW;
          project.reviewTurboRunId = 'review-batch';
          if (project.quote)
            project.quote.acceptedAt = new Date().toISOString();
          project.items = project.items?.map((entry) => ({
            ...entry,
            status: options.deferGeneration
              ? TurboProjectItemStatus.GENERATING
              : TurboProjectItemStatus.READY,
            outputIngredientId: 'output-1',
            reviewTurboRunId: 'review-batch',
            reviewItemId: 'review-item',
          }));
        } else if (path.endsWith('/review'))
          project.items = project.items?.map((entry) => ({
            ...entry,
            status: TurboProjectItemStatus.APPROVED,
          }));
        else if (path.endsWith('/schedule')) {
          scheduled.push(
            route.request().postDataJSON() as IScheduleTurboProjectInput,
          );
          project.status = TurboProjectStatus.SCHEDULED;
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
      project.status = TurboProjectStatus.REVIEWING;
      project.items = project.items?.map((entry) => ({
        ...entry,
        status: TurboProjectItemStatus.READY,
      }));
    },
  };
}
