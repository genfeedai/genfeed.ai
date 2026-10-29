import { brandPath, openAccountCredits } from '@e2e/utils/app-chrome';
import {
  APP_ROUTES,
  FLUX_3_EDIT_CONTRACT_VERSION,
  FLUX_3_IMAGE_CONTRACT_VERSION,
  IMAGE_EDIT_CONTRACT_VERSION,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import {
  STUDIO_SYSTEM_PRESETS,
  studioSystemPresetId,
} from '@genfeedai/contracts/constants/studio-system-presets.constant';
import type { Page, Request } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { buildProtectedAppBootstrapPayload } from '../../utils/api-interceptor';
import { mockGenerationQuote } from '../../utils/generation-setup';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

// #7674 / #7675 / #7676 / #7494: the money path of a Studio generation.
// Generate quotes the price first, so an unpriceable quote spends nothing; an
// Auto submit pins the quoted model, names it in a toast and moves the topbar
// wallet without a reload; edit mode opens on Ideogram 4.5 and offers the edit
// instructions behind `/`. Every paid write is mocked and recorded.

const imageModel = MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE;
const editModel = MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5;
const fluxEditModel = MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT;
const sourceId = 'spend-source-e2e';
const outputId = 'spend-output-e2e';
const startingBalance = 500;
const balanceAfterSpend = 436;

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=',
  'base64',
);

/** Any write to a generation or transform surface would spend credits. */
function isGenerationWrite(request: Request): boolean {
  if (request.method() === 'GET') return false;
  const { pathname } = new URL(request.url());
  return /\/v1\/(images|videos|audios|musics|avatars)(\/|$)/.test(pathname);
}

function image(id: string, prompt: Record<string, unknown> = { original: id }) {
  return {
    id,
    type: 'ingredients',
    attributes: {
      brandId: 'brand-1',
      organizationId: 'mock-org-id-e2e-test',
      category: 'IMAGE',
      scope: 'USER',
      status: 'GENERATED',
      cdnUrl: `https://cdn.genfeed.ai/mock/${id}.png`,
      width: 1024,
      height: 768,
      createdAt: '2026-10-10T00:00:00Z',
      prompt,
      generationHarness: {
        brandId: 'brand-1',
        originalPrompt: id,
        enhancedPrompt: id,
        status: 'skipped',
        source: 'request',
        appliedPacks: [],
      },
      metadata: { label: id, model: imageModel, width: 1024, height: 768 },
    },
  };
}

interface IModelRow {
  category: string;
  contractVersion: string;
  cost: number;
  key: string;
  label: string;
}

const IMAGE_MODELS: IModelRow[] = [
  {
    category: 'image',
    contractVersion: FLUX_3_IMAGE_CONTRACT_VERSION,
    cost: 8,
    key: imageModel,
    label: 'FLUX.3',
  },
];

const EDIT_MODELS: IModelRow[] = [
  {
    category: 'image-edit',
    contractVersion: IMAGE_EDIT_CONTRACT_VERSION,
    cost: 20,
    key: editModel,
    label: 'Ideogram 4.5',
  },
  {
    category: 'image-edit',
    contractVersion: FLUX_3_EDIT_CONTRACT_VERSION,
    cost: 8,
    key: fluxEditModel,
    label: 'FLUX.3 Edit',
  },
];

/**
 * Mounts the Studio playground on mocked APIs. The wallet answers with
 * `wallet.balance`, which a test (or the generation handler) can change to
 * stand in for credits moving on the server.
 */
async function mountPlayground(
  page: Page,
  {
    isAdvancedMode = false,
    models = IMAGE_MODELS,
    path = APP_ROUTES.STUDIO.PLAYGROUND,
    routedModelKey,
    sourcePrompt,
  }: {
    isAdvancedMode?: boolean;
    models?: IModelRow[];
    path?: string;
    routedModelKey?: string;
    /** The prompt row stored on the source image, such as its slots. */
    sourcePrompt?: Record<string, unknown>;
  } = {},
) {
  const wallet = { balance: startingBalance, requests: 0 };
  const generationWrites: string[] = [];
  const generationBodies: Record<string, unknown>[] = [];
  page.on('request', (request) => {
    if (isGenerationWrite(request))
      generationWrites.push(`${request.method()} ${request.url()}`);
  });
  await mockActiveSubscription(page, {
    credits: startingBalance,
    plan: 'pro',
  });
  // Last matching route wins: this replaces the static wallet above.
  await page.route('**/v1/credits/topbar-balances**', (route) => {
    wallet.requests++;
    return route.fulfill({
      json: {
        data: {
          id: 'topbar-balances',
          type: 'topbar-balances',
          attributes: {
            generatedAt: new Date().toISOString(),
            segments: [
              {
                balance: wallet.balance,
                currencyOrUnit: 'credits',
                label: 'Genfeed',
                lastSyncedAt: new Date().toISOString(),
                provider: 'genfeed',
                status: 'available',
              },
            ],
          },
        },
      },
    });
  });
  await mockGenerationQuote(page, { routedModelKey });
  await page.route('**/cdn.genfeed.ai/mock/*.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: pixel }),
  );
  await page.route('**/v1/auth/bootstrap**', (route) => {
    const bootstrap = buildProtectedAppBootstrapPayload();
    return route.fulfill({
      json: {
        ...bootstrap,
        currentUser: {
          ...bootstrap.currentUser,
          settings: {
            ...(typeof bootstrap.currentUser.settings === 'object' &&
            bootstrap.currentUser.settings !== null
              ? bootstrap.currentUser.settings
              : {}),
            isAdvancedMode,
          },
        },
        settings: {
          ...bootstrap.settings,
          enabledModelIds: models.map((model) => model.key),
        },
      },
    });
  });
  // Built-in presets only exist as live platform rows, which the reference
  // data sync seeds in a real stack.
  await page.route('**/v1/presets**', (route) =>
    route.fulfill({
      json: {
        data: STUDIO_SYSTEM_PRESETS.map((preset) => ({
          id: studioSystemPresetId(preset.key),
          type: 'presets',
          attributes: {
            brandId: null,
            category: preset.type,
            description: preset.description,
            isActive: true,
            isDeleted: false,
            label: preset.label,
            organizationId: null,
            prompt: preset.prompt,
          },
        })),
        meta: {
          page: 1,
          pageSize: 100,
          totalCount: STUDIO_SYSTEM_PRESETS.length,
        },
      },
    }),
  );
  await page.route('**/v1/models**', (route) =>
    route.fulfill({
      json: {
        data: models.map((model) => ({
          id: `spend-${model.key}`,
          type: 'models',
          attributes: {
            key: model.key,
            category: model.category,
            label: model.label,
            provider: 'replicate',
            isDefault: true,
            isActive: true,
            isDeleted: false,
            cost: model.cost,
            maxOutputs: 1,
            reviewedProviderContractVersion: model.contractVersion,
          },
        })),
        meta: { totalCount: models.length },
      },
    }),
  );
  let savedDraft: Record<string, unknown> | null = null;
  await page.route('**/v1/studio-generate-drafts/current**', async (route) => {
    if (route.request().method() !== 'GET')
      savedDraft = route.request().postDataJSON();
    await route.fulfill({
      json: {
        data: savedDraft
          ? {
              id: 'spend-draft-e2e',
              type: 'studio-generate-draft',
              attributes: { ...savedDraft, droppedReferenceIds: [] },
            }
          : null,
      },
    });
  });
  await page.route('**/v1/ingredients**', (route) => {
    const url = new URL(route.request().url());
    if (/\/(posts|children)$/.test(url.pathname))
      return route.fulfill({ json: { data: [] } });
    const id = url.pathname.split('/').at(-1);
    return route.fulfill({
      json:
        id && id !== 'ingredients' && id !== 'batch'
          ? { data: image(id, id === sourceId ? sourcePrompt : undefined) }
          : {
              data: [image(sourceId, sourcePrompt)],
              meta: { page: 1, pageSize: 100, totalCount: 1 },
            },
    });
  });
  // Saved-asset reads only; every paid write is recorded and answered here so
  // nothing reaches a provider.
  await page.route('**/v1/{images,videos,audios,musics,avatars}**', (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      const id = new URL(request.url()).pathname.split('/').at(-1) ?? '';
      return route.fulfill({
        json: {
          data: image(id, id === sourceId ? sourcePrompt : undefined),
        },
      });
    }
    generationBodies.push(request.postDataJSON());
    // The server reserves credits at admission, so the wallet has moved by the
    // time the client asks for it again.
    wallet.balance = balanceAfterSpend;
    return route.fulfill({
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
  await page.goto(brandPath(path), { waitUntil: 'domcontentloaded' });
  const editor = page
    .getByTestId('studio-playground-prompt')
    .getByRole('textbox');
  await expect(editor).toBeVisible();
  return { editor, generationBodies, generationWrites, wallet };
}

/** Opens the account menu and returns the wallet block it shows. */
async function openWallet(page: Page) {
  const wallet = await openAccountCredits(page);
  await expect(wallet).toBeVisible();
  return wallet;
}

test.describe('Studio generation spend', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  test('a price the server cannot confirm submits nothing', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(90_000);
    const { editor, generationWrites } = await mountPlayground(page);
    // Registered after the helper's quote so this answer is the one used.
    await page.route('**/v1/router/estimate-generation-credits', (route) =>
      route.fulfill({
        json: {
          isAvailable: false,
          unavailableReason: 'PRICING_UNRESOLVED',
        },
      }),
    );
    await editor.fill('A lighthouse at dusk');

    await page.getByRole('button', { name: 'Generate', exact: true }).click();

    await expect(
      page.getByText(/nothing was generated/i).first(),
    ).toBeVisible();
    expect(generationWrites).toEqual([]);
    await expect(editor).toHaveText('A lighthouse at dusk');
    await expectNoErrorOverlay(page);
  });

  test('Auto submits once, pinned to the quoted model, says which model and price, and the wallet follows', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(90_000);
    const { editor, generationBodies, generationWrites, wallet } =
      await mountPlayground(page, { routedModelKey: imageModel });
    const walletBlock = await openWallet(page);
    await expect(walletBlock).toContainText(
      new RegExp(`${startingBalance}\\s*GEN`),
    );
    await page.keyboard.press('Escape');
    const requestsBeforeSpend = wallet.requests;
    await editor.fill('A lighthouse at dusk');

    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(
      page.getByText('Auto chose FLUX.3. This generation costs 8 credits.'),
    ).toBeVisible();

    await expect.poll(() => generationBodies.length).toBe(1);
    expect(generationWrites).toHaveLength(1);
    expect(generationBodies[0]).toMatchObject({
      data: {
        attributes: {
          model: imageModel,
          text: 'A lighthouse at dusk',
        },
      },
    });
    // The quoted model is pinned, so the server must not route again.
    expect(JSON.stringify(generationBodies[0])).not.toContain(
      '"autoSelectModel":true',
    );
    // The open tab re-reads the wallet after the admission, with no reload.
    await expect
      .poll(() => wallet.requests)
      .toBeGreaterThan(requestsBeforeSpend);
    await expect(await openWallet(page)).toContainText(
      new RegExp(`${balanceAfterSpend}\\s*GEN`),
    );
    await expectNoErrorOverlay(page);
  });

  test('a pinned model quotes the retry credit-back beside the price', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(90_000);
    const previewBodies: Record<string, unknown>[] = [];
    // Registered before mountPlayground so the page never reaches a real server.
    await page.route('**/v1/credits/retry-credit-back/preview', (route) => {
      previewBodies.push(route.request().postDataJSON());
      return route.fulfill({ json: { credits: 2, rate: 0.25 } });
    });
    const { editor, generationWrites } = await mountPlayground(page, {
      isAdvancedMode: true,
      models: EDIT_MODELS,
      path: `${APP_ROUTES.STUDIO.PLAYGROUND}?editImage=${sourceId}`,
    });
    await editor.fill('Make the sky a deeper blue');

    await page.getByRole('button', { name: 'Generate', exact: true }).hover();
    await expect(page.getByTestId('studio-retry-credit-back')).toHaveText(
      'Retry: 25% back (~2 credits)',
    );
    // The quote asks about the priced amount for the pinned model.
    expect(previewBodies.at(-1)).toMatchObject({
      credits: 8,
      modelKey: editModel,
      prompt: 'Make the sky a deeper blue',
    });
    // Quoting a refund never spends anything.
    expect(generationWrites).toHaveLength(0);
    await expectNoErrorOverlay(page);
  });
});

test.describe('Studio edit mode', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  test('opens on Ideogram 4.5, not Auto', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(90_000);
    await mountPlayground(page, {
      isAdvancedMode: true,
      models: EDIT_MODELS,
      path: `${APP_ROUTES.STUDIO.PLAYGROUND}?editImage=${sourceId}`,
    });

    await expect(
      page.getByRole('group', { name: `Editing target: ${sourceId}` }),
    ).toBeVisible();
    await expect(
      page
        .getByTestId('generation-setup-section-chips')
        .getByRole('button', { name: 'Configure Model', exact: true }),
    ).toHaveAttribute('title', 'Model: Ideogram 4.5');
    await expectNoErrorOverlay(page);
  });

  test('offers the four edit instructions behind / and fills the prompt', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(90_000);
    const { editor, generationWrites } = await mountPlayground(page, {
      isAdvancedMode: true,
      models: EDIT_MODELS,
      path: `${APP_ROUTES.STUDIO.PLAYGROUND}?editImage=${sourceId}`,
    });
    const removeBackground = STUDIO_SYSTEM_PRESETS.find(
      (preset) => preset.key === 'studio-edit-remove-background',
    );
    expect(removeBackground).toBeDefined();

    await expect(
      page.getByRole('group', { name: `Editing target: ${sourceId}` }),
    ).toBeVisible();
    await editor.click();
    await page.keyboard.type('/');

    const menu = page.getByTestId('prompt-command-list');
    await expect(menu).toBeVisible();
    for (const command of [
      'remove-background',
      'enhance-photo',
      'retouch',
      'change-style',
    ])
      await expect(
        menu.getByRole('button', { name: new RegExp(`^/${command}\\b`) }),
      ).toBeVisible();
    // Generation templates do not belong in an edit.
    await expect(menu.getByRole('button', { name: /^\/banner/ })).toHaveCount(
      0,
    );

    await menu.getByRole('button', { name: /^\/remove-background\b/ }).click();

    await expect(editor).toHaveText(removeBackground?.prompt ?? '');
    expect(generationWrites).toEqual([]);
    await expectNoErrorOverlay(page);
  });

  test('Edit slots and run again sends the edited subject, not the stored one', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(90_000);
    const { generationBodies, generationWrites } = await mountPlayground(page, {
      isAdvancedMode: true,
      sourcePrompt: {
        original: 'A founder at a desk',
        renderTarget: 'prose',
        renderedPrompt: 'A founder at a desk in soft window light.',
        subject: 'a founder at a desk',
      },
    });

    await page.getByTestId(`studio-asset-${sourceId}`).click();
    await page
      .getByTestId('studio-inspector-prompt-slots')
      .getByRole('button', { name: 'Edit slots and run again' })
      .click();
    // Reopening submits nothing: the person edits the slots first.
    expect(generationWrites).toEqual([]);

    // The prompt row's subject is restored on the Look row, not only shown in
    // the inspector; editing it changes what the regenerate sends.
    await page
      .getByTestId('generation-setup-section-chips')
      .getByRole('button', { name: 'Configure Look', exact: true })
      .click();
    const subjectRow = page.getByRole('menuitem', { name: /^Subject/ });
    await expect(subjectRow).toContainText(/a founder at a desk/i);
    await subjectRow.click();
    await page
      .getByRole('textbox', { name: /subject/i })
      .fill('a barista behind a counter');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Generate', exact: true }).click();

    await expect.poll(() => generationBodies.length).toBe(1);
    expect(generationBodies[0]).toMatchObject({
      data: { attributes: { subject: 'a barista behind a counter' } },
    });
    await expectNoErrorOverlay(page);
  });
});
