import { createRequire } from 'node:module';
import path from 'node:path';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { CrunImageQuoteRequest } from '@genfeedai/contracts/interfaces/billing/crun-generation-quote.interface';
import type { CrunInputControls } from '@genfeedai/contracts/interfaces/content/crun-contract.interface';
import type { Page } from '@playwright/test';
import {
  createPlaywrightMockApiRoutePattern,
  playwrightApiEndpoint,
} from '../../config/environment';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { buildProtectedAppBootstrapPayload } from '../../utils/api-interceptor';
import { brandPath } from '../../utils/app-chrome';
import {
  assertNoErrorBoundaryFallback,
  expectNoErrorOverlay,
} from '../../utils/route-assertions';

const { ModelSerializer } = createRequire(
  path.resolve('packages/services/package.json'),
)('@genfeedai/serializers') as typeof import('@genfeedai/serializers');

const nanoKey = 'crun/google/nano-banana-pro';
const seedreamKey = 'crun/bytedance/seedream-4-5';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=',
  'base64',
);

function controls(key: string): CrunInputControls {
  const nano = key === nanoKey;
  return {
    version: nano ? 'nano-reviewed-browser-v1' : 'seedream-reviewed-browser-v1',
    endpoint: key.replace('crun/', ''),
    mediaKind: 'image',
    maxOutputs: 4,
    isBatchSupported: false,
    isAutoAspectReferenceRequired: nano,
    referenceRoles: { img_urls: 'image' },
    fields: {
      prompt: {
        type: 'string',
        isRequired: true,
        minLength: 1,
        maxLength: nano ? 20000 : 5000,
      },
      img_urls: { type: 'array', isRequired: false, maxItems: nano ? 8 : 14 },
      resolution: {
        type: 'string',
        isRequired: false,
        enum: nano ? ['1K', '2K', '4K'] : ['2K', '4K'],
        default: nano ? '1K' : '2K',
      },
      aspect_ratio: {
        type: 'string',
        isRequired: false,
        enum: nano
          ? [
              '1:1',
              '2:3',
              '3:2',
              '3:4',
              '4:3',
              '4:5',
              '5:4',
              '9:16',
              '16:9',
              '21:9',
              'auto',
            ]
          : ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'],
        default: nano ? '1:1' : '16:9',
      },
      ...(nano
        ? {
            output_format: {
              type: 'string' as const,
              isRequired: false,
              enum: ['png', 'jpg'],
              default: 'png',
            },
          }
        : {}),
    },
  };
}

async function installFixture(
  page: Page,
  key: string,
  mode: 'available' | 'disabled' | 'stale' = 'available',
) {
  const previews: CrunImageQuoteRequest[] = [];
  const consumes: Record<string, unknown>[] = [];
  let completed = false;
  let savedDraft: Record<string, unknown> = {
    attachments: [],
    references: [],
    knowledgeSelection: {},
    prompt: '',
    type: 'image',
    settingsByType: {
      image: {
        modelKey: key,
        outputs: 1,
        aspectRatio: controls(key).fields.aspect_ratio.default,
        resolution: controls(key).fields.resolution.default,
        blacklist: [],
        brandingMode: 'off',
        isAudioEnabled: false,
        tags: [],
        crunControls: {
          modelKey: key,
          contractVersion: controls(key).version,
          ...(key === nanoKey ? { outputFormat: 'png' } : {}),
        },
      },
    },
  };
  const ownedId = key === nanoKey ? 'crun-owned-nano' : 'crun-owned-seedream';
  const ownedUrl = `https://cdn.genfeed.ai/mock/${ownedId}.png`;
  function ownedImage() {
    return {
      id: ownedId,
      type: 'ingredients',
      attributes: {
        category: 'IMAGE',
        status: 'GENERATED',
        scope: 'USER',
        cdnUrl: ownedUrl,
        width: 1024,
        height: 1024,
        createdAt: '2026-10-01T12:00:00.000Z',
        prompt: {
          id: `${ownedId}-prompt`,
          original: 'A ceramic bird on a desk',
        },
        metadata: {
          id: `${ownedId}-metadata`,
          label: 'Owned Crun image',
          model: key,
          width: 1024,
          height: 1024,
          size: png.length,
          extension: 'png',
        },
      },
    };
  }
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await page.route(
    createPlaywrightMockApiRoutePattern('models(?:\\?.*)?$'),
    async (route) =>
      route.fulfill({
        json: {
          ...ModelSerializer.serialize(
            [nanoKey, seedreamKey].map((modelKey) => ({
              id: modelKey === nanoKey ? 'nano-model' : 'seedream-model',
              key: modelKey,
              label: modelKey === nanoKey ? 'Nano Banana Pro' : 'Seedream 4.5',
              provider: 'crun',
              category: 'image',
              cost: 999,
              pricingType: 'flat',
              lifecycle: 'AVAILABLE',
              isActive: true,
              isDeleted: false,
              inputControls: controls(modelKey),
            })),
          ),
          meta: { totalCount: 2 },
          links: { pagination: { page: 1, pages: 1, total: 2 } },
        },
      }),
  );
  await page.route(
    createPlaywrightMockApiRoutePattern('auth/bootstrap(?:\\?.*)?$'),
    async (route) => {
      const bootstrap = buildProtectedAppBootstrapPayload();
      await route.fulfill({
        json: {
          ...bootstrap,
          settings: {
            ...bootstrap.settings,
            enabledModelIds: [nanoKey, seedreamKey],
          },
        },
      });
    },
  );
  await page.route(
    createPlaywrightMockApiRoutePattern(
      'studio-generate-drafts/current(?:\\?.*)?$',
    ),
    async (route) => {
      if (route.request().method() === 'PUT')
        savedDraft = route.request().postDataJSON();
      await route.fulfill({
        json: {
          data: {
            id: 'crun-browser-draft',
            type: 'studio-generate-draft',
            attributes: { ...savedDraft, droppedReferenceIds: [] },
          },
        },
      });
    },
  );
  await page.route(
    createPlaywrightMockApiRoutePattern('ingredients(?:/.*|\\?.*)?$'),
    async (route) => {
      const url = new URL(route.request().url());
      const data =
        completed && url.searchParams.getAll('categories').includes('IMAGE')
          ? [ownedImage()]
          : [];
      await route.fulfill({
        json: {
          data,
          meta: { page: 1, pageSize: 24, totalCount: data.length },
        },
      });
    },
  );
  await page.route(ownedUrl, (route) =>
    route.fulfill({ contentType: 'image/png', body: png }),
  );
  await page.route(
    createPlaywrightMockApiRoutePattern('images(?:/.*|\\?.*)?$'),
    async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (
        pathname.endsWith('/images/crun-quote') &&
        request.method() === 'POST'
      ) {
        const intent: CrunImageQuoteRequest = request.postDataJSON();
        previews.push(intent);
        const available = mode !== 'disabled';
        await route.fulfill({
          json: {
            data: {
              id: 'public-response-id',
              type: 'crun-generation-quote',
              attributes: available
                ? {
                    isAvailable: true,
                    quoteId: `quote-${previews.length}`,
                    expiresAt: new Date(Date.now() + 60000).toISOString(),
                    modelKey: intent.model,
                    contractVersion: intent.crunControls.contractVersion,
                    credits: intent.outputs === 4 ? 11 : 3,
                    billingMode: 'credits',
                    reasonCode: null,
                  }
                : {
                    isAvailable: false,
                    quoteId: null,
                    expiresAt: null,
                    modelKey: intent.model,
                    contractVersion: null,
                    credits: null,
                    billingMode: null,
                    reasonCode: 'CRUN_DISABLED',
                  },
            },
          },
        });
        return;
      }
      if (pathname.endsWith('/images') && request.method() === 'POST') {
        consumes.push(request.postDataJSON().data.attributes);
        if (mode === 'stale') {
          await route.fulfill({
            status: 409,
            json: {
              errors: [
                {
                  status: '409',
                  code: 'CRUN_QUOTE_STALE',
                  detail: 'The image quote expired.',
                },
              ],
            },
          });
        } else {
          completed = true;
          await route.fulfill({
            json: {
              data: {
                ...ownedImage(),
                type: 'images',
                attributes: {
                  ...ownedImage().attributes,
                  status: 'PROCESSING',
                  cdnUrl: null,
                },
              },
            },
          });
        }
        return;
      }
      await route.fulfill({
        json: { data: { ...ownedImage(), type: 'images' } },
      });
    },
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(brandPath(APP_ROUTES.STUDIO.GENERATE));
  const composer = page.getByTestId('studio-generate-composer-shell');
  const editor = page
    .getByTestId('studio-generate-prompt')
    .getByRole('textbox');
  await expect(editor).toBeVisible();
  await editor.fill('A ceramic bird on a desk');
  return { previews, consumes, ownedId, ownedUrl, composer, editor };
}

async function openSettings(page: Page, section: string) {
  await page
    .getByRole('button', { name: 'Generation setup', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Customize setup', exact: true })
    .click();
  await page.getByRole('tab', { name: section, exact: true }).click();
}
async function selectValue(page: Page, label: string, value: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: value, exact: true }).click();
}

test.beforeEach(() => {
  const pattern = createPlaywrightMockApiRoutePattern('models(?:\\?.*)?$');
  expect(pattern.test(`${playwrightApiEndpoint}/models?isActive=true`)).toBe(
    true,
  );
  expect(pattern.test('https://api.genfeed.ai/v1/models?isActive=true')).toBe(
    true,
  );
  expect(
    pattern.test('https://api.genfeed.ai.attacker.invalid/v1/models'),
  ).toBe(false);
  expect(
    pattern.test(
      'https://attacker.invalid/?url=https://api.genfeed.ai/v1/models',
    ),
  ).toBe(false);
  expect(pattern.test('https://api.genfeed.ai/v1/images')).toBe(false);
});

for (const key of [nanoKey, seedreamKey]) {
  test(`${key} quotes reviewed controls, completes and reopens owned media`, async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120000);
    const fixture = await installFixture(page, key);
    await openSettings(page, 'Model');
    await page
      .getByRole('option', {
        name: new RegExp(key === nanoKey ? 'Seedream 4.5' : 'Nano Banana Pro'),
      })
      .click();
    await page
      .getByRole('option', {
        name: new RegExp(key === nanoKey ? 'Nano Banana Pro' : 'Seedream 4.5'),
      })
      .click();
    await page.getByRole('tab', { name: 'Look', exact: true }).click();
    await selectValue(page, 'Resolution', '4K');
    await page.getByRole('tab', { name: 'Output', exact: true }).click();
    await selectValue(page, 'Aspect ratio', '21:9');
    await page
      .getByRole('combobox', { name: 'Aspect ratio', exact: true })
      .click();
    await expect(
      page.getByRole('option', { name: 'auto', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(
      fixture.composer.getByText('3 credits', { exact: true }),
    ).toBeVisible();
    const generate = fixture.composer.getByRole('button', {
      name: 'Generate',
      exact: true,
    });
    await expect(generate).toBeEnabled();
    await generate.click();
    await expect.poll(() => fixture.consumes.length).toBe(1);
    const quote = fixture.previews.at(-1);
    expect(quote?.crunControls).toEqual({
      contractVersion: controls(key).version,
      aspectRatio: '21:9',
      resolution: '4K',
      ...(key === nanoKey ? { outputFormat: 'png' } : {}),
    });
    expect(fixture.consumes[0]).toEqual({
      ...quote,
      crunQuoteId: `quote-${fixture.previews.length}`,
    });
    expect(fixture.consumes[0]).not.toHaveProperty('cost');
    await page.reload();
    const card = page.getByTestId(`studio-asset-${fixture.ownedId}`);
    await expect(card).toBeVisible();
    await card.click();
    const image = page
      .getByTestId('studio-generate-inspector')
      .getByRole('img');
    await expect(image).toHaveAttribute('src', fixture.ownedUrl);
    await expect
      .poll(() =>
        image.evaluate(
          (element) =>
            element instanceof HTMLImageElement &&
            element.complete &&
            element.naturalWidth > 0,
        ),
      )
      .toBe(true);
    await page.reload();
    await expect(card).toBeVisible();
    await card.click();
    await expect(image).toHaveAttribute('src', fixture.ownedUrl);
    expect(fixture.consumes).toHaveLength(1);
    await expectNoErrorOverlay(page);
    await assertNoErrorBoundaryFallback(page, page.url());
  });
}

test('disabled Crun admission keeps the draft and makes zero consumes', async ({
  authenticatedPage: page,
}) => {
  const fixture = await installFixture(page, nanoKey, 'disabled');
  await expect(
    fixture.composer.getByText(
      'This image provider is unavailable on this server.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    fixture.composer.getByRole('button', { name: 'Generate', exact: true }),
  ).toBeDisabled();
  await expect(fixture.editor).toHaveText('A ceramic bird on a desk');
  expect(fixture.consumes).toHaveLength(0);
});

test('expired server quote preserves the prompt and never resubmits automatically', async ({
  authenticatedPage: page,
}) => {
  const fixture = await installFixture(page, seedreamKey, 'stale');
  const generate = fixture.composer.getByRole('button', {
    name: 'Generate',
    exact: true,
  });
  await expect(generate).toBeEnabled();
  const rejection = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/images') &&
      response.request().method() === 'POST' &&
      response.status() === 409,
  );
  await generate.click();
  await rejection;
  const errorToast = page
    .locator('[data-sonner-toast][data-type="error"]')
    .filter({
      has: page.getByText('The image provider could not be reached. failed', {
        exact: true,
      }),
    });
  await expect(errorToast).toHaveCount(1);
  await expect(errorToast).toBeVisible();
  await expect(page.getByTestId(/^studio-asset-failed-/)).toBeVisible();
  await expect.poll(() => fixture.consumes.length).toBe(1);
  await expect(fixture.editor).toHaveText('A ceramic bird on a desk');
  await expect(
    page
      .getByTestId('studio-generate-results')
      .getByTestId('studio-asset-crun-owned-seedream'),
  ).toHaveCount(0);
  expect(fixture.consumes).toHaveLength(1);
});
