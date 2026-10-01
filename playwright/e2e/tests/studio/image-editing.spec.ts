import { brandPath } from '@e2e/utils/app-chrome';
import {
  APP_ROUTES,
  IMAGE_EDIT_CONTRACT_VERSION,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { buildProtectedAppBootstrapPayload } from '../../utils/api-interceptor';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

const sourceId = 'editing-source-e2e';
const outputId = 'editing-output-e2e';
const model = MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5;
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=',
  'base64',
);

test('Library image entry submits a raw editing instruction and saves a reusable edit result', async ({
  authenticatedPage: page,
}, testInfo) => {
  test.setTimeout(120_000);
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  let edited = false;
  const bodies: Record<string, unknown>[] = [];
  const recipe = {
    contractVersion: IMAGE_EDIT_CONTRACT_VERSION,
    operation: 'image-edit',
    model,
    sourceIds: [sourceId],
    size: 'source',
    quality: 'medium',
    outputs: 1,
    seed: 0,
  };
  const image = (id: string) => ({
    id,
    type: 'ingredients',
    attributes: {
      brandId: 'brand-1',
      category: 'IMAGE',
      status: 'GENERATED',
      scope: 'USER',
      cdnUrl: `https://cdn.genfeed.ai/mock/${id}.png`,
      createdAt: '2026-10-01T10:00:00.000Z',
      width: 1024,
      height: 768,
      metadata: { label: id, width: 1024, height: 768, model },
      ...(id === outputId
        ? {
            parentId: sourceId,
            imageEdit: recipe,
            generationPrompt: 'Change only the sign to OPEN',
            prompt: { original: 'Change only the sign to OPEN' },
          }
        : {}),
    },
  });
  await page.route('**/cdn.genfeed.ai/mock/*.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: pixel }),
  );
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
            id: 'editing-model-e2e',
            type: 'models',
            attributes: {
              key: model,
              category: 'image-edit',
              label: 'Ideogram 4.5',
              provider: 'replicate',
              isDefault: true,
              isActive: true,
              isDeleted: false,
              cost: 20,
              maxOutputs: 8,
              maxReferences: 5,
            },
          },
        ],
        meta: { totalCount: 1 },
      },
    }),
  );
  await page.route('**/v1/studio-generate-drafts/current**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { data: null } });
      return;
    }
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: { data: { ...body.data, id: 'editing-draft-e2e' } },
    });
  });
  await page.route('**/v1/ingredients**', async (route) => {
    const url = new URL(route.request().url());
    const isSingle =
      url.pathname.endsWith(`/${sourceId}`) ||
      url.pathname.endsWith(`/${outputId}`);
    await route.fulfill({
      json: isSingle
        ? {
            data: image(
              url.pathname.endsWith(`/${sourceId}`) ? sourceId : outputId,
            ),
          }
        : {
            data: edited
              ? [image(outputId), image(sourceId)]
              : [image(sourceId)],
            meta: { page: 1, pageSize: 100, totalCount: edited ? 2 : 1 },
          },
    });
  });
  await page.route(`**/v1/images/${outputId}`, (route) =>
    route.fulfill({ json: { data: image(outputId) } }),
  );
  await page.route(`**/v1/images/${sourceId}/edit`, async (route) => {
    bodies.push(route.request().postDataJSON());
    edited = true;
    await route.fulfill({
      json: {
        data: {
          ...image(outputId),
          attributes: {
            ...image(outputId).attributes,
            pendingIngredientIds: [outputId],
          },
        },
      },
    });
  });
  await page.goto(
    brandPath(`${APP_ROUTES.STUDIO.GENERATE}?editImage=${sourceId}`),
    { waitUntil: 'domcontentloaded' },
  );
  const composer = page
    .getByTestId('studio-generate-prompt')
    .getByRole('textbox');
  await expect(page.getByLabel('Editing seed')).toBeVisible();
  await expect(composer).toBeEmpty();
  await composer.fill('Change only the sign to OPEN');
  await page.getByLabel('Editing seed').fill('0');
  await page.screenshot({
    path: testInfo.outputPath('image-editing-studio.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toMatchObject({
    data: {
      attributes: {
        prompt: 'Change only the sign to OPEN',
        outputs: 1,
        size: 'source',
        seed: 0,
      },
    },
  });
  expect(JSON.stringify(bodies[0])).not.toContain('prompt_template');
  expect(JSON.stringify(bodies[0])).not.toContain('brandingMode');
  await expect(page.getByTestId('studio-generate-results')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('studio-generate-results')).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Edit image generation' }).first(),
  ).toContainText('Change only the sign to OPEN');
  await expect(page.getByLabel('Editing seed')).toHaveValue('');
  await expectNoErrorOverlay(page);
});
