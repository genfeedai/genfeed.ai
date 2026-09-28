import { brandPath } from '@e2e/utils/app-chrome';
import { IngredientCategory } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page, Route } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
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
const SOURCE_PROMPT = 'Slow dolly shot across a rain-soaked neon street';

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

/** Stored gallery rows; the resize child appears once it was requested. */
async function mockVideoGallery(page: Page): Promise<{
  resizeBodies: unknown[];
}> {
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

    const rows =
      resizeBodies.length > 0
        ? [
            videoResource(RESIZED_ID, {
              createdAt: '2026-09-28T10:05:00.000Z',
              height: 1080,
              parentId: SOURCE_ID,
            }),
            videoResource(SOURCE_ID),
          ]
        : [videoResource(SOURCE_ID)];
    await fulfillJson(route, {
      data: rows,
      meta: { page: 1, pageSize: 50, totalCount: rows.length },
    });
  };
  await page.route('**/api.genfeed.ai/v1/ingredients**', fulfillGallery);
  await page.route('**/v1/ingredients**', fulfillGallery);

  const fulfillResize = async (route: Route): Promise<void> => {
    resizeBodies.push(route.request().postDataJSON());
    await fulfillJson(
      route,
      videoResource(RESIZED_ID, {
        parentId: SOURCE_ID,
        status: 'PROCESSING',
      }),
    );
  };
  await page.route(
    `**/api.genfeed.ai/v1/videos/${SOURCE_ID}/resize`,
    fulfillResize,
  );
  await page.route(`**/v1/videos/${SOURCE_ID}/resize`, fulfillResize);

  return { resizeBodies };
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
    '**/api.genfeed.ai/v1/studio-generate-drafts/current',
    fulfillDraft,
  );
  await page.route('**/v1/studio-generate-drafts/current', fulfillDraft);

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
  });

  test('runs a video action from Generate and shows the result linked to its source', async ({
    authenticatedPage,
  }) => {
    await mockDraftStore(authenticatedPage);
    const { resizeBodies } = await mockVideoGallery(authenticatedPage);
    await openGenerate(authenticatedPage);

    const sourceCard = authenticatedPage.getByTestId(
      `studio-asset-${SOURCE_ID}`,
    );
    await expect(sourceCard).toBeVisible();

    // The action menu is keyboard-operable: focus reveals it, Enter opens it.
    const moreActions = sourceCard.getByRole('button', { name: 'More' });
    await moreActions.focus();
    await authenticatedPage.keyboard.press('Enter');
    const menu = authenticatedPage.getByRole('menu');
    for (const action of [
      'Extend',
      'Upscale',
      'Transform to GIF',
      'Open in Editor',
      'Resize to Square',
      'Resize to Landscape',
    ]) {
      await expect(
        menu.getByRole('menuitem', { name: new RegExp(action) }),
      ).toBeVisible();
    }
    await menu.getByRole('menuitem', { name: /Resize to Square/ }).click();

    await expect
      .poll(() => resizeBodies)
      .toEqual([{ height: 1080, width: 1080 }]);

    const resizedCard = authenticatedPage.getByTestId(
      `studio-asset-${RESIZED_ID}`,
    );
    await expect(resizedCard).toBeVisible();
    const sourceLink = authenticatedPage.getByTestId(
      `studio-asset-source-${RESIZED_ID}`,
    );
    await sourceLink.focus();
    await authenticatedPage.keyboard.press('Enter');

    await expect(sourceCard).toHaveAttribute('data-selected', 'true');
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
