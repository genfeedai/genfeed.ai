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
import {
  createAuthenticatedPage,
  expect,
  test,
} from '../../fixtures/auth.fixture';

// biome-ignore lint/suspicious/noUndeclaredEnvVars: this direct Playwright visual fixture input is outside Turbo caching.
const previewFixtureDirectory = process.env.STORYBOARD_PREVIEW_FIXTURE_DIR;
async function previewResponse(file: string) {
  if (/^coffee-clip-[12]\.mp4$/.test(file)) {
    // Reuse the repository's decodable one-second clip for a paused preview.
    // Timeline timings below are server-fixture values, not provider-duration evidence.
    return {
      body: await readFile(
        path.join(
          process.cwd(),
          'playwright/e2e/fixtures/media/studio-clip.mp4',
        ),
      ),
      contentType: 'video/mp4',
    };
  }
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
  await createAuthenticatedPage(page, page.context(), {
    organizationId: 'org-1',
    userId: 'user-1',
  });
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
          ingredientUrl: `https://cdn.genfeed.ai/fixture/${id}.mp4`,
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
  await createAuthenticatedPage(page, page.context(), {
    organizationId: 'org-1',
    userId: 'user-1',
  });
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

test('recovers routed sidebar and Back edits, lost acknowledgements and explicit concurrent choices without paid operations', async ({
  authenticatedPage: page,
}, testInfo) => {
  test.setTimeout(180_000);
  await createAuthenticatedPage(page, page.context(), {
    organizationId: 'org-1',
    userId: 'user-1',
  });
  let current = structuredClone(run);
  const mutations: { path: string; revision: number }[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  let outcome: 'normal' | 'lost' | 'conflict' = 'normal';
  let hold = false;
  let release: (() => void) | undefined;
  await page.route(
    '**/brands/brand-1/storyboard-runs/draft-coffee**',
    async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const method = route.request().method();
      if (pathname.endsWith('/capabilities')) {
        await route.fulfill({
          json: {
            version: 1,
            runId: current.id,
            runRevision: current.config.revision,
            capabilityVersion: 'b'.repeat(64),
            status: 'available',
            requestedModelKey: null,
            effectiveModel: model,
            eligibleModels: [model],
            reasonCode: null,
          },
        });
        return;
      }
      if (method !== 'GET') {
        const input = route.request().postDataJSON();
        if (!pathname.endsWith('/plan') && !pathname.endsWith('/source'))
          throw new Error(
            `Unexpected paid or control operation: ${method} ${pathname}`,
          );
        mutations.push({ path: pathname, revision: input.expectedRevision });
        if (outcome === 'conflict') {
          outcome = 'normal';
          current = {
            ...current,
            config: {
              ...current.config,
              revision: current.config.revision + 1,
              plan: { ...current.config.plan, title: 'Concurrent saved title' },
            },
          };
        }
        if (input.expectedRevision !== current.config.revision) {
          await route.fulfill({
            status: 409,
            json: {
              errors: [
                {
                  status: '409',
                  code: 'STORYBOARD_REVISION_CONFLICT',
                  detail: 'Storyboard changed.',
                },
              ],
            },
          });
          return;
        }
        current = {
          ...current,
          config: {
            ...current.config,
            revision: current.config.revision + 1,
            ...(pathname.endsWith('/plan')
              ? { plan: input.plan }
              : {
                  sourceSnapshot: { selector: input.source, capturedAt: time },
                  plan: {
                    ...current.config.plan,
                    shots: current.config.plan.shots.map((shot) => ({
                      ...shot,
                      stillFreshness: 'stale' as const,
                    })),
                  },
                }),
          },
        };
        if (hold) {
          hold = false;
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        if (outcome === 'lost') {
          outcome = 'normal';
          await route.abort('failed');
          return;
        }
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
                    ? 'Morning coffee'
                    : 'Coffee and pastry',
              },
            },
          },
        },
      });
    },
  );
  await page.route('**/cdn.genfeed.ai/fixture/**', async (route) => {
    const file =
      new URL(route.request().url()).pathname.split('/').at(-1) ?? '';
    await route.fulfill(await previewResponse(file));
  });
  await page.goto(`${base}/draft-coffee`);
  const title = page.getByLabel('Title', { exact: true });
  await expect(title).toHaveValue(run.config.plan.title);
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  const sidebar = page
    .locator('a[href="/test-org/brand-1/studio/generate"]')
    .first();
  await expect(sidebar).toBeVisible();
  await title.fill('Saved through sidebar navigation');
  await sidebar.click();
  await expect(page).toHaveURL(/\/studio\/generate/);
  await expect
    .poll(() => current.config.plan.title)
    .toBe('Saved through sidebar navigation');
  await page.goBack();
  await expect(title).toHaveValue('Saved through sidebar navigation');

  // An edit made after dispatch stays queued after detachment; no route-owned abort drops it.
  hold = true;
  await title.fill('First in-flight title');
  await expect
    .poll(() => current.config.plan.title)
    .toBe('First in-flight title');
  await title.fill('Latest edit while saving');
  await sidebar.click();
  release?.();
  await expect
    .poll(() => current.config.plan.title)
    .toBe('Latest edit while saving');
  await page.goBack();
  await expect(title).toHaveValue('Latest edit while saving');
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();

  outcome = 'lost';
  const writesBeforeLost = mutations.length;
  await title.fill('Committed with lost response');
  await expect
    .poll(() => current.config.plan.title)
    .toBe('Committed with lost response');
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  expect(mutations.length).toBe(writesBeforeLost + 1);

  outcome = 'conflict';
  await title.fill('My concurrent title');
  await expect(
    page.getByText('Review concurrent edits', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Approve storyboard', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Save resolved changes', exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath('storyboard-concurrent-review.png'),
    fullPage: true,
  });
  await expect(
    page.getByRole('dialog', { name: 'Request failed', exact: true }),
  ).toHaveCount(0);
  const writesBeforeReopen = mutations.length;
  await page.getByRole('radio', { name: 'Your edit', exact: true }).click();
  await sidebar.click();
  await page.goBack();
  await expect(
    page.getByText('Review concurrent edits', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('radio', { name: 'Your edit', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByRole('button', { name: 'Approve storyboard', exact: true }),
  ).toBeDisabled();
  expect(mutations.length).toBe(writesBeforeReopen);
  await page.reload();
  await expect(
    page.getByText('Review concurrent edits', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('radio', { name: 'Your edit', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  expect(mutations.length).toBe(writesBeforeReopen);

  await page
    .getByRole('button', { name: 'Save resolved changes', exact: true })
    .click();
  await expect
    .poll(() => current.config.plan.title)
    .toBe('My concurrent title');
  await expect(
    page.getByText('Review concurrent edits', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();

  // Source and plan share one sequence and carry source-induced freshness forward.
  await page
    .getByLabel('Brief', { exact: true })
    .fill('An edited coffee brief');
  await title.fill('Plan after source edit');
  await expect
    .poll(() => current.config.plan.title)
    .toBe('Plan after source edit');
  expect(current.config.sourceSnapshot.selector).toEqual({
    kind: 'brief',
    brief: 'An edited coffee brief',
  });
  expect(
    current.config.plan.shots.every((shot) => shot.stillFreshness === 'stale'),
  ).toBe(true);
  expect(
    mutations.slice(-2).map((mutation) => mutation.path.split('/').at(-1)),
  ).toEqual(['source', 'plan']);
  expect(mutations.at(-1)?.revision).toBe(
    (mutations.at(-2)?.revision ?? 0) + 1,
  );
  expect(pageErrors).toEqual([]);
  await expect(page.locator('nextjs-portal')).not.toContainText(/error/i);
});

test('requires decoded still responses and permits a loaded shot while a 404, 403 or decode failure blocks full playback', async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(120_000);
  await createAuthenticatedPage(page, page.context(), {
    organizationId: 'org-1',
    userId: 'user-1',
  });
  let failure: '404' | '403' | 'decode' | undefined = '404';
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(
    '**/brands/brand-1/storyboard-runs/draft-coffee**',
    async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      expect(route.request().method()).toBe('GET');
      if (pathname.endsWith('/capabilities')) {
        await route.fulfill({
          json: {
            version: 1,
            runId: run.id,
            runRevision: run.config.revision,
            capabilityVersion: 'b'.repeat(64),
            status: 'available',
            requestedModelKey: null,
            effectiveModel: model,
            eligibleModels: [model],
            reasonCode: null,
          },
        });
        return;
      }
      const { id, ...attributes } = run;
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
              metadata: { label: 'Coffee still' },
            },
          },
        },
      });
    },
  );
  await page.route('**/cdn.genfeed.ai/fixture/**', async (route) => {
    const file =
      new URL(route.request().url()).pathname.split('/').at(-1) ?? '';
    if (file === 'coffee-close.jpg' && failure) {
      await route.fulfill(
        failure === 'decode'
          ? {
              status: 200,
              headers: { 'cache-control': 'no-store' },
              contentType: 'image/jpeg',
              body: 'This response cannot decode as an image.',
            }
          : {
              status: Number(failure),
              headers: { 'cache-control': 'no-store' },
              body: 'Preview unavailable',
            },
      );
      return;
    }
    await route.fulfill(await previewResponse(file));
  });
  for (const failed of ['404', '403', 'decode'] as const) {
    failure = failed;
    await page.goto(`${base}/draft-coffee`);
    const animatic = page.getByRole('region', {
      name: 'Storyboard animatic',
      exact: true,
    });
    await expect(
      animatic.getByRole('button', { name: 'Play shot 1', exact: true }),
    ).toBeEnabled();
    await expect(
      animatic.getByText('Shot 2: Still preview unavailable', { exact: true }),
    ).toBeVisible();
    await expect(
      animatic.getByRole('button', { name: 'Play storyboard', exact: true }),
    ).toBeDisabled();
    await expect(
      animatic.getByRole('button', { name: 'Play shot 2', exact: true }),
    ).toBeDisabled();
    const image = animatic.getByRole('img', { name: 'Shot 1', exact: true });
    await expect
      .poll(() =>
        image.evaluate(async (element) => {
          const img = element as HTMLImageElement;
          await img.decode();
          return img.naturalWidth > 0 && img.naturalHeight > 0;
        }),
      )
      .toBe(true);
    await animatic
      .getByRole('button', { name: 'Play shot 1', exact: true })
      .click();
    await expect(
      animatic.getByRole('button', { name: 'Pause', exact: true }),
    ).toBeVisible();
    await animatic.getByRole('button', { name: 'Pause', exact: true }).click();
    const clock = animatic.getByText(/\d\d:\d\d \/ \d\d:\d\d/);
    const paused = await clock.textContent();
    await page.waitForTimeout(250);
    await expect(clock).toHaveText(paused ?? '');
    failure = undefined;
    await animatic
      .getByRole('button', { name: 'Retry shot 2 still preview', exact: true })
      .click();
    await expect(
      animatic.getByRole('button', { name: 'Play storyboard', exact: true }),
    ).toBeEnabled();
  }
  expect(pageErrors).toEqual([]);
});
