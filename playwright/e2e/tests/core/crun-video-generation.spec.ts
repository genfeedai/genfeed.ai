import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { ISetting } from '@genfeedai/contracts/interfaces';
import type { CrunVideoQuoteRequest } from '@genfeedai/contracts/interfaces/billing/crun-generation-quote.interface';
import type { CrunInputControls } from '@genfeedai/contracts/interfaces/content/crun-contract.interface';
import type { Page } from '@playwright/test';
import { createPlaywrightMockApiRoutePattern } from '../../config/environment';
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

const klingKey = 'crun/kling/v2-5-turbo-pro';
const veoKey = 'crun/google/veo3-1-fast-t2v';
const mp4 = readFileSync(
  path.resolve('playwright/e2e/fixtures/media/studio-clip.mp4'),
);
function controlsFor(endpoint = 'kling/v2-5-turbo-pro'): CrunInputControls {
  const kling = endpoint === 'kling/v2-5-turbo-pro';
  return {
    endpoint,
    version: 'reviewed-video-v1',
    mediaKind: 'video',
    maxOutputs: 4,
    isBatchSupported: false,
    isAutoAspectReferenceRequired: false,
    referenceRoles: kling ? { img_urls: 'image' } : {},
    videoRules: {
      referenceMode: kling ? 'start-end' : 'none',
      omitAspectRatioWithReferences: kling,
      availableDurations: kling ? [5, 10] : [8],
    },
    fields: {
      prompt: {
        type: 'string',
        isRequired: true,
        minLength: 1,
        maxLength: kling ? 2500 : 5000,
      },
      duration: {
        type: 'integer',
        isRequired: false,
        enum: kling ? [5, 10] : [4, 6, 8],
        default: kling ? 5 : 8,
      },
      aspect_ratio: {
        type: 'string',
        isRequired: false,
        enum: kling ? ['1:1', '16:9', '9:16'] : ['16:9', '9:16'],
        default: '16:9',
      },
      ...(kling
        ? {
            negative_prompt: {
              type: 'string' as const,
              isRequired: false,
              maxLength: 2000,
            },
            cfg_scale: {
              type: 'number' as const,
              isRequired: false,
              minimum: 0,
              maximum: 1,
              default: 0.5,
            },
            img_urls: {
              type: 'array' as const,
              isRequired: false,
              format: 'uri' as const,
              minItems: 1,
              maxItems: 2,
            },
          }
        : {
            resolution: {
              type: 'string' as const,
              isRequired: false,
              enum: ['720p', '1080p', '4k'],
              default: '720p',
            },
            translate_prompt: {
              type: 'boolean' as const,
              isRequired: false,
              default: true,
            },
          }),
    },
  };
}

function controls(key: string) {
  return controlsFor(key.replace('crun/', ''));
}
async function installFixture(
  page: Page,
  key: string,
  mode: 'available' | 'disabled' | 'stale' | 'expired' = 'available',
  frames = false,
) {
  const previews: CrunVideoQuoteRequest[] = [];
  const consumes: Record<string, unknown>[] = [];
  let completed = false;
  let savedDraft: Record<string, unknown> = {
    attachments: [],
    references: frames
      ? [
          { id: 'start-frame', role: 'startFrame' },
          { id: 'end-frame', role: 'endFrame' },
        ]
      : [],
    knowledgeSelection: {},
    prompt: '',
    type: 'video',
    settingsByType: {
      video: {
        modelKey: key,
        outputs: 1,
        aspectRatio: controls(key).fields.aspect_ratio.default,
        duration: controls(key).fields.duration.default,
        resolution: controls(key).fields.resolution?.default ?? '',
        blacklist: [],
        brandingMode: 'off',
        isAudioEnabled: false,
        tags: [],
        crunControls: {
          modelKey: key,
          contractVersion: controls(key).version,
          ...(key === klingKey
            ? { guidanceScale: 0.5 }
            : { translatePrompt: true }),
        },
      },
    },
  };
  const ownedId = key === klingKey ? 'crun-owned-kling' : 'crun-owned-veo';
  const ownedUrl = `https://cdn.genfeed.ai/mock/${ownedId}.mp4`;
  function ownedVideo() {
    return {
      id: ownedId,
      type: 'ingredients',
      attributes: {
        category: 'VIDEO',
        status: 'GENERATED',
        scope: 'USER',
        cdnUrl: ownedUrl,
        width: 320,
        height: 180,
        createdAt: '2026-10-01T12:00:00.000Z',
        prompt: {
          id: `${ownedId}-prompt`,
          original: 'A ceramic bird on a desk',
        },
        metadata: {
          id: `${ownedId}-metadata`,
          label: 'Owned Crun video',
          model: key,
          width: 320,
          height: 180,
          size: mp4.length,
          extension: 'mp4',
          duration: 1,
          fps: 30,
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
            [klingKey, veoKey].map((modelKey) => ({
              id: modelKey === klingKey ? 'kling-model' : 'veo-model',
              key: modelKey,
              label:
                modelKey === klingKey ? 'Kling 2.5 Turbo Pro' : 'Veo 3.1 Fast',
              provider: 'crun',
              category: 'video',
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
          currentUser: {
            ...bootstrap.currentUser,
            settings: {
              ...(bootstrap.currentUser.settings as ISetting),
              isAdvancedMode: true,
            },
          },
          settings: {
            ...bootstrap.settings,
            enabledModelIds: [klingKey, veoKey],
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
        completed && url.searchParams.getAll('categories').includes('VIDEO')
          ? [ownedVideo()]
          : [];
      await route.fulfill({
        json: {
          data,
          meta: { page: 1, pageSize: 24, totalCount: data.length },
        },
      });
    },
  );
  await page.route(ownedUrl, async (route) => {
    const range = route.request().headers().range;
    const match = range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2]
      ? Math.min(Number(match[2]), mp4.length - 1)
      : mp4.length - 1;
    await route.fulfill({
      status: match ? 206 : 200,
      contentType: 'video/mp4',
      headers: {
        'accept-ranges': 'bytes',
        ...(match
          ? { 'content-range': `bytes ${start}-${end}/${mp4.length}` }
          : {}),
      },
      body: mp4.subarray(start, end + 1),
    });
  });
  await page.route(
    createPlaywrightMockApiRoutePattern('videos(?:/.*|\\?.*)?$'),
    async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (
        pathname.endsWith('/videos/crun-quote') &&
        request.method() === 'POST'
      ) {
        const intent: CrunVideoQuoteRequest = request.postDataJSON();
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
                    expiresAt: new Date(
                      Date.now() + (mode === 'expired' ? -1000 : 60000),
                    ).toISOString(),
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
      if (pathname.endsWith('/videos') && request.method() === 'POST') {
        consumes.push(request.postDataJSON().data.attributes);
        if (mode === 'stale') {
          await route.fulfill({
            status: 409,
            json: {
              errors: [
                {
                  status: '409',
                  code: 'CRUN_QUOTE_STALE',
                  detail: 'The video quote expired.',
                },
              ],
            },
          });
        } else {
          completed = true;
          await route.fulfill({
            json: {
              data: {
                ...ownedVideo(),
                type: 'videos',
                attributes: {
                  ...ownedVideo().attributes,
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
        json: { data: { ...ownedVideo(), type: 'videos' } },
      });
    },
  );
  await page.route(
    createPlaywrightMockApiRoutePattern('ingredients/batch(?:\\?.*)?$'),
    async (route) =>
      route.fulfill({
        json: {
          data: ['start-frame', 'end-frame'].map((id) => ({
            id,
            type: 'ingredients',
            attributes: {
              category: 'IMAGE',
              status: 'GENERATED',
              scope: 'USER',
              cdnUrl: `https://cdn.genfeed.ai/mock/${id}.png`,
              createdAt: '2026-10-01T12:00:00.000Z',
              metadata: {
                id: `${id}-metadata`,
                width: 320,
                height: 180,
                extension: 'png',
                label: id,
              },
            },
          })),
        },
      }),
  );
  await page.route(
    /https:\/\/cdn\.genfeed\.ai\/mock\/(start-frame|end-frame)\.png$/,
    (route) =>
      route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=',
          'base64',
        ),
      }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND));
  const composer = page.getByTestId('studio-playground-composer-shell');
  const editor = page
    .getByTestId('studio-playground-prompt')
    .getByRole('textbox');
  await expect(editor).toBeVisible();
  await editor.fill('A ceramic bird on a desk');
  return { previews, consumes, ownedId, ownedUrl, composer, editor };
}
async function openGenerationSetup(page: Page, summary: string) {
  const setup = page.getByRole('button', { name: /^Generation setup:/ });
  await expect(setup).toHaveAccessibleName(`Generation setup: ${summary}`);
  await setup.click();
}
async function openConfiguration(page: Page, section: string) {
  await page
    .getByRole('button', { name: `Configure ${section}`, exact: true })
    .click();
}
async function expectSubmitTooltip(page: Page, statusName: string) {
  const generate = page
    .getByTestId('studio-playground-composer-shell')
    .getByRole('button', { name: 'Generate', exact: true });
  await expect(
    page
      .getByTestId('studio-playground-composer-shell')
      .getByText(statusName, { exact: true }),
  ).toHaveCount(0);
  await generate.focus();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(
    tooltip.getByRole('status', { name: statusName, exact: true }),
  ).toBeVisible();
  const descriptionId = await tooltip.getAttribute('id');
  expect(descriptionId).toBeTruthy();
  await expect(generate).toHaveAttribute(
    'aria-describedby',
    descriptionId ?? '',
  );
  await generate.press('Escape');
  await expect(tooltip).toHaveCount(0);
}
async function selectValue(page: Page, label: string, value: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: value, exact: true }).click();
}

async function expectPlayableOwnedVideo(
  page: Page,
  ownedId: string,
  ownedUrl: string,
) {
  await page.reload();
  const card = page.getByTestId(`studio-asset-${ownedId}`);
  await expect(card).toBeVisible();
  await card.click();
  const video = page
    .getByTestId('studio-playground-inspector')
    .locator('video');
  await expect(video).toHaveAttribute('src', ownedUrl);
  await expect
    .poll(() =>
      video.evaluate(
        (element) =>
          element instanceof HTMLVideoElement &&
          element.readyState >= HTMLMediaElement.HAVE_METADATA &&
          Number.isFinite(element.duration) &&
          element.duration > 0 &&
          element.currentSrc,
      ),
    )
    .toBe(ownedUrl);
  await video.evaluate(async (element) => {
    if (!(element instanceof HTMLVideoElement))
      throw new Error('Expected video');
    element.muted = true;
    await element.play();
  });
  await expect
    .poll(() =>
      video.evaluate(
        (element) =>
          element instanceof HTMLVideoElement && element.currentTime > 0,
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(card).toBeVisible();
  await card.click();
  await expect(video).toHaveAttribute('src', ownedUrl);
}
for (const key of [klingKey, veoKey]) {
  test(`${key} quotes exact controls and reopens playable owned MP4 without another consume`, async ({
    authenticatedPage: page,
  }) => {
    const fixture = await installFixture(page, key);
    await expect(
      fixture.composer.getByRole('combobox', { name: 'Duration', exact: true }),
    ).toHaveCount(1);
    if (key === klingKey) {
      await selectValue(page, 'Duration', '10s');
      await fixture.composer
        .getByRole('textbox', { name: 'Negative prompt', exact: true })
        .fill(' blur ');
      await fixture.composer
        .getByRole('spinbutton', { name: 'Guidance', exact: true })
        .fill('0');
    } else {
      await fixture.composer
        .getByRole('combobox', { name: 'Duration', exact: true })
        .click();
      await expect(page.getByRole('option', { name: /4s/ })).toBeDisabled();
      await expect(page.getByRole('option', { name: /6s/ })).toBeDisabled();
      await page.keyboard.press('Escape');
      await selectValue(page, 'Resolution', '4k');
      await fixture.composer
        .getByRole('checkbox', { name: 'Translate prompt', exact: true })
        .uncheck();
      await expect(
        fixture.composer.getByRole('button', {
          name: 'Start frame',
          exact: true,
        }),
      ).toHaveCount(0);
    }
    await selectValue(page, 'Aspect ratio', '9:16');
    await expectSubmitTooltip(page, '3 credits');
    const generate = fixture.composer.getByRole('button', {
      name: 'Generate',
      exact: true,
    });
    await expect(generate).toBeEnabled();
    await generate.dblclick();
    await expect.poll(() => fixture.consumes.length).toBe(1);
    const quote = fixture.previews.at(-1);
    expect(quote?.crunControls).toEqual({
      contractVersion: controls(key).version,
      duration: key === klingKey ? 10 : 8,
      aspectRatio: '9:16',
      ...(key === klingKey
        ? { negativePrompt: 'blur', guidanceScale: 0 }
        : { resolution: '4k', translatePrompt: false }),
    });
    expect(fixture.consumes[0]).toEqual({
      ...quote,
      crunQuoteId: `quote-${fixture.previews.length}`,
    });
    for (const field of [
      'width',
      'height',
      'speech',
      'sounds',
      'tags',
      'isAudioEnabled',
    ])
      expect(fixture.consumes[0]).not.toHaveProperty(field);
    await expectPlayableOwnedVideo(page, fixture.ownedId, fixture.ownedUrl);
    expect(fixture.consumes).toHaveLength(1);
    await expectNoErrorOverlay(page);
    await assertNoErrorBoundaryFallback(page, page.url());
  });
}

test('Kling binds ordered authorized frames and clears them on Veo switch before a new quote', async ({
  authenticatedPage: page,
}) => {
  const fixture = await installFixture(page, klingKey, 'available', true);
  await expect
    .poll(() => {
      const latest = fixture.previews.at(-1);
      return {
        model: latest?.model,
        references: latest?.references,
        endFrame: latest?.endFrame,
      };
    })
    .toEqual({
      model: klingKey,
      references: ['start-frame'],
      endFrame: 'end-frame',
    });
  expect(fixture.previews.at(-1)?.crunControls).not.toHaveProperty(
    'aspectRatio',
  );
  await expect(
    fixture.composer.getByText('Aspect ratio comes from the frames', {
      exact: true,
    }),
  ).toBeVisible();
  await openGenerationSetup(page, 'Kling 2.5 Turbo Pro');
  await openConfiguration(page, 'Model');
  await page.getByRole('option', { name: /Veo 3.1 Fast/ }).click();
  await page.keyboard.press('Escape');
  await expect
    .poll(() => {
      const latest = fixture.previews.at(-1);
      return {
        model: latest?.model,
        references: latest?.references,
        endFrame: latest?.endFrame,
        crunControls: latest?.crunControls,
      };
    })
    .toEqual({
      model: veoKey,
      references: [],
      endFrame: undefined,
      crunControls: {
        contractVersion: controls(veoKey).version,
        duration: 8,
        aspectRatio: '16:9',
        resolution: '720p',
        translatePrompt: true,
      },
    });
  expect(fixture.consumes).toHaveLength(0);
});

for (const mode of ['disabled', 'expired'] as const) {
  test(`${mode} video quote preserves prompt and performs no consume`, async ({
    authenticatedPage: page,
  }) => {
    const fixture = await installFixture(page, veoKey, mode);
    await expect.poll(() => fixture.previews.length).toBeGreaterThan(0);
    await expect(
      fixture.composer.getByRole('button', { name: 'Generate', exact: true }),
    ).toBeDisabled();
    await expect(fixture.editor).toHaveText('A ceramic bird on a desk');
    expect(fixture.consumes).toHaveLength(0);
  });
}
test('expired video admission reports the error and never retries automatically', async ({
  authenticatedPage: page,
}) => {
  const fixture = await installFixture(page, klingKey, 'stale');
  const generate = fixture.composer.getByRole('button', {
    name: 'Generate',
    exact: true,
  });
  await expect(generate).toBeEnabled();
  const rejection = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/videos') &&
      response.request().method() === 'POST' &&
      response.status() === 409,
  );
  await generate.click();
  await rejection;
  const errorToast = page
    .locator('[data-sonner-toast][data-type="error"]')
    .filter({
      has: page.getByText('The image provider could not be reached.', {
        exact: true,
      }),
    });
  await expect(errorToast).toHaveCount(1);
  await expect(errorToast).toBeVisible();
  await expect(page.getByTestId(/^studio-asset-failed-/)).toBeVisible();
  const errorDialog = page.getByRole('dialog', {
    name: 'Request failed',
    exact: true,
  });
  await expect(errorDialog).toBeVisible();
  await errorDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(fixture.editor).toHaveText('A ceramic bird on a desk');
  await expect(
    page
      .getByTestId('studio-playground-results')
      .getByTestId('studio-asset-crun-owned-kling'),
  ).toHaveCount(0);
  expect(fixture.consumes).toHaveLength(1);
});
