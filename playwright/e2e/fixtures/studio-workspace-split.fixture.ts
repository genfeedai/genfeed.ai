import {
  FLUX_3_IMAGE_CONTRACT_VERSION,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import type { Page, Route, WebSocketRoute } from '@playwright/test';
import { buildProtectedAppBootstrapPayload } from '../utils/api-interceptor';
import { mockGenerationQuote } from '../utils/generation-setup';
import { mockActiveSubscription } from './api-mocks.fixture';

export async function installWorkspaceSplitFixture(page: Page) {
  const model = MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE;
  const id = 'workspace-split-result';
  const completed = new Set(['workspace-split-existing']);
  let socket: WebSocketRoute | undefined;
  let admission: Route | undefined;
  let generationRequests = 0;
  const preview = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=',
    'base64',
  );
  const image = (imageId: string) => ({
    id: imageId,
    type: 'ingredients',
    attributes: {
      brandId: 'brand-1',
      organizationId: 'mock-org-id-e2e-test',
      category: 'IMAGE',
      scope: 'USER',
      status: completed.has(imageId) ? 'GENERATED' : 'PROCESSING',
      cdnUrl: `https://cdn.genfeed.ai/mock/${imageId}.png`,
      width: 1024,
      height: 768,
      createdAt: '2026-10-23T12:00:00Z',
      prompt: { original: 'Synthetic workspace acceptance image' },
      generationHarness: {
        brandId: 'brand-1',
        originalPrompt: 'Synthetic workspace acceptance image',
        enhancedPrompt: 'Synthetic workspace acceptance image',
        status: 'skipped',
        source: 'request',
        appliedPacks: [],
      },
      metadata: { label: imageId, model, width: 1024, height: 768 },
    },
  });
  await page.route('**/cdn.genfeed.ai/mock/workspace-split-*.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: preview }),
  );
  await page.routeWebSocket('**/socket.io/**', (connection) => {
    socket = connection;
    connection.send(
      `0${JSON.stringify({ sid: 'workspace-split', upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1000000 })}`,
    );
    connection.onMessage((message) => {
      if (typeof message === 'string' && message.startsWith('40'))
        connection.send('40{"sid":"workspace-split"}');
      if (message === '2') connection.send('3');
    });
  });
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await mockGenerationQuote(page, { routedModelKey: model });
  await page.route('**/v1/auth/bootstrap**', (route) => {
    const bootstrap = buildProtectedAppBootstrapPayload();
    return route.fulfill({
      json: {
        ...bootstrap,
        settings: { ...bootstrap.settings, enabledModelIds: [model] },
      },
    });
  });
  await page.route('**/v1/models**', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'workspace-split-model',
            type: 'models',
            attributes: {
              key: model,
              label: 'FLUX.3',
              provider: 'replicate',
              category: 'image',
              isDefault: true,
              isActive: true,
              isDeleted: false,
              cost: 8,
              maxOutputs: 1,
              reviewedProviderContractVersion: FLUX_3_IMAGE_CONTRACT_VERSION,
            },
          },
        ],
        meta: { totalCount: 1 },
      },
    }),
  );
  await page.route('**/v1/studio-generate-drafts/current**', (route) =>
    route.fulfill({
      json:
        route.request().method() === 'GET'
          ? { data: null }
          : {
              data: {
                id: 'workspace-split-draft',
                type: 'studio-generate-drafts',
                attributes:
                  route.request().postDataJSON()?.data?.attributes ??
                  route.request().postDataJSON(),
              },
            },
    }),
  );
  await page.route('**/v1/ingredients**', (route) => {
    const url = new URL(route.request().url());
    if (/\/(posts|children)$/.test(url.pathname))
      return route.fulfill({ json: { data: [] } });
    const imageId = url.pathname.split('/').at(-1);
    return route.fulfill({
      json:
        imageId && imageId !== 'ingredients'
          ? { data: image(imageId) }
          : {
              data: [...completed].map(image),
              meta: { page: 1, pageSize: 100, totalCount: completed.size },
            },
    });
  });
  await page.route('**/v1/images', (route) => {
    generationRequests++;
    admission = route;
  });
  await page.route('**/v1/images/**', (route) =>
    route.fulfill({
      json: {
        data: image(
          new URL(route.request().url()).pathname.split('/').at(-1) ?? id,
        ),
      },
    }),
  );
  return {
    id,
    hasAdmission: () => Boolean(admission),
    hasSocket: () => Boolean(socket),
    generationRequests: () => generationRequests,
    async admit() {
      if (!admission)
        throw new Error('No synthetic generation request was intercepted');
      await admission.fulfill({
        json: {
          data: {
            ...image(id),
            attributes: { ...image(id).attributes, pendingIngredientIds: [id] },
          },
        },
      });
    },
    complete() {
      if (!socket) throw new Error('No synthetic socket was opened');
      completed.add(id);
      socket.send(
        `42${JSON.stringify([`/images/${id}`, { status: 'completed', result: { id } }])}`,
      );
    },
  };
}
