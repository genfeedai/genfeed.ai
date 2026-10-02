import path from 'node:path';
import { brandPath } from '@e2e/utils/app-chrome';
import { IngredientCategory } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Locator, Page, Route } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { buildProtectedAppBootstrapPayload } from '../../utils/api-interceptor';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

/**
 * #5465 Generate video results and composer drafts. The gallery, the
 * transformation endpoint and the draft store are mocked; the assertions
 * cover what the creator sees: a video action run from Generate lands back
 * in the Generate gallery linked to its source, and a typed prompt survives
 * a reload.
 *
 * @module generate-video-actions-drafts.spec
 */

const SOURCE_ID = 'studio-video-source-e2e';
const RESIZED_ID = 'studio-video-resized-e2e';
const EXTENDED_ID = 'studio-video-extended-e2e';
const SOURCE_PROMPT = 'Slow dolly shot across a rain-soaked neon street';
const EXTEND_MODEL_KEY = 'e2e/video-extend-model';
const VIDEO_FIXTURE = path.join(
  process.cwd(),
  'playwright/e2e/fixtures/media/studio-clip.mp4',
);

function videoResource(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    attributes: {
      category: IngredientCategory.VIDEO,
      cdnUrl: `https://cdn.genfeed.ai/mock/${id}.mp4`,
      createdAt: '2026-09-28T10:00:00.000Z',
      height: 1920,
      metadata: { model: 'kling-v3' },
      prompt: SOURCE_PROMPT,
      status: 'GENERATED',
      width: 1080,
      ...overrides,
    },
    id,
    type: 'ingredients',
  };
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status: 200,
  });
}

/** Every mocked clip plays a real (tiny) video, so previews never fall back. */
async function mockVideoMedia(page: Page): Promise<void> {
  await page.route('**/cdn.genfeed.ai/mock/**', async (route) => {
    await route.fulfill({ contentType: 'video/mp4', path: VIDEO_FIXTURE });
  });
}

/** One active, organization-enabled video model, so Extend can confirm. */
async function mockVideoModels(page: Page): Promise<void> {
  const fulfillModels = async (route: Route): Promise<void> => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await fulfillJson(route, {
      data: [
        {
          attributes: {
            category: 'video',
            cost: 10,
            defaultDuration: 5,
            durations: [5],
            isActive: true,
            isDeleted: false,
            key: EXTEND_MODEL_KEY,
            label: 'E2E Video Model',
          },
          id: 'model-video-e2e',
          type: 'models',
        },
      ],
      links: { pagination: { page: 1, pages: 1, total: 1 } },
      meta: { page: 1, pageSize: 50, totalCount: 1 },
    });
  };
  await page.route('**/api.genfeed.ai/v1/models**', fulfillModels);
  await page.route('**/v1/models**', fulfillModels);

  // The prompt bar only exposes models the organization enabled; the
  // protected bootstrap carries those settings.
  const fulfillBootstrap = async (route: Route): Promise<void> => {
    const bootstrap = buildProtectedAppBootstrapPayload();
    await fulfillJson(route, {
      ...bootstrap,
      settings: { ...bootstrap.settings, enabledModelIds: [EXTEND_MODEL_KEY] },
    });
  };
  await page.route('**/api.genfeed.ai/v1/auth/bootstrap**', fulfillBootstrap);
  await page.route('**/v1/auth/bootstrap**', fulfillBootstrap);
}

/**
 * Stored gallery rows. A transformation's child appears once it was
 * requested, pointing back at the source through `parentId`.
 */
async function mockVideoGallery(page: Page): Promise<{
  extendBodies: unknown[];
  resizeBodies: unknown[];
}> {
  const extendBodies: unknown[] = [];
  const resizeBodies: unknown[] = [];

  const fulfillGallery = async (route: Route): Promise<void> => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const { pathname } = new URL(route.request().url());
    if (/\/ingredients\/[^/]+\/(posts|children)$/.test(pathname)) {
      await fulfillJson(route, { data: [] });
      return;
    }

    const rows = [
      ...(extendBodies.length > 0
        ? [
            videoResource(EXTENDED_ID, {
              createdAt: '2026-09-28T10:06:00.000Z',
              parentId: SOURCE_ID,
            }),
          ]
        : []),
      ...(resizeBodies.length > 0
        ? [
            videoResource(RESIZED_ID, {
              createdAt: '2026-09-28T10:05:00.000Z',
              height: 1080,
              parentId: SOURCE_ID,
            }),
          ]
        : []),
      videoResource(SOURCE_ID),
    ];
    await fulfillJson(route, {
      data: rows,
      meta: { page: 1, pageSize: 50, totalCount: rows.length },
    });
  };
  await page.route('**/api.genfeed.ai/v1/ingredients**', fulfillGallery);
  await page.route('**/v1/ingredients**', fulfillGallery);

  const fulfillResize = async (route: Route): Promise<void> => {
    resizeBodies.push(route.request().postDataJSON());
    await fulfillJson(route, {
      data: videoResource(RESIZED_ID, {
        parentId: SOURCE_ID,
        status: 'PROCESSING',
      }),
    });
  };
  await page.route(
    `**/api.genfeed.ai/v1/videos/${SOURCE_ID}/resize`,
    fulfillResize,
  );
  await page.route(`**/v1/videos/${SOURCE_ID}/resize`, fulfillResize);

  // Extend answers with the workflow that renders the continuation.
  const fulfillExtend = async (route: Route): Promise<void> => {
    extendBodies.push(route.request().postDataJSON());
    await fulfillJson(route, {
      data: {
        attributes: { label: `Extend video ${SOURCE_ID}` },
        id: 'workflow-extend-e2e',
        type: 'workflows',
      },
    });
  };
  await page.route(
    `**/api.genfeed.ai/v1/videos/${SOURCE_ID}/extend`,
    fulfillExtend,
  );
  await page.route(`**/v1/videos/${SOURCE_ID}/extend`, fulfillExtend);

  return { extendBodies, resizeBodies };
}

/** A server-side draft store that survives page reloads within the test. */
async function mockDraftStore(page: Page): Promise<{
  saved: () => Record<string, unknown> | null;
}> {
  let stored: Record<string, unknown> | null = null;

  const fulfillDraft = async (route: Route): Promise<void> => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, {
        data: stored
          ? {
              attributes: { ...stored, droppedReferenceIds: [] },
              id: 'draft-e2e',
              type: 'studio-generate-draft',
            }
          : null,
      });
      return;
    }

    stored = route.request().postDataJSON() as Record<string, unknown>;
    await fulfillJson(route, {
      data: {
        attributes: { ...stored, droppedReferenceIds: [] },
        id: 'draft-e2e',
        type: 'studio-generate-draft',
      },
    });
  };
  await page.route(
    '**/api.genfeed.ai/v1/studio-generate-drafts/current**',
    fulfillDraft,
  );
  await page.route('**/v1/studio-generate-drafts/current**', fulfillDraft);

  return { saved: () => stored };
}

async function openGenerate(page: Page): Promise<void> {
  await page.goto(brandPath(APP_ROUTES.STUDIO.GENERATE), {
    waitUntil: 'domcontentloaded',
  });
}

test.describe('Studio Generate — video results and composer drafts', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ height: 900, width: 1440 });
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockVideoMedia(authenticatedPage);
  });

  async function openSourceActions(page: Page) {
    const sourceCard = page.getByTestId(`studio-asset-${SOURCE_ID}`);
    await expect(sourceCard).toBeVisible();
    // The action menu is keyboard-operable: focus reveals it, Enter opens it.
    await sourceCard.getByRole('button', { name: 'More' }).focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    return { menu, sourceCard };
  }

  async function openActionSubmenu(page: Page, parent: Locator, name: string) {
    const trigger = parent.getByRole('menuitem', { exact: true, name });
    await trigger.focus();
    await trigger.press('ArrowRight');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const submenu = page.getByRole('menu', { exact: true, name });
    await expect(submenu).toBeVisible();
    return submenu;
  }

  async function expectLinkedToSource(
    page: Page,
    childId: string,
  ): Promise<void> {
    await expect(page.getByTestId(`studio-asset-${childId}`)).toBeVisible();
    const sourceLink = page.getByTestId(`studio-asset-source-${childId}`);
    await sourceLink.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId(`studio-asset-${SOURCE_ID}`)).toHaveAttribute(
      'data-selected',
      'true',
    );
  }

  test('offers the Library video actions on a Generate video result', async ({
    authenticatedPage,
  }) => {
    await mockDraftStore(authenticatedPage);
    await mockVideoGallery(authenticatedPage);
    await openGenerate(authenticatedPage);

    const { menu } = await openSourceActions(authenticatedPage);
    const transform = await openActionSubmenu(
      authenticatedPage,
      menu,
      'Transform',
    );
    for (const action of ['Extend', 'Upscale']) {
      await expect(
        transform.getByRole('menuitem', { exact: true, name: action }),
      ).toBeVisible();
    }
    const reframe = await openActionSubmenu(
      authenticatedPage,
      transform,
      'Reframe',
    );
    for (const action of [
      'Reframe to Square',
      'Resize to Square',
      'Resize to Landscape',
    ]) {
      await expect(
        reframe.getByRole('menuitem', { exact: true, name: action }),
      ).toBeVisible();
    }
    // The clip is already portrait, so resizing to portrait is not offered.
    await expect(
      reframe.getByRole('menuitem', { name: /Resize to Portrait/ }),
    ).toHaveCount(0);
    await reframe.press('ArrowLeft');
    await expect(reframe).toHaveCount(0);
    const convert = await openActionSubmenu(
      authenticatedPage,
      transform,
      'Convert',
    );
    await expect(
      convert.getByRole('menuitem', { exact: true, name: 'Transform to GIF' }),
    ).toBeVisible();
    await convert.press('ArrowLeft');
    await expect(convert).toHaveCount(0);
    await transform.press('ArrowLeft');
    await expect(transform).toHaveCount(0);
    const library = await openActionSubmenu(authenticatedPage, menu, 'Library');
    await expect(
      library.getByRole('menuitem', { exact: true, name: 'Open in Editor' }),
    ).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('extends a video from Generate and shows the result linked to its source', async ({
    authenticatedPage,
  }) => {
    await mockDraftStore(authenticatedPage);
    await mockVideoModels(authenticatedPage);
    const { extendBodies } = await mockVideoGallery(authenticatedPage);
    await openGenerate(authenticatedPage);

    const { menu } = await openSourceActions(authenticatedPage);
    const transform = await openActionSubmenu(
      authenticatedPage,
      menu,
      'Transform',
    );
    await transform
      .getByRole('menuitem', { exact: true, name: 'Extend' })
      .click();
    const dialog = authenticatedPage.getByRole('dialog');
    await expect(dialog.getByText('Extend Video')).toBeVisible();
    await dialog.getByRole('button', { exact: true, name: 'Extend' }).click();

    await expect
      .poll(() => extendBodies)
      .toEqual([expect.objectContaining({ model: EXTEND_MODEL_KEY })]);
    await expectLinkedToSource(authenticatedPage, EXTENDED_ID);
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('resizes a video from Generate and shows the result linked to its source', async ({
    authenticatedPage,
  }) => {
    await mockDraftStore(authenticatedPage);
    const { resizeBodies } = await mockVideoGallery(authenticatedPage);
    await openGenerate(authenticatedPage);

    const { menu } = await openSourceActions(authenticatedPage);
    const transform = await openActionSubmenu(
      authenticatedPage,
      menu,
      'Transform',
    );
    const reframe = await openActionSubmenu(
      authenticatedPage,
      transform,
      'Reframe',
    );
    await reframe
      .getByRole('menuitem', { exact: true, name: 'Resize to Square' })
      .click();

    await expect
      .poll(() => resizeBodies)
      .toEqual([{ height: 1080, width: 1080 }]);
    await expectLinkedToSource(authenticatedPage, RESIZED_ID);
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('restores a typed prompt after a reload', async ({
    authenticatedPage,
  }) => {
    const draftStore = await mockDraftStore(authenticatedPage);
    await mockVideoGallery(authenticatedPage);
    await openGenerate(authenticatedPage);

    const promptEditor = authenticatedPage.getByRole('textbox', {
      name: 'Prompt',
    });
    await expect(promptEditor).toBeVisible();
    await promptEditor.click();
    await authenticatedPage.keyboard.type('A lighthouse at dawn, drone orbit');

    await expect(
      authenticatedPage.getByTestId('studio-draft-status'),
    ).toHaveText('Draft saved');
    expect(draftStore.saved()).toMatchObject({
      prompt: 'A lighthouse at dawn, drone orbit',
    });

    await authenticatedPage.reload({ waitUntil: 'domcontentloaded' });

    await expect(
      authenticatedPage.getByRole('textbox', { name: 'Prompt' }),
    ).toContainText('A lighthouse at dawn, drone orbit');
    await expectNoErrorOverlay(authenticatedPage);
  });
});
