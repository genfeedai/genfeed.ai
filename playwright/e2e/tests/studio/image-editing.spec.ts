import { brandPath } from '@e2e/utils/app-chrome';
import {
  APP_ROUTES,
  FLUX_3_EDIT_CONTRACT_VERSION,
  FLUX_3_IMAGE_CONTRACT_VERSION,
  IMAGE_EDIT_CONTRACT_VERSION,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { buildProtectedAppBootstrapPayload } from '../../utils/api-interceptor';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

const sourceId = 'editing-source-e2e';
const outputId = 'editing-output-e2e';

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=',
  'base64',
);

for (const { model, editing } of [
  { model: MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5, editing: true },
  {
    model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT,
    editing: true,
  },
  {
    model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE,
    editing: false,
  },
]) {
  const flux = model !== MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5;
  test(`${editing ? 'Library editing' : 'Image generation'} submits and restores ${flux ? 'FLUX.3' : 'Ideogram'} controls`, async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    let edited = false;
    const bodies: Record<string, unknown>[] = [];
    const recipe = flux
      ? {
          contractVersion: FLUX_3_EDIT_CONTRACT_VERSION,
          operation: 'image-edit',
          model,
          sourceIds: [sourceId],
          resolution: '1.5k',
          aspectRatio: 'auto',
          grounding: false,
          outputs: 1,
        }
      : {
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
        metadata: {
          label: id,
          width: 1024,
          height: 768,
          model,
          ...(flux ? { resolution: '1.5k' } : {}),
        },
        ...(id === outputId
          ? {
              parentId: sourceId,
              ...(editing ? { imageEdit: recipe } : {}),
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
                category: editing ? 'image-edit' : 'image',
                label: flux
                  ? editing
                    ? 'FLUX.3 Edit'
                    : 'FLUX.3'
                  : 'Ideogram 4.5',
                provider: 'replicate',
                isDefault: true,
                isActive: true,
                isDeleted: false,
                cost: flux ? 8 : 20,
                maxOutputs: flux ? 1 : 8,
                maxReferences: flux ? 10 : 5,
                reviewedProviderContractVersion: flux
                  ? editing
                    ? FLUX_3_EDIT_CONTRACT_VERSION
                    : FLUX_3_IMAGE_CONTRACT_VERSION
                  : IMAGE_EDIT_CONTRACT_VERSION,
              },
            },
          ],
          meta: { totalCount: 1 },
        },
      }),
    );
    await page.route(
      '**/v1/studio-generate-drafts/current**',
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({ json: { data: null } });
          return;
        }
        const body = route.request().postDataJSON();
        await route.fulfill({
          json: { data: { ...body.data, id: 'editing-draft-e2e' } },
        });
      },
    );
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
    await page.route(
      editing ? `**/v1/images/${sourceId}/edit` : '**/v1/images',
      async (route) => {
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
      },
    );
    await page.goto(
      brandPath(
        editing
          ? `${APP_ROUTES.STUDIO.GENERATE}?editImage=${sourceId}`
          : APP_ROUTES.STUDIO.GENERATE,
      ),
      { waitUntil: 'domcontentloaded' },
    );
    const composer = page
      .getByTestId('studio-generate-prompt')
      .getByRole('textbox');
    if (!editing) {
      // Trigger name is `Generation setup: {summary}`; models are Configure Model.
      await page.getByRole('button', { name: /^Generation setup:/ }).click();
      await page
        .getByRole('button', { name: 'Configure Model', exact: true })
        .click();
      await page
        .getByRole('option')
        .filter({ hasText: 'FLUX.3' })
        .first()
        .click();
      await page.keyboard.press('Escape');
    }
    if (flux) {
      await expect(page.getByLabel('FLUX resolution')).toBeVisible();
      await expect(page.getByLabel('Editing seed')).toHaveCount(0);
      await expect(page.getByLabel('Editing output size')).toHaveCount(0);
      await page.getByLabel('FLUX resolution').click();
      await page.getByRole('option', { name: '1.5K', exact: true }).click();
      await page.getByLabel('FLUX aspect ratio').click();
      await page
        .getByRole('option', {
          name: editing ? 'Match source aspect ratio' : 'Auto aspect ratio',
          exact: true,
        })
        .click();
    } else await expect(page.getByLabel('Editing seed')).toBeVisible();
    await expect(composer).toBeEmpty();
    await composer.fill('Change only the sign to OPEN');
    if (!flux) await page.getByLabel('Editing seed').fill('0');
    await page.screenshot({
      path: testInfo.outputPath(
        flux ? 'flux-3-image-editing-studio.png' : 'image-editing-studio.png',
      ),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toMatchObject({
      data: {
        attributes: {
          ...(editing
            ? { prompt: 'Change only the sign to OPEN' }
            : { text: 'Change only the sign to OPEN', model }),
          outputs: 1,
          ...(flux
            ? { resolution: '1.5k', aspectRatio: 'auto' }
            : { size: 'source', seed: 0 }),
        },
      },
    });
    expect(JSON.stringify(bodies[0])).not.toContain('prompt_template');
    if (editing)
      expect(JSON.stringify(bodies[0])).not.toContain('brandingMode');
    await expect(page.getByTestId('studio-generate-results')).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('studio-generate-results')).toBeVisible();
    await expect(
      page
        .getByRole('article', {
          name: editing ? 'Edit image generation' : 'Image generation',
        })
        .first(),
    ).toContainText('Change only the sign to OPEN');
    if (flux && editing) {
      await expect(page.getByLabel('Editing seed')).toHaveCount(0);
      expect(JSON.stringify(bodies[0])).not.toContain('maskId');
      expect(JSON.stringify(bodies[0])).not.toContain('seed');
      await page
        .getByRole('article', { name: 'Edit image generation' })
        .first()
        .click();
      await page.getByRole('button', { name: 'Vary', exact: true }).click();
      await expect(composer).toHaveText('Change only the sign to OPEN');
      await expect(page.getByLabel('FLUX resolution')).toContainText('1.5K');
      await expect(page.getByLabel('FLUX aspect ratio')).toContainText(
        'Match source aspect ratio',
      );
    } else if (!flux)
      await expect(page.getByLabel('Editing seed')).toHaveValue('');
    await expectNoErrorOverlay(page);
  });
}
