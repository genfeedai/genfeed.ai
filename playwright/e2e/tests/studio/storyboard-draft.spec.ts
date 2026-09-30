import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  EditorProjectStatus,
  EditorTrackType,
  IngredientFormat,
} from '@genfeedai/contracts';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardRunCapabilities } from '@genfeedai/contracts/api-types/contracts/storyboard-run-capabilities.contract';
import type { IEditorProject } from '@genfeedai/contracts/interfaces';
import { expect, test } from '../../fixtures/auth.fixture';

// biome-ignore lint/suspicious/noUndeclaredEnvVars: this direct Playwright visual fixture input is outside Turbo caching.
const previewFixtureDirectory = process.env.STORYBOARD_PREVIEW_FIXTURE_DIR;
async function previewResponse(file: string) {
  if (file !== 'coffee-opening.jpg' && file !== 'coffee-close.jpg')
    throw new Error('Unknown fixture media.');
  if (previewFixtureDirectory)
    return {
      body: await readFile(path.join(previewFixtureDirectory, file)),
      contentType: 'image/jpeg',
    };
  // Small portable image for CI; the visual acceptance run supplies original photo fixtures.
  return {
    body: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9n8AAAAASUVORK5CYII=',
      'base64',
    ),
    contentType: 'image/png',
  };
}
const base = '/test-org/brand-1/studio/storyboard';
const time = '2026-09-30T00:00:00.000Z';
const run: StoryboardRun = {
  id: 'draft-coffee',
  brandId: 'brand-1',
  organizationId: 'org-1',
  createdAt: time,
  updatedAt: time,
  config: {
    contract: 'storyboard-run',
    version: 1,
    revision: 1,
    clientRequestId: 'f86c1871-d577-4dca-b79d-6d9f295a58cc',
    createdByUserId: 'user-1',
    submittedInputHash: 'a'.repeat(64),
    state: 'storyboard',
    sourceSnapshot: {
      selector: { kind: 'brief', brief: 'A quiet coffee ritual.' },
      capturedAt: time,
    },
    plan: {
      title: 'A quiet coffee ritual',
      logline: 'Morning light, warm coffee, a moment to pause.',
      videoModelKey: null,
      format: '9:16',
      runtimeBudgetSeconds: 10,
      styleLabel: 'Warm morning light',
      styleReferenceAssetIds: ['coffee-opening'],
      cast: [
        { id: 'narrator', name: 'Morning narrator', referenceAssetIds: [] },
      ],
      shots: [1, 2].map((ordinal) => ({
        id: `coffee-shot-${ordinal}`,
        ordinal,
        sectionLabel: ordinal === 1 ? 'Opening' : 'Pause',
        action:
          ordinal === 1
            ? 'Morning light falls across a cup of coffee.'
            : 'Hold on the coffee and pastry.',
        notes: 'Keep the framing calm.',
        onScreenSpeaker: false,
        durationSeconds: 5,
        transition: 'cut',
        stillFreshness: 'fresh',
        stillAssetId: ordinal === 1 ? 'coffee-opening' : 'coffee-close',
      })),
    },
  },
};
const model = {
  key: 'fixture-video',
  label: 'Fixture video model',
  provider: 'fixture',
  supportedDurationsSeconds: [5, 10],
  defaultDurationSeconds: null,
  hasInterpolation: true,
  supportedFormats: ['9:16' as const],
  capabilitySource: 'catalog' as const,
};

test('edits and approves a persisted draft through the actual route with loaded and unavailable stills', async ({
  authenticatedPage: page,
}, testInfo) => {
  test.setTimeout(180_000);
  let current = structuredClone(run);
  const writes: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(
    '**/brands/brand-1/storyboard-runs/draft-coffee**',
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/capabilities')) {
        const capabilities: StoryboardRunCapabilities = {
          version: 1,
          runId: current.id,
          runRevision: current.config.revision,
          capabilityVersion: 'b'.repeat(64),
          status: 'available',
          requestedModelKey: current.config.plan.videoModelKey,
          effectiveModel: model,
          eligibleModels: [model],
          reasonCode: null,
        };
        await route.fulfill({ json: capabilities });
        return;
      }
      if (route.request().method() !== 'GET') {
        const body = route.request().postDataJSON();
        expect(body.expectedRevision).toBe(current.config.revision);
        writes.push(path);
        if (path.endsWith('/plan'))
          current = {
            ...current,
            config: {
              ...current.config,
              revision: current.config.revision + 1,
              plan: body.plan,
            },
          };
        else if (path.endsWith('/plan/approve'))
          current = {
            ...current,
            config: {
              ...current.config,
              revision: current.config.revision + 1,
              approvedRevision: current.config.revision + 1,
              state: 'approved',
            },
          };
        else throw new Error(`Unexpected mutation: ${path}`);
      }
      const { id, ...attributes } = current;
      await route.fulfill({
        json: { data: { id, type: 'content-run', attributes } },
      });
    },
  );
  await page.route(
    /\/images\/coffee-(opening|close)(?:\?.*)?$/,
    async (route) => {
      const id = new URL(route.request().url()).pathname.split('/').at(-1);
      await route.fulfill({
        json: {
          data: {
            id,
            type: 'images',
            attributes: {
              brandId: 'brand-1',
              organizationId: 'org-1',
              category: 'IMAGE',
              isDeleted: false,
              cdnUrl: `https://cdn.genfeed.ai/fixture/${id}.jpg`,
              metadata: {
                label:
                  id === 'coffee-opening'
                    ? 'Morning coffee reference'
                    : 'Coffee and pastry',
                width: id === 'coffee-opening' ? 6016 : 4160,
                height: id === 'coffee-opening' ? 4016 : 6240,
              },
            },
          },
        },
      });
    },
  );
  await page.route('**/cdn.genfeed.ai/fixture/**', async (route) => {
    const file = new URL(route.request().url()).pathname.split('/').at(-1);
    await route.fulfill({
      ...(await previewResponse(file ?? '')),
    });
  });
  await page.route('**/_next/image**', async (route) => {
    const url = new URL(
      new URL(route.request().url()).searchParams.get('url') ??
        'https://cdn.genfeed.ai/fixture/coffee-opening.jpg',
    );
    if (!url.pathname.startsWith('/fixture/')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      ...(await previewResponse(url.pathname.split('/').at(-1) ?? '')),
    });
  });
  await page.goto(`${base}/${run.id}`);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    run.config.plan.title,
  );
  await expect(
    page.getByRole('button', { name: 'Approve storyboard', exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel('Speaker 1', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Remove Morning coffee reference',
      exact: true,
    }),
  ).toBeVisible();
  await page.locator('img').filter({ visible: true }).first().waitFor();
  async function captureMatrix(state: string) {
    for (const width of [1440, 768, 390]) {
      for (const theme of ['light', 'dark', 'system']) {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({
          colorScheme: theme === 'light' ? 'light' : 'dark',
          reducedMotion: 'reduce',
        });
        await page.evaluate((value) => {
          localStorage.setItem('theme', value);
          window.dispatchEvent(
            new StorageEvent('storage', { key: 'theme', newValue: value }),
          );
        }, theme);
        await page
          .context()
          .addCookies([
            { name: 'theme', value: theme, url: new URL(page.url()).origin },
          ]);
        await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
          current.config.plan.title,
        );
        await expect(page.locator('html')).toHaveAttribute(
          'data-theme',
          theme === 'light' ? 'light' : 'dark',
        );
        await expect
          .poll(() =>
            page
              .locator('main img')
              .evaluateAll(
                (images) =>
                  images.filter(
                    (image) =>
                      image instanceof HTMLImageElement &&
                      image.complete &&
                      image.naturalWidth > 0,
                  ).length,
              ),
          )
          .toBeGreaterThan(0);
        for (const shotNumber of state === 'unavailable' ? [1] : [1, 2]) {
          const still = page
            .getByRole('region', { name: `Shot ${shotNumber}`, exact: true })
            .locator('img')
            .first();
          await still.scrollIntoViewIfNeeded();
          await expect
            .poll(() =>
              still.evaluate(
                (image) =>
                  image instanceof HTMLImageElement &&
                  image.complete &&
                  image.naturalWidth > 0,
              ),
            )
            .toBe(true);
        }
        await page
          .getByLabel('Title', { exact: true })
          .scrollIntoViewIfNeeded();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        await page.addStyleTag({
          content: 'nextjs-portal { display: none !important; }',
        });
        await page.screenshot({
          path: testInfo.outputPath(`draft-${state}-${width}-${theme}.png`),
          fullPage: true,
        });
        for (const shotNumber of [1, 2]) {
          const shot = page.getByRole('region', {
            name: `Shot ${shotNumber}`,
            exact: true,
          });
          await shot.screenshot({
            path: testInfo.outputPath(
              `draft-${state}-shot-${shotNumber}-${width}-${theme}.png`,
            ),
          });
        }
      }
    }
  }
  await captureMatrix('before');
  await page.getByLabel('Title', { exact: true }).fill('Coffee, then pause');
  await expect.poll(() => current.config.plan.title).toBe('Coffee, then pause');
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Coffee, then pause',
  );
  await page
    .getByRole('button', { name: 'Approve storyboard', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Approved', exact: true }),
  ).toBeDisabled();
  await captureMatrix('loaded');
  await page.route(/\/images\/coffee-close(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 404,
      json: { errors: [{ status: '404', title: 'Unavailable fixture still' }] },
    }),
  );
  await page.reload();
  await expect(
    page
      .getByRole('region', { name: 'Shot 2', exact: true })
      .getByText('Still preview unavailable', { exact: true }),
  ).toBeVisible();
  await captureMatrix('unavailable');
  expect(
    writes.every(
      (path) => path.endsWith('/plan') || path.endsWith('/plan/approve'),
    ),
  ).toBe(true);
  // A separate persisted completion fixture verifies the published ready-run handoff;
  // this does not simulate or claim the pending paid execution adapter.
  current = {
    ...current,
    config: {
      ...current.config,
      state: 'ready',
      scenePipeline: {
        version: 1,
        language: 'en',
        state: 'ready',
        cancellationGeneration: 0,
        receipts: [],
        replacedAssetIds: [],
        scenes: Object.fromEntries(
          current.config.plan.shots.map((shot, index) => [
            shot.id,
            {
              identity: {
                avatarAssetId: 'fixture-avatar',
                speechVoiceId: 'fixture-voice',
              },
              referenceAssetIds: [],
              replacedAssetIds: [],
              image: { attempt: 1, state: 'ready', assetId: shot.stillAssetId },
              video: {
                attempt: 1,
                state: 'ready',
                assetId: `coffee-clip-${index + 1}`,
              },
            },
          ]),
        ),
        assembly: {
          assetId: 'coffee-assembled',
          orderedAssetIds: ['coffee-clip-1', 'coffee-clip-2'],
          transcription: { attempt: 1, state: 'ready' },
        },
      },
    },
  };
  const editorProject: Pick<
    IEditorProject,
    'name' | 'settings' | 'status' | 'tracks' | 'totalDurationFrames'
  > = {
    name: 'Coffee storyboard edit',
    settings: {
      backgroundColor: '#000000',
      format: IngredientFormat.PORTRAIT,
      fps: 30,
      width: 1080,
      height: 1920,
    },
    status: EditorProjectStatus.DRAFT,
    totalDurationFrames: 300,
    tracks: [
      {
        id: 'coffee-track',
        type: EditorTrackType.VIDEO,
        name: 'Storyboard shots',
        isMuted: false,
        isLocked: false,
        volume: 100,
        clips: ['coffee-clip-1', 'coffee-clip-2'].map((id, index) => ({
          id: `editor-shot-${index + 1}`,
          ingredientId: id,
          // This fixture proves timeline loading/timing, not generated video playback.
          ingredientUrl: '',
          startFrame: index * 150,
          durationFrames: 150,
          sourceStartFrame: 0,
          sourceEndFrame: 150,
          effects: [],
          volume: 100,
        })),
      },
    ],
  };
  let editorSources: string[] | undefined;
  let editorRead = false;
  await page.route('**/editor-projects**', async (route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() === 'POST' &&
      url.pathname.endsWith('/editor-projects')
    ) {
      editorSources = route.request().postDataJSON().sourceVideoIds;
    } else if (
      route.request().method() === 'GET' &&
      url.pathname.endsWith('/editor-projects/coffee-editor')
    ) {
      editorRead = true;
    } else {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        data: {
          id: 'coffee-editor',
          type: 'editor-project',
          attributes: {
            ...editorProject,
            isDeleted: false,
            isLocked: false,
            createdAt: time,
            updatedAt: time,
          },
        },
      },
    });
  });
  await page.reload();
  const editorLink = page.getByRole('link', {
    name: 'Open in Editor',
    exact: true,
  });
  await expect(editorLink).toBeVisible();
  const destination = await editorLink.getAttribute('href');
  expect(
    new URL(destination ?? '', 'http://localhost').searchParams.getAll('video'),
  ).toEqual(['coffee-clip-1', 'coffee-clip-2']);
  await editorLink.click();
  await expect
    .poll(() => editorSources)
    .toEqual(['coffee-clip-1', 'coffee-clip-2']);
  await expect.poll(() => editorRead).toBe(true);
  await expect(page).toHaveURL(/\/studio\/editor\/coffee-editor$/);
  const timelineClips = page.getByRole('button', {
    name: 'Timeline clip',
    exact: true,
  });
  await expect(timelineClips).toHaveCount(2);
  // The actual Editor renders both five-second clips back to back at its default
  // two-pixels-per-frame zoom; duration is supplied by the persisted server fixture.
  await expect(timelineClips.nth(0)).toHaveCSS('left', '0px');
  await expect(timelineClips.nth(0)).toHaveCSS('width', '300px');
  await expect(timelineClips.nth(1)).toHaveCSS('left', '300px');
  await expect(timelineClips.nth(1)).toHaveCSS('width', '300px');
  expect(pageErrors).toEqual([]);
});

test('creates an unpaid brief draft and saves added shots through the real routes', async ({
  authenticatedPage: page,
}) => {
  let created: StoryboardRun | undefined;
  const mutations: string[] = [];
  await page.route('**/brands/brand-1/storyboard-runs**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (method === 'POST' && pathname.endsWith('/storyboard-runs')) {
      const input = route.request().postDataJSON();
      mutations.push('create');
      expect(input.source).toEqual({
        kind: 'brief',
        brief: 'A new coffee story',
      });
      expect(input.planSettings.runtimeBudgetSeconds).toBe(10);
      created = {
        ...run,
        id: 'new-coffee',
        config: {
          ...run.config,
          clientRequestId: input.clientRequestId,
          state: 'planning',
          sourceSnapshot: { capturedAt: time, selector: input.source },
          plan: {
            ...input.planSettings,
            title: 'A new coffee story',
            logline: '',
            shots: [],
          },
        },
      };
    } else if (pathname.endsWith('/capabilities') && created) {
      await route.fulfill({
        json: {
          version: 1,
          runId: created.id,
          runRevision: created.config.revision,
          capabilityVersion: 'c'.repeat(64),
          status: 'available',
          requestedModelKey: null,
          effectiveModel: model,
          eligibleModels: [model],
          reasonCode: null,
        },
      });
      return;
    } else if (method === 'PATCH' && pathname.endsWith('/plan') && created) {
      const input = route.request().postDataJSON();
      mutations.push('plan');
      expect(input.expectedRevision).toBe(created.config.revision);
      expect(input.capabilityVersion).toBe('c'.repeat(64));
      created = {
        ...created,
        config: {
          ...created.config,
          revision: created.config.revision + 1,
          plan: input.plan,
          state: 'storyboard',
        },
      };
    } else if (method !== 'GET')
      throw new Error(
        `Unexpected paid or control mutation: ${method} ${pathname}`,
      );
    if (!created) {
      await route.fulfill({ json: { data: [] } });
      return;
    }
    const { id, ...attributes } = created;
    await route.fulfill({
      json: { data: { id, type: 'content-run', attributes } },
    });
  });
  await page.goto(`${base}/new`);
  await page.getByLabel('Brief', { exact: true }).fill('A new coffee story');
  await page.getByLabel('Runtime budget (seconds)', { exact: true }).fill('10');
  await page
    .getByRole('button', { name: 'Save storyboard', exact: true })
    .click();
  await expect(page).toHaveURL(/\/studio\/storyboard\/new-coffee$/);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'A new coffee story',
  );
  await expect(
    page.getByRole('button', { name: 'Add shot', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Add shot', exact: true }).click();
  await page.getByRole('button', { name: 'Add shot', exact: true }).click();
  await expect.poll(() => created?.config.plan.shots.length).toBe(2);
  expect(
    created?.config.plan.shots.map((shot) => shot.durationSeconds),
  ).toEqual([5, 5]);
  await expect(
    page.getByRole('button', { name: 'Approve storyboard', exact: true }),
  ).toBeDisabled();
  expect(mutations.filter((mutation) => mutation === 'create')).toHaveLength(1);
  expect(mutations).toContain('plan');
  expect(
    mutations.every((mutation) => mutation === 'create' || mutation === 'plan'),
  ).toBe(true);
});
